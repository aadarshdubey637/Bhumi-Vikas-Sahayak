"""Pick the sentence of a rule that best answers the question, as an *exact substring* of the stored text.

The quotation is never rewritten, translated or re-joined: ``text[start:end]`` is returned unchanged, so it can always be checked
against the stored rule text. Footnotes (amendment notifications), running page headers and commentary are not operative text and
are never chosen.
"""
from __future__ import annotations

import itertools
import math
import re
from collections.abc import Iterable
from dataclasses import dataclass

from app.rag.lexical_index import tokenize

# a boundary is whitespace after . ; : or a line break before a clause marker such as "(2)" / "(a)" / "1."
_BOUNDARY = re.compile(r"(?<=[.;:])\s+|\n\s*(?=\(?[0-9A-Za-z]{1,3}[.)]\s)")
_NOT_OPERATIVE = re.compile(
    r"Subs\.|Ins\.|Notification No|Rajpatra|COMMENTS|Published in|M\.P\. Bhumi Vikas Rules, 2012\s+\d+|^\s*Rule\s+[\d\-A-Za-z]+\s+M\.P\.",
    re.IGNORECASE)
MIN_CHARS = 25
# "how long / how many / minimum ..." questions want a sentence that states a quantity
_QUANTITY_ASK = frozenset(["long", "many", "much", "minimum", "maximum", "min", "max", "days", "day", "year", "month", "limit", "distance",
                           "size", "width", "height", "far", "fee", "kitna", "kitne", "kitni"])
_QUANTITY = re.compile(r"\d|\b(?:one|two|three|four|five|six|seven|ten|twelve|fifteen|twenty|thirty|forty|sixty|ninety|hundred)\b", re.IGNORECASE)


@dataclass(frozen=True)
class Passage:
    start: int
    end: int
    text: str          # == source[start:end], exactly
    truncated: bool    # True when the sentence was cut at a word boundary to fit max_chars
    score: float = 0.0


def sentence_spans(text: str) -> list[tuple[int, int]]:
    bounds = [0, *[m.end() for m in _BOUNDARY.finditer(text)], len(text)]
    spans: list[tuple[int, int]] = []
    for a, b in itertools.pairwise(bounds):
        seg = text[a:b]
        s = a + len(seg) - len(seg.lstrip())
        e = b - (len(seg) - len(seg.rstrip()))
        if e - s >= MIN_CHARS:
            spans.append((s, e))
    return spans


def best_passage(text: str, query_tokens: list[str], idf: dict[str, float] | None = None, max_chars: int = 420) -> Passage | None:
    """Highest-scoring operative sentence for the query terms, or None if no sentence shares a term with the query."""
    qset = {t for t in query_tokens if t.isalpha() and len(t) >= 3}
    quantity_ask = bool(_QUANTITY_ASK & set(query_tokens))
    if not qset or not text.strip():
        return None
    best: tuple[float, int, int] | None = None
    for s, e in sentence_spans(text):
        seg = text[s:e]
        if _NOT_OPERATIVE.search(seg):
            continue
        toks = set(tokenize(seg))
        hit = qset & toks
        if not hit:
            continue
        score = sum((idf or {}).get(t, 1.0) for t in hit) / math.pow(max(len(toks), 8), 0.3)
        if quantity_ask and _QUANTITY.search(seg):
            score *= 1.5
        if best is None or score > best[0]:
            best = (score, s, e)
    if best is None:
        return None
    score, s, e = best
    if e - s <= max_chars:
        return Passage(s, e, text[s:e], False, score)
    cut = text.rfind(" ", s, s + max_chars)
    cut = cut if cut > s + MIN_CHARS else s + max_chars
    return Passage(s, cut, text[s:cut], True, score)


def best_passage_in_chunks[C](chunks: Iterable[C], get_text, query_tokens: list[str], idf: dict[str, float] | None = None,
                           max_chars: int = 420) -> tuple[C, Passage] | None:
    """Best sentence across ALL chunks of one rule (the sentence that decides the question is often not in the top-ranked chunk).
    ``get_text(chunk)`` returns the stored chunk text; the returned passage indexes into exactly that text."""
    best: tuple[C, Passage] | None = None
    for ch in chunks:
        p = best_passage(get_text(ch), query_tokens, idf, max_chars)
        if p is not None and (best is None or p.score > best[1].score):
            best = (ch, p)
    return best
