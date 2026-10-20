"""Page-level PDF extraction with PyMuPDF.

Preserves document identity, page numbers, extracted text, language and an explicit
``extraction_status`` per page. Candidate tables (PyMuPDF ``find_tables``) are exported as
UNVERIFIED candidates only: flattened/extracted text never keeps column relationships reliably.

Hindi PDFs in the supplied corpus use a legacy font (Kruti Dev): the bytes decode to Latin
look-alikes, not Unicode Devanagari. Such pages are flagged ``legacy_font_encoding`` and are NOT
indexed; this module deliberately does not guess a font-to-Unicode mapping for legal text.
"""
from __future__ import annotations

import re
from dataclasses import asdict, dataclass, field
from difflib import SequenceMatcher
from pathlib import Path
from typing import Any

import pymupdf

from app.rag.chunking import collapse

DEVANAGARI = re.compile(r"[\u0900-\u097F]")
LEGACY_FONT = re.compile(r"kruti|krutidev|devlys|chanakya|shusha|walkman", re.IGNORECASE)
EN_HEADER = re.compile(r"^\s*Rule\s+([0-9][0-9A-Za-z\-\s,]*?)\s*$", re.IGNORECASE | re.MULTILINE)
HI_HEADER = re.compile(r"^\s*fu;e\s+([0-9][0-9A-Za-z\-\s,]*?)\s*$", re.MULTILINE)  # 'नियम' in Kruti Dev
MIN_TEXT_CHARS = 40


@dataclass
class PageExtract:
    document_key: str
    page: int
    language: str
    text: str
    chars: int
    extraction_status: str  # ok | empty_text_layer | legacy_font_encoding
    devanagari_chars: int = 0
    legacy_fonts: list[str] = field(default_factory=list)
    table_candidates: int = 0
    header_rule: str | None = None
    searchable: bool = True

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


def _header_rule(text: str, language: str) -> str | None:
    m = (HI_HEADER if language == "hi" else EN_HEADER).search(text[:300])
    return re.sub(r"\s+", " ", m.group(1)).strip() if m else None


def extract_pdf(path: Path, document_key: str, language: str, with_tables: bool = True) -> tuple[list[PageExtract], list[dict[str, Any]]]:
    pages: list[PageExtract] = []
    tables: list[dict[str, Any]] = []
    with pymupdf.open(path) as doc:
        for i, page in enumerate(doc, start=1):
            text = page.get_text("text")
            fonts = sorted({f[3] for f in page.get_fonts()})
            legacy = [f for f in fonts if LEGACY_FONT.search(f)]
            dev = len(DEVANAGARI.findall(text))
            body = text.strip()
            if len(body) < MIN_TEXT_CHARS:
                status, searchable = "empty_text_layer", False
            elif language == "hi" and dev == 0 and legacy:
                status, searchable = "legacy_font_encoding", False
            else:
                status, searchable = "ok", True
            n_tables = 0
            if with_tables:
                try:
                    found = page.find_tables().tables
                except (ValueError, RuntimeError):  # PyMuPDF raises these for malformed pages
                    found = []
                n_tables = len(found)
                for t_idx, t in enumerate(found):
                    tables.append({
                        "document_key": document_key, "page": i, "table_index": t_idx,
                        "rows": t.extract(), "extraction_method": "pymupdf.find_tables",
                        "verification_status": "unverified",
                        "note": "Candidate only; column relationships are not guaranteed. Verify against the PDF page.",
                    })
            pages.append(PageExtract(document_key, i, language, text, len(text), status, dev, legacy, n_tables,
                                     _header_rule(text, language), searchable))
    return pages, tables


def compare_with_fulltext(pages: list[PageExtract], fulltext_pages: dict[int, str], threshold: float = 0.9) -> dict[str, Any]:
    """Cross-check PDF extraction against the supplied by-page text file (whitespace-insensitive)."""
    low: list[dict[str, Any]] = []
    missing: list[int] = []
    for p in pages:
        ref = fulltext_pages.get(p.page)
        if ref is None:
            missing.append(p.page)
            continue
        a, b = collapse(p.text), collapse(ref)
        ratio = SequenceMatcher(None, a, b, autojunk=False).quick_ratio() if len(a) > 4000 or len(b) > 4000 else SequenceMatcher(None, a, b, autojunk=False).ratio()
        if ratio < threshold:
            low.append({"page": p.page, "similarity": round(ratio, 3)})
    return {"pages_compared": len(pages) - len(missing), "pages_missing_in_fulltext": missing,
            "pages_below_threshold": low, "threshold": threshold}


def english_hindi_structure_check(en: list[PageExtract], hi: list[PageExtract]) -> dict[str, Any]:
    """Structural (not semantic) comparison: page count and per-page running-header rule numbers.
    Rule numbers survive the legacy Hindi encoding; Hindi body text does not, so no wording check is possible."""
    out: dict[str, Any] = {"en_pages": len(en), "hi_pages": len(hi), "page_count_match": len(en) == len(hi),
                           "header_mismatches": [], "pages_without_header": 0}
    for e, h in zip(en, hi, strict=False):
        if e.header_rule is None or h.header_rule is None:
            out["pages_without_header"] += 1
        elif re.sub(r"\s", "", e.header_rule).lower() != re.sub(r"\s", "", h.header_rule).lower():
            out["header_mismatches"].append({"page": e.page, "en": e.header_rule, "hi": h.header_rule})
    out["limitation"] = "Hindi body text is legacy-font encoded; semantic English-Hindi discrepancy detection is not possible."
    return out
