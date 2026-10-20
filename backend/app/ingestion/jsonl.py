"""JSONL ingestion: parse -> validate -> clean/chunk -> cross-check -> report.

Nothing is silently dropped: every rejected line appears in the report with its reason.
Nothing is marked ``verified``: ingestion produces ``unverified`` records only.
"""
from __future__ import annotations

import json
from collections import Counter
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any

from app.ingestion.embedded import detect_embedded
from app.ingestion.fulltext import load_pages, normalize_pages
from app.rag.chunking import chunk_rule, collapse, searchable_text, sha256
from app.rules.normalization import parse_rule_ref
from app.rules.schemas import Issue, RuleRecord
from app.rules.validators import text_flags, validate_record

SOURCE_DOCUMENT_ID = "MP-BVR-2012-EN-CONSOL-2025-03-06"
# Inserted rules the participant guide says the PDF prints (it does NOT say where).
GUIDE_LISTED_INSERTED_RULES = ["12-A", "17-a", "25(A)", "26-A", "26-B", "42-A", "93(a)"]


@dataclass
class IngestionReport:
    input_path: str
    dry_run: bool
    lines_read: int = 0
    blank_lines: int = 0
    records_processed: int = 0
    records_accepted: int = 0
    records_rejected: int = 0
    rejected: list[dict[str, Any]] = field(default_factory=list)
    issues: list[Issue] = field(default_factory=list)
    duplicates: list[str] = field(default_factory=list)
    missing_source_pages: list[str] = field(default_factory=list)
    embedded_rules_found: list[str] = field(default_factory=list)
    guide_listed_rules_not_found_as_records_or_embedded: list[str] = field(default_factory=list)
    page_crosscheck: dict[str, int] = field(default_factory=dict)
    verification_summary: dict[str, int] = field(default_factory=dict)
    issue_counts: dict[str, int] = field(default_factory=dict)
    notes: list[str] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        d = asdict(self)
        return d


def ingest_jsonl(
    path: Path,
    fulltext_path: Path | None = None,
    total_pages: int | None = None,
    dry_run: bool = False,
) -> tuple[list[RuleRecord], IngestionReport]:
    path = Path(path)
    report = IngestionReport(input_path=str(path), dry_run=dry_run)
    pages_norm: dict[int, str] | None = None
    if fulltext_path and Path(fulltext_path).exists():
        pages = load_pages(Path(fulltext_path))
        pages_norm = normalize_pages(pages)
        total_pages = total_pages or (max(pages) if pages else None)
    elif fulltext_path:
        report.notes.append(f"fulltext file not found: {fulltext_path}; page cross-check skipped")

    records: list[RuleRecord] = []
    seen: dict[str, int] = {}
    with path.open("r", encoding="utf-8-sig") as fh:
        for line_no, line in enumerate(fh, start=1):
            report.lines_read += 1
            if not line.strip():
                report.blank_lines += 1
                continue
            report.records_processed += 1
            try:
                raw = json.loads(line)
            except json.JSONDecodeError as e:
                _reject(report, line_no, None, [Issue("INVALID_JSON", "error", str(e), None, line_no)])
                continue
            errors, warnings = validate_record(raw, line_no, total_pages)
            if errors:
                _reject(report, line_no, raw.get("rule") if isinstance(raw, dict) else None, errors)
                continue
            ref = parse_rule_ref(raw["rule"])
            key = ref.key  # type: ignore[union-attr]
            if key in seen:
                report.duplicates.append(raw["rule"])
                _reject(
                    report,
                    line_no,
                    raw["rule"],
                    [Issue("DUPLICATE_RULE", "error", f"duplicate of line {seen[key]}", raw["rule"], line_no)],
                )
                continue
            seen[key] = line_no
            report.issues.extend(warnings)
            records.append(_build_record(raw, key, pages_norm, report, line_no))
            report.records_accepted += 1

    _finalize(report, records)
    return records, report


def _reject(report: IngestionReport, line_no: int, rule: Any, errors: list[Issue]) -> None:
    report.records_rejected += 1
    report.rejected.append({"line_no": line_no, "rule": rule, "errors": [asdict(e) for e in errors]})
    report.issues.extend(errors)


