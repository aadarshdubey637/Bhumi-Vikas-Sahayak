"""Hybrid retrieval: exact rule-number hits first, then reciprocal-rank fusion of BM25 and (optional) semantic ranks.

Semantic retrieval is OFF unless an index is supplied. With no semantic index the result is
identical to lexical retrieval. Filters apply to both rankers; confidence still comes from the
lexical coverage signal so semantic similarity alone can never make the system 'confident'.
"""
from __future__ import annotations

from typing import Protocol

from app.rag.ranking import reciprocal_rank_fusion
from app.services.retrieval_service import EvidenceItem, RuleStore, SearchResult


class SemanticRanker(Protocol):
    def search(self, query: str, top_k: int = 10) -> list[tuple[int, float]]: ...


class HybridRetriever:
    def __init__(self, store: RuleStore, semantic: SemanticRanker | None = None, rrf_k: int = 60):
        self.store, self.semantic, self.rrf_k = store, semantic, rrf_k

    def search(self, query: str, top_k: int = 5, offset: int = 0, language: str | None = None,
               rule_keys: set[str] | None = None, part: str | None = None,
               verification_status: str | None = None) -> SearchResult:
        lexical = self.store.search(query, top_k=offset + top_k + 20, offset=0, language=language, rule_keys=rule_keys,
                                    part=part, verification_status=verification_status)
        if self.semantic is None:
            lexical.items = lexical.items[offset: offset + top_k]
            return lexical
        exact = [i for i in lexical.items if i.retrieval_method == "exact_rule_number"]
        lex_rest = [i for i in lexical.items if i.retrieval_method != "exact_rule_number"]
        by_id: dict[str, EvidenceItem] = {i.evidence_id: i for i in lexical.items}
        sem_ids: list[str] = []
        for idx, score in self.semantic.search(lexical.query.original, top_k=offset + top_k + 20):
            ch = self.store.chunks[idx]
            rec = self.store._chunk_rec[ch.chunk_id]
            if rule_keys and rec.rule_key not in rule_keys:
                continue
            if part and rec.part != part:
                continue
            if verification_status and rec.verification_status != verification_status:
                continue
            ev = self.store._evidence(rec, ch, "semantic", round(float(score), 4))
            by_id.setdefault(ev.evidence_id, ev)
            sem_ids.append(ev.evidence_id)
        fused = reciprocal_rank_fusion([[i.evidence_id for i in lex_rest], sem_ids], self.rrf_k)
        ordered: list[EvidenceItem] = list(exact)
        for eid, _ in fused:
            if eid not in {e.evidence_id for e in exact}:
                it = by_id[eid]
                if it.retrieval_method == "bm25" and eid in sem_ids:
                    it.retrieval_method = "hybrid"
                ordered.append(it)
        lexical.items, lexical.total = ordered[offset: offset + top_k], len(ordered)
        return lexical


def make_retriever(store: RuleStore | None, settings: object) -> HybridRetriever | None:
    """Lexical retriever, fused with semantic ranks only when SEMANTIC_ENABLED and sentence-transformers are available."""
    import logging

    if store is None:
        return None
    semantic = None
    if getattr(settings, "semantic_enabled", False):
        from app.rag.semantic_index import SemanticIndex, SemanticUnavailable

        try:
            semantic = SemanticIndex([c.context_heading + " " + c.text for c in store.chunks])
        except SemanticUnavailable as e:
            logging.getLogger("app").warning("semantic retrieval requested but unavailable: %s", e)
    return HybridRetriever(store, semantic)
