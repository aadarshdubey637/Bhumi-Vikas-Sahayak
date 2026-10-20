from __future__ import annotations

from datetime import UTC, datetime

from alembic.script import ScriptDirectory
from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse
from sqlalchemy import inspect, text

from app.api.deps import refresh_store_if_missing
from app.db.migrate import alembic_config
from app.schemas.api import HealthOut, ReadyOut

router = APIRouter(tags=["health"])
APP_VERSION = "0.2.0"


@router.get("/health", response_model=HealthOut, summary="Liveness probe")
def health() -> HealthOut:
    return HealthOut(status="ok", version=APP_VERSION, time=datetime.now(UTC).isoformat())


@router.get("/ready", response_model=ReadyOut, responses={503: {"model": ReadyOut}}, summary="Readiness probe")
def ready(request: Request):
    """Database reachable and migrated to head. Exposes booleans only (no hostnames, URLs or error text)."""
    refresh_store_if_missing(request)
    st = request.app.state
    checks = {"database": False, "schema_current": False, "rules_loaded": st.store is not None}
    notes: list[str] = []
    try:
        with st.engine.connect() as conn:
            conn.execute(text("SELECT 1"))
            checks["database"] = True
            if "alembic_version" in inspect(conn).get_table_names():
                cur = conn.execute(text("SELECT version_num FROM alembic_version")).scalar()
                checks["schema_current"] = cur == ScriptDirectory.from_config(alembic_config(str(st.engine.url))).get_current_head()
    except Exception:
        notes.append("database check failed")
    if checks["database"] and not checks["schema_current"]:
        notes.append("schema is not at the latest migration: run 'alembic upgrade head'")
    if not checks["rules_loaded"]:
        notes.append("no rules ingested: search returns no data until 'python -m scripts.ingest_jsonl --load-db' is run")
    ok = checks["database"] and checks["schema_current"]
    body = ReadyOut(status="ready" if ok else "not_ready", checks=checks,
                    rules_loaded=len(st.store.records) if st.store else 0, notes=notes)
    return JSONResponse(status_code=200 if ok else 503, content=body.model_dump())
