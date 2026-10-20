"""Parse the supplied ``fulltext_by_page`` file (``===== PDF page N =====`` markers)."""
from __future__ import annotations

import re
from pathlib import Path

from app.rag.chunking import collapse

_MARK = re.compile(r"^===== PDF page (\d+) =====\s*$", re.MULTILINE)


def load_pages(path: Path) -> dict[int, str]:
    raw = Path(path).read_text(encoding="utf-8", errors="replace")
    marks = list(_MARK.finditer(raw))
    pages: dict[int, str] = {}
    for i, m in enumerate(marks):
        end = marks[i + 1].start() if i + 1 < len(marks) else len(raw)
        pages[int(m.group(1))] = raw[m.end():end]
    return pages


def normalize_pages(pages: dict[int, str]) -> dict[int, str]:
    return {n: collapse(t) for n, t in pages.items()}
