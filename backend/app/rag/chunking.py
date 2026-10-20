"""Legal-text cleaning and clause-aware chunking.

Original text is never modified.  ``clean_lines`` only *omits* whole lines that are PDF
running headers or lone footnote numbers; surviving lines stay verbatim.  Chunks are
split at top-level clause boundaries so conditions and provisos stay with their clause.
"""
from __future__ import annotations

import hashlib
import re

from app.rules.schemas import Chunk
from app.rules.validators import LONE_NUMBER_LINE, RUNNING_HEADER, TABLE_LIKE

_CLAUSE_START = re.compile(r"^\s{0,10}\(\d{1,2}\)\s")
MIN_CHUNK, MAX_CHUNK = 500, 2200


def sha256(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def collapse(text: str) -> str:
    return re.sub(r"\s+", " ", text).strip()


def clean_lines(text: str) -> tuple[list[str], int]:
    """Return (kept_lines, omitted_count)."""
    kept, omitted = [], 0
    for line in text.split("\n"):
        if RUNNING_HEADER.match(line) or LONE_NUMBER_LINE.match(line):
            omitted += 1
            continue
        kept.append(line)
    return kept, omitted


def searchable_text(text: str) -> str:
    lines, _ = clean_lines(text)
    return collapse(" ".join(lines))


def chunk_rule(
    rule_key: str,
    official_id: str,
    title: str,
    text: str,
    page_start: int,
    page_end: int,
    pages_norm: dict[int, str] | None = None,
) -> list[Chunk]:
    lines, _ = clean_lines(text)
    heading = f"Rule {official_id} - {title}".strip()
    groups: list[list[str]] = []
    cur: list[str] = []
    size = 0
    for line in lines:
        starts_clause = bool(_CLAUSE_START.match(line))
        if cur and ((starts_clause and size >= MIN_CHUNK) or (size + len(line) > MAX_CHUNK and line.strip() != "")):
            groups.append(cur)
            cur, size = [], 0
        cur.append(line)
        size += len(line) + 1
    if cur:
        groups.append(cur)

    chunks: list[Chunk] = []
    for i, g in enumerate(groups):
        body = "\n".join(g).strip("\n")
        if not body.strip():
            continue
        ps, pe, precision = page_start, page_end, "rule_range"
        if pages_norm:
            loc = locate_pages(body, pages_norm, page_start, page_end)
            if loc:
                ps, pe, precision = loc[0], loc[1], "located_in_page_text"
        chunks.append(
            Chunk(
                chunk_id=f"{rule_key}::c{i}",
                rule_key=rule_key,
                official_rule_id=official_id,
                index=len(chunks),
                text=body,
                context_heading=heading,
                page_start=ps,
                page_end=pe,
                page_precision=precision,
                omitted_lines=0,
                table_like=bool(TABLE_LIKE.search(body)),
                content_hash=sha256(body),
            )
        )
    return chunks


def locate_pages(
    body: str, pages_norm: dict[int, str], lo: int, hi: int
) -> tuple[int, int] | None:
    """Find the pages (within the rule's stated range +/-1) where the chunk's first and
    last words occur in the page-by-page full text.  Returns None when not found."""
    norm = collapse(body)
    if len(norm) < 20:
        return None
    head, tail = norm[:50], norm[-50:]
    cand = range(max(1, lo), hi + 1)
    first = next((p for p in cand if head in pages_norm.get(p, "")), None)
    if first is None:
        return None
    last = next((p for p in range(first, hi + 1) if tail in pages_norm.get(p, "")), first)
    return first, max(first, last)
