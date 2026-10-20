"""BM25 (Okapi) lexical index.

Implemented in-house (stdlib only) so the core retrieval path and its tests run with no
third-party install.  ``rank-bm25`` is listed in requirements.txt as the maintained
alternative; swapping is a one-class change behind ``LexicalIndex``.
"""
from __future__ import annotations

import math
import re
import unicodedata
from collections import Counter
from collections.abc import Callable

_TOKEN = re.compile(r"[a-z0-9]+|[\u0900-\u097F]+")
STOPWORDS = frozenset(
    ["a", "an", "and", "are", "as", "at", "be", "by", "for", "from", "has", "have", "how", "i", "in", "is", "it", "its", "my", "of", "on", "or", "that", "the", "this", "to", "was", "what", "when", "which", "who", "will", "with", "do", "does", "can", "may", "shall", "should", "would", "not", "no", "if", "any", "all", "per", "me", "we", "our", "your", "their", "there", "than", "then", "so", "such", "into", "under", "over"]
)


def stem(tok: str) -> str:
    if len(tok) > 4 and tok.endswith("ies"):
        return tok[:-3] + "y"
    if len(tok) > 3 and tok.endswith("s") and not tok.endswith("ss"):
        return tok[:-1]
    return tok


def tokenize(text: str, keep_stopwords: bool = False) -> list[str]:
    text = unicodedata.normalize("NFC", text).lower()
    toks = _TOKEN.findall(text)
    if not keep_stopwords:
        toks = [t for t in toks if t not in STOPWORDS]
    return [stem(t) for t in toks]


class BM25Index:
    def __init__(self, docs: list[list[str]], k1: float = 1.5, b: float = 0.75):
        self.k1, self.b = k1, b
        self.docs = docs
        self.n = len(docs)
        self.doc_len = [len(d) for d in docs]
        self.avgdl = (sum(self.doc_len) / self.n) if self.n else 0.0
        self.tf = [Counter(d) for d in docs]
        df: Counter[str] = Counter()
        for d in self.tf:
            df.update(d.keys())
        self.idf = {t: math.log(1 + (self.n - f + 0.5) / (f + 0.5)) for t, f in df.items()}

    def score(self, query_tokens: list[str], idx: int) -> float:
        s, tf, dl = 0.0, self.tf[idx], self.doc_len[idx]
        for t in set(query_tokens):
            f = tf.get(t, 0)
            if not f:
                continue
            s += self.idf.get(t, 0.0) * (f * (self.k1 + 1)) / (f + self.k1 * (1 - self.b + self.b * dl / (self.avgdl or 1)))
        return s

    def search(
        self, query_tokens: list[str], top_k: int = 10, predicate: Callable[[int], bool] | None = None
    ) -> list[tuple[int, float]]:
        if not query_tokens or not self.n:
            return []
        scored = []
        for i in range(self.n):
            if predicate and not predicate(i):
                continue
            sc = self.score(query_tokens, i)
            if sc > 0:
                scored.append((i, sc))
        scored.sort(key=lambda x: (-x[1], x[0]))
        return scored[:top_k]

    def coverage(self, query_tokens: list[str], idx: int) -> float:
        """Fraction of distinct query terms present in the document."""
        q = set(query_tokens)
        return (sum(1 for t in q if self.tf[idx].get(t)) / len(q)) if q else 0.0
