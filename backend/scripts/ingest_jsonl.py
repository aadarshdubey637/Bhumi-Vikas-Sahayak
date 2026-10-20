"""Ingest the supplied rules JSONL (validate -> chunk -> cross-check -> report -> optional DB load).

    python -m scripts.ingest_jsonl --input data/raw/bhumi_vikas_rules.jsonl \\
        --fulltext data/raw/bhumi_vikas_rules_fulltext_by_page.txt            # writes corpus + report
    python -m scripts.ingest_jsonl --input ... --dry-run                      # validate only, write nothing
    python -m scripts.ingest_jsonl --load-db --migrate                        # also load into DATABASE_URL

Re-running is idempotent: unchanged records are skipped; changed text creates a new RuleVersion.
Ingestion never marks anything ``verified``.
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from app.core.config import Settings
from app.ingestion.jsonl import ingest_jsonl, write_corpus


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--input", default="data/raw/bhumi_vikas_rules.jsonl", type=Path)
    ap.add_argument("--fulltext", default="data/raw/bhumi_vikas_rules_fulltext_by_page.txt", type=Path)
    ap.add_argument("--total-pages", type=int, default=None, help="source PDF page count (default: from fulltext)")
    ap.add_argument("--corpus-out", default="data/processed/corpus_rules.jsonl", type=Path)
    ap.add_argument("--report-out", default="data/processed/ingestion_report.json", type=Path)
    ap.add_argument("--dry-run", action="store_true", help="validate and report; write no files and no DB rows")
    ap.add_argument("--strict", action="store_true", help="exit 1 if any record was rejected")
    ap.add_argument("--load-db", action="store_true", help="also import into the database (DATABASE_URL)")
    ap.add_argument("--migrate", action="store_true", help="run 'alembic upgrade head' before loading")
    ap.add_argument("--database-url", default=None)
    ap.add_argument("--pdf-en", type=Path, default=Path("data/raw/MP_Bhumi_Vikas_Rules_2012_upto_2025-03-06_EN.pdf"),
                    help="English PDF (only used to record its hash/page count on the SourceDocument)")
    ap.add_argument("--amendments", type=Path, default=None, help="pending amendment register JSON (default: settings)")
    ap.add_argument("--reviews", type=Path, default=None, help="rule_reviews.jsonl (default: settings)")
    a = ap.parse_args(argv)
    if not a.input.exists():
        print(f"ERROR: input not found: {a.input}. Place the official JSONL there (see docs/ingestion.md).", file=sys.stderr)
        return 2
    records, report = ingest_jsonl(a.input, a.fulltext, a.total_pages, a.dry_run)
    if not a.dry_run:
        write_corpus(records, a.corpus_out)
        a.report_out.parent.mkdir(parents=True, exist_ok=True)
        a.report_out.write_text(json.dumps(report.to_dict(), indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"processed={report.records_processed} accepted={report.records_accepted} rejected={report.records_rejected}")
    print(f"issue_counts={json.dumps(report.issue_counts, sort_keys=True)}")
    print(f"embedded_rules_found={report.embedded_rules_found}")
    print(f"guide-listed rules NOT found: {report.guide_listed_rules_not_found_as_records_or_embedded}")
    print(f"page_crosscheck={report.page_crosscheck}")
    if not a.dry_run:
        print(f"wrote {a.corpus_out} and {a.report_out}")

    if a.load_db:
        from app.db.migrate import upgrade_to_head
        from app.db.session import make_engine, make_session_factory, session_scope
        from app.repositories import rule_repository as repo

        settings = Settings()
        url = a.database_url or settings.database_url
        if a.migrate:
            upgrade_to_head(url)
        factory = make_session_factory(make_engine(url))
        with session_scope(factory) as s:
            pages = None
            if a.pdf_en.exists():
                import pymupdf
                with pymupdf.open(a.pdf_en) as d:
                    pages = len(d)
            doc = repo.default_english_document(s, a.pdf_en if a.pdf_en.exists() else None, pages)
            stats = repo.import_records(s, records, doc, dry_run=a.dry_run)
            if not a.dry_run:
                repo.record_run(s, "jsonl", a.input, report.to_dict(), stats, report.records_accepted,
                                report.records_rejected, False)
                repo.apply_reviews(s, a.reviews or settings.reviews_path)
                n_amd = repo.import_amendments(s, a.amendments or settings.amendments_path)
                print(f"amendments created: {n_amd}")
        print(f"db import: {json.dumps(stats.to_dict())}")
    return 1 if (a.strict and report.records_rejected) else 0


if __name__ == "__main__":
    raise SystemExit(main())