def _build_record(
    raw: dict[str, Any], key: str, pages_norm: dict[int, str] | None, report: IngestionReport, line_no: int
) -> RuleRecord:
    text = raw["text"]
    official = raw["rule"].strip()
    flags = text_flags(text)
    stripped = text.lstrip()
    if not stripped.lstrip("[\"'").startswith(official.split("(")[0][:1]) or not _starts_with_rule(stripped, official):
        flags.append("text_does_not_start_with_rule_number")
        report.issues.append(
            Issue("TEXT_DOES_NOT_START_WITH_RULE", "info", "record text begins with a stray bracket/character", official, line_no)
        )
    for f, code, sev, msg in (
        ("running_header_in_text", "RUNNING_HEADER_IN_TEXT", "info", "PDF running headers embedded; omitted from chunks/index only"),
        ("amendment_markers_present", "AMENDMENT_MARKERS_PRESENT", "warning", "amendment markers present; amendment content unverified"),
        ("table_like_content_unverified", "TABLE_LIKE_UNVERIFIED", "warning", "table-like content; numeric values unverified against PDF"),
    ):
        if f in flags:
            report.issues.append(Issue(code, sev, msg, official, line_no))

    chunks = chunk_rule(key, official, raw["title"], text, raw["page_start"], raw["page_end"], pages_norm)
    crosscheck: dict[str, Any] = {"performed": pages_norm is not None}
    if pages_norm is not None:
        head = collapse(text.lstrip("[\"' \n"))[:40]
        in_range = [p for p in range(raw["page_start"], raw["page_end"] + 1) if head in pages_norm.get(p, "")]
        crosscheck.update(
            heading_found_on_page=in_range[0] if in_range else None,
            passed=bool(in_range),
            chunks_located=sum(c.page_precision == "located_in_page_text" for c in chunks),
            chunks_total=len(chunks),
        )
        if not in_range:
            flags.append("page_crosscheck_failed")
            report.issues.append(
                Issue("PAGE_CROSSCHECK_FAILED", "warning", "rule start text not found on stated pages in full-text file", official, line_no)
            )
    emb = detect_embedded(key, official, text)
    return RuleRecord(
        rule_key=key,
        official_rule_id=official,
        title=raw["title"].strip(),
        part=raw["part"].strip(),
        page_start=raw["page_start"],
        page_end=raw["page_end"],
        original_text=text,
        searchable_text=searchable_text(text),
        content_hash=sha256(text),
        version_id=f"{key}@{SOURCE_DOCUMENT_ID}",
        source_document_id=SOURCE_DOCUMENT_ID,
        verification_status="unverified",
        flags=flags + (["page_range_exceeds_source"] if any(i.code == "PAGE_RANGE_EXCEEDS_SOURCE" and i.rule == official for i in report.issues) else []),
        chunks=chunks,
        embedded_rules=emb,
        page_crosscheck=crosscheck,
        extra={k: v for k, v in raw.items() if k not in ("rule", "title", "part", "page_start", "page_end", "text")},
    )


def _starts_with_rule(stripped: str, official: str) -> bool:
    s = stripped.lstrip("[\"' ")
    return s.startswith((official, official.replace("-", " ")))


def _finalize(report: IngestionReport, records: list[RuleRecord]) -> None:
    embedded = [e.official_rule_id for r in records for e in r.embedded_rules]
    report.embedded_rules_found = embedded
    present = {parse_rule_ref(r.official_rule_id).key for r in records} | {  # type: ignore[union-attr]
        e.rule_key for r in records for e in r.embedded_rules
    }
    missing = [x for x in GUIDE_LISTED_INSERTED_RULES if parse_rule_ref(x, known_keys={_ck(x)}).key not in present]  # type: ignore[union-attr]
    report.guide_listed_rules_not_found_as_records_or_embedded = missing
    for m in missing:
        report.issues.append(
            Issue("EXPECTED_RULE_NOT_FOUND", "warning", f"inserted rule {m} is listed in the participant guide but was not located in the supplied rule text; not invented", m)
        )
    report.missing_source_pages = []  # missing pages are rejected as MISSING_FIELD; kept for schema stability
    report.page_crosscheck = {
        "performed": sum(1 for r in records if r.page_crosscheck.get("performed")),
        "passed": sum(1 for r in records if r.page_crosscheck.get("passed")),
        "failed": sum(1 for r in records if r.page_crosscheck.get("passed") is False),
    }
    report.verification_summary = dict(Counter(r.verification_status for r in records))
    report.issue_counts = dict(Counter(i.code for i in report.issues))
    report.notes.append("All accepted records are 'unverified'. Ingestion success is not legal verification.")


def _ck(label: str) -> str:
    import re

    m = re.match(r"(\d+)\D*([A-Za-z])", label)
    return f"{m.group(1)}{m.group(2).lower()}" if m else label.lower()


def write_corpus(records: list[RuleRecord], out_path: Path) -> None:
    out_path.parent.mkdir(parents=True, exist_ok=True)
    with out_path.open("w", encoding="utf-8") as fh:
        for r in records:
            fh.write(json.dumps(r.to_dict(), ensure_ascii=False) + "\n")


def load_corpus(path: Path) -> list[RuleRecord]:
    with Path(path).open("r", encoding="utf-8") as fh:
        return [RuleRecord.from_dict(json.loads(line)) for line in fh if line.strip()]
