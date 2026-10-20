"""Hybrid result merging (reciprocal rank fusion) and de-duplication."""
from __future__ import annotations

from collections.abc import Iterable


def reciprocal_rank_fusion(rankings: Iterable[list[str]], k: int = 60) -> list[tuple[str, float]]:
    scores: dict[str, float] = {}
    for ranking in rankings:
        for rank, key in enumerate(ranking, start=1):
            scores[key] = scores.get(key, 0.0) + 1.0 / (k + rank)
    return sorted(scores.items(), key=lambda x: (-x[1], x[0]))


def dedupe(keys: Iterable[str]) -> list[str]:
    seen: set[str] = set()
    out = []
    for k in keys:
        if k not in seen:
            seen.add(k)
            out.append(k)
    return out
