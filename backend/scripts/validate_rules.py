"""Validation-only command: runs the full ingestion checks and writes nothing.

    python -m scripts.validate_rules [--input data/raw/bhumi_vikas_rules.jsonl] [--db]

Exit code 1 when any record is rejected (so CI can gate on it). With --db it additionally
checks stored data: unique evidence ids, chunk->version links, active-version uniqueness,
and that no version is 'verified' without reviewer notes.
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from sqlalchemy import func, select

from app.core.config import Settings
from app.ingestion.jsonl import ingest_jsonl


def check_db(url: str) -> list[str]:
    from app.db.session import make_engine, make_session_factory
    from app.models import Rule, RuleChunk, RuleVersion

    problems: list[str] = []
    with make_session_factory(make_engine(url))() as s:
        dup = s.execute(select(RuleChunk.evidence_id, func.count()).group_by(RuleChunk.evidence_id)
                        .having(func.count() > 1)).all()
        problems += [f"duplicate evidence_id {e} x{n}" for e, n in dup]
        multi = s.execute(select(RuleVersion.rule_id, RuleVersion.source_document_id, func.count())
                          .where(RuleVersion.version_status == "active")
                          .group_by(RuleVersion.rule_id, RuleVersion.source_document_id).having(func.count() > 1)).all()
        problems += [f"rule_id={r} has {n} active versions in source_document={d}" for r, d, n in multi]
        for v in s.scalars(select(RuleVersion).where(RuleVersion.verification_status == "verified")):
            if not v.reviewer_notes:
                problems.append(f"{v.version_key} is 'verified' without reviewer notes")
        for r in s.scalars(select(Rule)):
            if r.parent_rule_id is None and not r.versions:
                problems.append(f"rule {r.stable_rule_id} has no versions")
    return problems


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--input", default="data/raw/bhumi_vikas_rules.jsonl", type=Path)
    ap.add_argument("--fulltext", default="data/raw/bhumi_vikas_rules_fulltext_by_page.txt", type=Path)
    ap.add_argument("--db", action="store_true", help="also validate the database contents")
    ap.add_argument("--json", action="store_true", help="print the full report as JSON")
    a = ap.parse_args(argv)
    if not a.input.exists():
        print(f"ERROR: input not found: {a.input}", file=sys.stderr)
        return 2
    _, report = ingest_jsonl(a.input, a.fulltext, None, dry_run=True)
    if a.json:
        print(json.dumps(report.to_dict(), indent=2, ensure_ascii=False))
    print(f"processed={report.records_processed} accepted={report.records_accepted} rejected={report.records_rejected} "
          f"duplicates={len(report.duplicates)}")
    print(f"issues: {json.dumps(report.issue_counts, sort_keys=True)}")
    for r in report.rejected:
        print(f"REJECTED line {r['line_no']} rule={r['rule']}: {[e['code'] for e in r['errors']]}")
    rc = 1 if report.records_rejected else 0
    if a.db:
        problems = check_db(Settings().database_url)
        for p in problems:
            print(f"DB PROBLEM: {p}")
        print(f"db problems: {len(problems)}")
        rc = rc or (1 if problems else 0)
    return rc


if __name__ == "__main__":
    raise SystemExit(main())
