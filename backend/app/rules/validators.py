"""Record-level validation for the supplied rules JSONL."""
from __future__ import annotations

import re
from typing import Any

from app.rules.normalization import parse_rule_ref
from app.rules.schemas import Issue

REQUIRED_FIELDS = ("rule", "title", "part", "page_start", "page_end", "text")
KNOWN_FIELDS = set(REQUIRED_FIELDS)

RUNNING_HEADER = re.compile(
    r"^[ \t\f]*Rule\s+[^\n]*?M\.P\. Bhumi Vikas Rules, 2012\s+\d+[ \t]*$", re.MULTILINE
)
LONE_NUMBER_LINE = re.compile(r"^[ \t]*\d{1,2}[ \t]*$")
AMENDMENT_MARKER = re.compile(r"(?<![\w])\d{1,2}\[|^\s*\[\s*\"?\d{1,3}")
TABLE_LIKE = re.compile(r"\S {5,}\S.*\S {5,}\S")


def validate_record(
    raw: Any, line_no: int, total_pages: int | None
) -> tuple[list[Issue], list[Issue]]:
    """Return (errors, warnings). Any error means the record is rejected."""
    errors: list[Issue] = []
    warnings: list[Issue] = []
    if not isinstance(raw, dict):
        return [Issue("INVALID_TYPE", "error", "record is not a JSON object", None, line_no)], []
    rid = raw.get("rule") if isinstance(raw.get("rule"), str) else None

    for f in REQUIRED_FIELDS:
        if f not in raw or raw[f] is None:
            errors.append(Issue("MISSING_FIELD", "error", f"missing required field '{f}'", rid, line_no))
    if errors:
        return errors, warnings

    if not isinstance(raw["rule"], str) or not raw["rule"].strip():
        errors.append(Issue("MISSING_RULE_NUMBER", "error", "rule number empty or not a string", None, line_no))
    elif parse_rule_ref(raw["rule"]) is None:
        errors.append(Issue("INVALID_RULE_ID", "error", f"unparseable rule identifier {raw['rule']!r}", rid, line_no))
    for f in ("title", "part", "text"):
        if not isinstance(raw[f], str):
            errors.append(Issue("INVALID_TYPE", "error", f"'{f}' must be a string", rid, line_no))
    for f in ("page_start", "page_end"):
        if isinstance(raw[f], bool) or not isinstance(raw[f], int):
            errors.append(Issue("INVALID_TYPE", "error", f"'{f}' must be an integer", rid, line_no))
    if errors:
        return errors, warnings

    if not raw["text"].strip():
        errors.append(Issue("EMPTY_TEXT", "error", "rule text is empty", rid, line_no))
    ps, pe = raw["page_start"], raw["page_end"]
    if ps < 1 or pe < ps:
        errors.append(Issue("INVALID_PAGE_RANGE", "error", f"invalid page range {ps}-{pe}", rid, line_no))
    elif total_pages is not None and pe > total_pages:
        warnings.append(
            Issue(
                "PAGE_RANGE_EXCEEDS_SOURCE",
                "warning",
                f"page_end {pe} exceeds source page count {total_pages}; page reference needs review",
                rid,
                line_no,
            )
        )
    if not raw["title"].strip():
        warnings.append(Issue("EMPTY_TITLE", "warning", "rule title is empty", rid, line_no))
    unknown = set(raw) - KNOWN_FIELDS
    if unknown:
        warnings.append(Issue("UNKNOWN_FIELDS", "info", f"preserved extra fields: {sorted(unknown)}", rid, line_no))
    return errors, warnings


def text_flags(text: str) -> list[str]:
    flags = []
    if RUNNING_HEADER.search(text):
        flags.append("running_header_in_text")
    if AMENDMENT_MARKER.search(text):
        flags.append("amendment_markers_present")
    if TABLE_LIKE.search(text):
        flags.append("table_like_content_unverified")
    return flags
