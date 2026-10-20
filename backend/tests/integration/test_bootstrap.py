"""A plain `uvicorn` start must work on a fresh checkout in development: migrate + load the shipped rules by itself."""
from __future__ import annotations

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, inspect, text

from app.core.config import Settings
from app.main import create_app


def test_auto_flags_resolve_by_environment(tmp_path):
    file_db = f"sqlite:///{tmp_path / 'x.db'}"
    assert Settings.from_env({"DATABASE_URL": file_db}).should_auto_migrate is True       # development + sqlite file
    assert Settings.from_env({"DATABASE_URL": file_db}).should_auto_ingest is True
    assert Settings.from_env({"DATABASE_URL": "sqlite://"}).should_auto_migrate is False  # in-memory (tests)
    assert Settings.from_env({"DATABASE_URL": file_db, "APP_ENV": "test"}).should_auto_ingest is False
    assert Settings.from_env({"DATABASE_URL": file_db, "AUTO_MIGRATE": "false"}).should_auto_migrate is False  # explicit override wins
    prod = Settings.from_env({"APP_ENV": "production", "DATABASE_URL": "postgresql://u:p@h/d", "AUTH_MODE": "api_key",
                              "API_KEY_HASHES": "a:" + "0" * 64, "CORS_ORIGINS": "https://a.example"})
    assert prod.should_auto_migrate is False and prod.should_auto_ingest is False         # production stays explicit


@pytest.mark.real_corpus
def test_fresh_database_prepares_itself_and_becomes_ready(tmp_path):
    url = f"sqlite:///{tmp_path / 'fresh.db'}"
    with TestClient(create_app(Settings.from_env({"DATABASE_URL": url}))) as c:   # no alembic, no ingest by hand
        r = c.get("/api/v1/ready")
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["status"] == "ready" and body["rules_loaded"] == 106 and body["checks"]["schema_current"] is True
        assert c.post("/api/v1/ask", json={"question": "What is Rule 26-B about?"}).json()["evidence"]


@pytest.mark.real_corpus
def test_old_database_at_previous_revision_is_upgraded(tmp_path):
    """The exact 'schema is not at the latest migration' situation: a database created before a newer migration existed."""
    from alembic import command

    from app.db.migrate import alembic_config
    url = f"sqlite:///{tmp_path / 'old.db'}"
    command.upgrade(alembic_config(url), "0001")
    with create_engine(url).connect() as conn:
        assert "channel_log" not in inspect(conn).get_table_names()
    with TestClient(create_app(Settings.from_env({"DATABASE_URL": url}))) as c:
        body = c.get("/api/v1/ready").json()
        assert body["status"] == "ready" and body["checks"]["schema_current"] is True
    with create_engine(url).connect() as conn:
        assert "channel_log" in inspect(conn).get_table_names()
        assert conn.execute(text("select version_num from alembic_version")).scalar() == "0003"
        assert {"users", "user_sessions", "password_resets"} <= set(inspect(conn).get_table_names())
