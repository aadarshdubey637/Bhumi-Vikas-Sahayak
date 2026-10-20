"""Development convenience: make a fresh checkout work with a plain ``uvicorn`` start.

In development the server migrates the database to head and, if no rules are stored, loads the rule data that ships with the project.
Both steps are idempotent, never mark anything ``verified`` and are OFF in production (Render runs them explicitly in the entrypoint).
"""
from __future__ import annotations

import logging
from pathlib import Path

from sqlalchemy import func, select
from sqlalchemy.orm import Session, sessionmaker

from app.core.config import Settings
from app.db.migrate import BACKEND_DIR, upgrade_to_head
from app.ingestion.jsonl import ingest_jsonl
from app.models import RuleVersion
from app.repositories import rule_repository as repo

log = logging.getLogger("app.bootstrap")
RAW_JSONL = "data/raw/bhumi_vikas_rules.jsonl"
RAW_FULLTEXT = "data/raw/bhumi_vikas_rules_fulltext_by_page.txt"
RAW_PDF_EN = "data/raw/MP_Bhumi_Vikas_Rules_2012_upto_2025-03-06_EN.pdf"


def has_rules(factory: sessionmaker[Session]) -> bool:
    with factory() as s:
        return (s.scalar(select(func.count()).select_from(RuleVersion)) or 0) > 0


def ingest_shipped_rules(factory: sessionmaker[Session], settings: Settings, base: Path = BACKEND_DIR) -> int:
    """Load data/raw/*.jsonl and the amendment register. Returns the number of rule versions created (0 when nothing to do)."""
    src, fulltext, pdf = base / RAW_JSONL, base / RAW_FULLTEXT, base / RAW_PDF_EN
    if not src.exists():
        log.warning("auto-ingest skipped: %s not found", src, extra={"event": "auto_ingest_missing"})
        return 0
    records, report = ingest_jsonl(src, fulltext if fulltext.exists() else None, None, False)
    pages = None
    if pdf.exists():
        import pymupdf
        with pymupdf.open(pdf) as d:
            pages = len(d)
    with factory() as s:
        doc = repo.default_english_document(s, pdf if pdf.exists() else None, pages)
        stats = repo.import_records(s, records, doc)
        repo.record_run(s, "jsonl", src, report.to_dict(), stats, report.records_accepted, report.records_rejected, False)
        repo.apply_reviews(s, settings.reviews_path)
        repo.import_amendments(s, settings.amendments_path)
        s.commit()
    log.info("auto-ingest: %d rule versions created", stats.versions_created, extra={"event": "auto_ingest"})
    return stats.versions_created


def prepare_database(factory: sessionmaker[Session], settings: Settings) -> None:
    """Apply the development conveniences selected by the settings. Failures are logged, never fatal: /ready reports the state."""
    try:
        if settings.should_auto_migrate:
            upgrade_to_head(settings.database_url)
            log.info("auto-migrate: database is at head", extra={"event": "auto_migrate"})
        if settings.should_auto_ingest and not has_rules(factory):
            ingest_shipped_rules(factory, settings)
    except Exception:
        log.exception("database preparation failed (the server still starts; see /api/v1/ready)", extra={"event": "bootstrap_failed"})
