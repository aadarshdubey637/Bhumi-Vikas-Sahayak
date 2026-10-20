"""FastAPI dependencies: settings, DB session, authentication, shared rule store."""
from __future__ import annotations

import logging
import threading
import time
from collections.abc import Iterator
from typing import Annotated

from fastapi import Depends, FastAPI, Request
from fastapi.security import APIKeyHeader
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.core.config import Settings
from app.core.exceptions import AppError, Unauthorized
from app.core.security import Principal, authenticate
from app.repositories.rule_repository import build_store
from app.services.hybrid_retrieval_service import HybridRetriever, make_retriever
from app.services.llm_service import LLMProvider
from app.services.retrieval_service import RuleStore

_api_key_header = APIKeyHeader(name="X-API-Key", auto_error=False, description="Required when AUTH_MODE=api_key")


def get_settings_dep(request: Request) -> Settings:
    return request.app.state.settings


def get_db(request: Request) -> Iterator[Session]:
    """Session per request. Endpoints commit explicitly; anything uncommitted is rolled back on close."""
    session = request.app.state.session_factory()
    try:
        yield session
    finally:
        session.close()


SESSION_COOKIE = "ns_session"
_SAFE_METHODS = {"GET", "HEAD", "OPTIONS"}


def require_xhr(request: Request) -> None:
    """CSRF guard for cookie-authenticated, state-changing requests: browsers only let same-origin or CORS-approved scripts add this
    header, a form or image on another website cannot."""
    if request.headers.get("x-requested-with") != "nirmaansetu":
        raise AppError("missing X-Requested-With header", code="forbidden", status_code=403)


def get_principal(request: Request, settings: Annotated[Settings, Depends(get_settings_dep)], db: Annotated[Session, Depends(get_db)],
                  api_key: Annotated[str | None, Depends(_api_key_header)] = None) -> Principal:
    from app.services.auth_service import user_for_token  # local import: models are only needed once a cookie is present

    token = request.cookies.get(SESSION_COOKIE)
    user = user_for_token(db, token) if token else None
    if user is not None and request.method not in _SAFE_METHODS:
        require_xhr(request)
    return authenticate(settings, api_key, user.id if user else None)


def require_user(principal: Annotated[Principal, Depends(get_principal)]) -> Principal:
    """Routes that store or read an account's own data. Guests (AUTH_MODE=accounts, not signed in) get 401."""
    if principal.guest:
        raise Unauthorized("sign in to use this feature")
    return principal


_RELOAD_EVERY_SECONDS = 3.0
_reload_lock = threading.Lock()


def refresh_store_if_missing(request_or_app: Request | FastAPI) -> None:
    """The search index is built once at start-up. If the server started before the rules were ingested (or the database was
    recreated), it would stay empty until restarted. While no store is loaded, retry from the database at most every few seconds,
    so loading the rules makes a running server pick them up with no restart. A no-op once a store exists."""
    app = request_or_app.app if isinstance(request_or_app, Request) else request_or_app
    st = app.state
    if st.store is not None:
        return
    with _reload_lock:
        now = time.monotonic()
        if st.store is not None or now - getattr(st, "store_last_try", 0.0) < _RELOAD_EVERY_SECONDS:
            return
        st.store_last_try = now
        try:
            with st.session_factory() as s:
                store = build_store(s)
        except SQLAlchemyError:
            return  # database not migrated/reachable yet: /ready reports it, try again later
        if store is not None:
            st.store, st.retriever = store, make_retriever(store, st.settings)
            logging.getLogger("app").info("rule store loaded after start-up", extra={"event": "store_loaded_late"})


def get_store(request: Request) -> RuleStore | None:
    refresh_store_if_missing(request)
    return request.app.state.store


def get_retriever(request: Request) -> HybridRetriever | None:
    refresh_store_if_missing(request)
    return request.app.state.retriever


def get_llm(request: Request) -> LLMProvider:
    return request.app.state.llm


DB = Annotated[Session, Depends(get_db)]
Auth = Annotated[Principal, Depends(get_principal)]
User = Annotated[Principal, Depends(require_user)]
Store = Annotated[RuleStore | None, Depends(get_store)]
Cfg = Annotated[Settings, Depends(get_settings_dep)]
