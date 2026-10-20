"""Alembic: upgrade/downgrade on SQLite, no drift vs models, PostgreSQL DDL, and a live PostgreSQL when available."""
import pytest
from alembic import command
from alembic.autogenerate import compare_metadata
from alembic.migration import MigrationContext
from sqlalchemy import create_engine, inspect
from sqlalchemy.dialects import postgresql
from sqlalchemy.schema import CreateIndex, CreateTable

import app.models  # noqa: F401
from app.db.base import Base
from app.db.migrate import alembic_config, upgrade_to_head

EXPECTED = {"source_documents", "rules", "rule_versions", "rule_chunks", "amendments", "rule_amendment_links", "rule_tables",
            "rule_dependencies", "projects", "project_inputs", "assessments", "assessment_evidence", "feedback",
            "conversations", "ingestion_runs"}


def test_sqlite_upgrade_downgrade_upgrade(tmp_path):
    url = f"sqlite:///{tmp_path / 'm.db'}"
    upgrade_to_head(url)
    eng = create_engine(url)
    assert set(inspect(eng).get_table_names()) >= EXPECTED
    command.downgrade(alembic_config(url), "base")
    assert not (EXPECTED & set(inspect(create_engine(url)).get_table_names()))
    upgrade_to_head(url)
    assert set(inspect(create_engine(url)).get_table_names()) >= EXPECTED


def test_migration_matches_models_no_drift(tmp_path):
    url = f"sqlite:///{tmp_path / 'd.db'}"
    upgrade_to_head(url)
    with create_engine(url).connect() as conn:
        diff = compare_metadata(MigrationContext.configure(conn, opts={"compare_type": True}), Base.metadata)
    assert diff == [], f"models and migration have drifted: {diff}"


def test_schema_compiles_for_postgresql():
    dialect = postgresql.dialect()
    ddl = "\n".join(str(CreateTable(t).compile(dialect=dialect)) for t in Base.metadata.sorted_tables)
    idx = "\n".join(str(CreateIndex(i).compile(dialect=dialect)) for t in Base.metadata.sorted_tables for i in t.indexes)
    assert "CREATE TABLE rule_versions" in ddl and "JSON" in ddl and idx


@pytest.mark.postgres
def test_live_postgresql_migration_and_import(tmp_path):
    pgserver = pytest.importorskip("pgserver")
    srv = pgserver.get_server(tmp_path / "pg", cleanup_mode="stop")
    try:
        url = srv.get_uri().replace("postgresql://", "postgresql+psycopg://")
        upgrade_to_head(url)
        eng = create_engine(url)
        assert set(inspect(eng).get_table_names()) >= EXPECTED
        with eng.connect() as conn:  # no drift on PostgreSQL either
            assert compare_metadata(MigrationContext.configure(conn, opts={"compare_type": True}), Base.metadata) == []
        from app.db.session import make_session_factory
        from app.ingestion.jsonl import ingest_jsonl
        from app.repositories import rule_repository as repo
        from tests.conftest import SYN_JSONL
        records, _ = ingest_jsonl(SYN_JSONL)
        with make_session_factory(eng)() as s:
            doc = repo.get_or_create_source_document(s, "SYN", title="SYNTHETIC", document_type="rulebook", language="en")
            assert repo.import_records(s, records, doc).versions_created == 4
            s.commit()
            assert repo.import_records(s, records, doc).versions_unchanged == 4  # idempotent on PostgreSQL too
            assert repo.build_store(s).stats()["rules"] == 4
        eng.dispose()
    finally:
        srv.cleanup()
