"""Hosting/deployment behaviour: DATABASE_URL normalisation, CORS parsing, the 504 path, the root route."""
from __future__ import annotations

import asyncio

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.core.config import Settings, normalize_database_url
from app.core.middleware import RequestContextMiddleware, TimeoutMiddleware
from app.db.session import make_engine
from tests.conftest import make_client

PROD = {"APP_ENV": "production", "AUTH_MODE": "api_key", "API_KEY_HASHES": "a:" + "0" * 64,
        "DATABASE_URL": "postgresql://u:p@h:5432/d", "CORS_ORIGINS": "https://app.example.com"}


@pytest.mark.parametrize("raw,expected", [
    ("postgres://u:p@h:5432/d", "postgresql+psycopg://u:p@h:5432/d"),
    ("postgresql://u:p@h:5432/d?sslmode=require", "postgresql+psycopg://u:p@h:5432/d?sslmode=require"),
    ("postgresql+psycopg://u:p@h/d", "postgresql+psycopg://u:p@h/d"),
    ("sqlite:///./x.db", "sqlite:///./x.db"),
    ("  postgres://u:p@h/d  ", "postgresql+psycopg://u:p@h/d"),
])
def test_normalize_database_url(raw, expected):
    assert normalize_database_url(raw) == expected


def test_settings_and_engine_accept_render_style_url():
    s = Settings.from_env({**PROD})
    assert s.database_url == "postgresql+psycopg://u:p@h:5432/d"
    assert make_engine("postgres://u:p@localhost:1/d").dialect.driver == "psycopg"  # lazy: no connection is made


def test_cors_origin_trailing_slash_is_stripped():
    s = Settings.from_env({"CORS_ORIGINS": "https://a.example.com/, http://localhost:5173"})
    assert s.cors_origins == ["https://a.example.com", "http://localhost:5173"]


def test_production_rejects_unanchored_cors_regex():
    with pytest.raises(ValidationError):
        Settings.from_env({**PROD, "CORS_ORIGIN_REGEX": r"https://.*\.example\.com"})
    assert Settings.from_env({**PROD, "CORS_ORIGIN_REGEX": r"^https://[a-z0-9-]+\.example\.com$"}).cors_origin_regex


def test_anthropic_requires_non_blank_key():
    for blank in ("", "   "):
        with pytest.raises(ValidationError):
            Settings(llm_provider="anthropic", anthropic_api_key=blank, _env_file=None)


def test_env_example_loads_cleanly(monkeypatch):
    """`cp .env.example .env` must yield a valid development configuration."""
    from pathlib import Path
    for name in ("APP_ENV", "DATABASE_URL", "CORS_ORIGINS", "CORS_ORIGIN_REGEX", "AUTH_MODE", "API_KEY_HASHES", "LLM_PROVIDER",
                 "ANTHROPIC_API_KEY"):
        monkeypatch.delenv(name, raising=False)
    s = Settings(_env_file=Path(__file__).resolve().parents[2] / ".env.example")
    assert s.env == "development" and s.auth_mode == "none" and s.cors_origin_regex is None
    assert s.cors_origins == ["http://localhost:5173"] and s.database_url.startswith("sqlite")


def test_cors_regex_origin_allowed_and_unknown_rejected(db_engine):
    env = {"CORS_ORIGINS": "https://app.example.com", "CORS_ORIGIN_REGEX": r"^https://pr-\d+\.example\.com$"}
    with make_client(db_engine, env) as c:
        def pre(origin):
            return c.options("/api/v1/ask", headers={"Origin": origin, "Access-Control-Request-Method": "POST"})
        assert pre("https://app.example.com").headers["access-control-allow-origin"] == "https://app.example.com"
        assert pre("https://pr-12.example.com").headers["access-control-allow-origin"] == "https://pr-12.example.com"
        assert "access-control-allow-origin" not in pre("https://evil.example.com").headers


def test_root_route(db_engine):
    with make_client(db_engine) as c:
        r = c.get("/")
        assert r.status_code == 200 and r.json()["api_base"] == "/api/v1"


def test_timeout_returns_504_with_single_request_id_header():
    app = FastAPI()

    @app.get("/slow")
    async def slow():
        await asyncio.sleep(2)

    app.add_middleware(TimeoutMiddleware, seconds=0.2)
    app.add_middleware(RequestContextMiddleware, max_body_bytes=1024)
    r = TestClient(app).get("/slow")
    assert r.status_code == 504 and r.json()["code"] == "timeout"
    assert len(r.headers.get_list("x-request-id")) == 1
    assert r.headers["x-request-id"] == r.json()["request_id"]
