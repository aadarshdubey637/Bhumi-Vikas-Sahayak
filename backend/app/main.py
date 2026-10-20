"""NirmaanSetu AI backend - application factory."""
from __future__ import annotations

import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import Engine
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session, sessionmaker

from app.api.router import api_router
from app.api.v1.health import APP_VERSION
from app.core.config import Settings, get_settings
from app.core.exceptions import install_handlers
from app.core.logging import configure_logging
from app.core.middleware import RateLimitMiddleware, RequestContextMiddleware, TimeoutMiddleware
from app.db.session import make_engine, make_session_factory
from app.repositories.rule_repository import build_store
from app.services.hybrid_retrieval_service import make_retriever
from app.services.llm_service import make_provider
from app.services.retrieval_service import RuleStore

log = logging.getLogger("app")

DESCRIPTION = """Evidence-first building-regulation intelligence for the Madhya Pradesh Bhumi Vikas Rules, 2012.

**Not an official approval system.** Answers point to cited rule text and carry an explicit status
(`supported`, `conditional`, `insufficient_information`, `not_established`, `source_conflict`, `pending_verification`).
No response is a compliance determination."""


def load_store(session_factory: sessionmaker[Session]) -> RuleStore | None:
    try:
        with session_factory() as s:
            return build_store(s)
    except SQLAlchemyError:
        log.error("could not build rule store (is the database migrated?)", extra={"event": "store_build_failed"})
        return None


def create_app(settings: Settings | None = None, engine: Engine | None = None, store: RuleStore | None = None) -> FastAPI:
    settings = settings or get_settings()
    configure_logging(settings.log_level)
    engine = engine or make_engine(settings.database_url)
    factory = make_session_factory(engine)

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        from app.db.bootstrap import prepare_database
        prepare_database(factory, settings)  # dev: migrate + load the shipped rules; no-op in production/tests (see Settings)
        app.state.store = store if store is not None else load_store(factory)
        app.state.retriever = _make_retriever(app.state.store, settings)
        log.info("startup complete", extra={"event": "startup"})
        yield
        engine.dispose()

    app = FastAPI(title="NirmaanSetu AI", version=APP_VERSION, description=DESCRIPTION, lifespan=lifespan,
                  docs_url="/docs", redoc_url="/redoc", openapi_url="/openapi.json")
    app.state.settings, app.state.engine, app.state.session_factory = settings, engine, factory
    app.state.store, app.state.retriever, app.state.llm = store, None, make_provider(settings)
    if store is not None:  # injected (tests): lifespan also keeps it, but make it available without lifespan too
        app.state.retriever = _make_retriever(store, settings)
    from app.channels.service import ChannelService
    app.state.channels = ChannelService(app, settings)
    install_handlers(app)
    app.include_router(api_router)

    @app.get("/", include_in_schema=False)
    def root() -> dict[str, str]:
        """Landing response so a bare hit on the service URL (browser, Render) is not a 404."""
        return {"service": "NirmaanSetu AI", "version": APP_VERSION, "api_base": "/api/v1", "docs": "/docs", "health": "/api/v1/health"}

    # outermost last: CORS -> request context -> rate limit -> timeout -> app
    app.add_middleware(TimeoutMiddleware, seconds=settings.request_timeout_seconds)
    app.add_middleware(RateLimitMiddleware, per_minute=settings.rate_limit_per_minute,
                       valid_key_digests=frozenset(settings.api_key_map))
    app.add_middleware(RequestContextMiddleware, max_body_bytes=settings.max_request_bytes)
    app.add_middleware(CORSMiddleware, allow_origins=settings.cors_origins, allow_origin_regex=settings.cors_origin_regex,
                       allow_methods=["GET", "POST", "PATCH", "OPTIONS"],
                       allow_headers=["Content-Type", "X-API-Key", "X-Request-ID", "X-Requested-With"],
                       expose_headers=["X-Request-ID", "Retry-After"], allow_credentials=True, max_age=600)
    return app


_make_retriever = make_retriever  # kept for callers/tests that import the old private name


def app_factory() -> FastAPI:
    """Entry point for ``uvicorn app.main:app_factory --factory``."""
    return create_app()
