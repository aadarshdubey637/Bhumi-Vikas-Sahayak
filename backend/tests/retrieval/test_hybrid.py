"""Hybrid fusion logic with a FAKE semantic ranker (no model download; semantic search is optional)."""
from app.services.hybrid_retrieval_service import HybridRetriever
from app.services.retrieval_service import RuleStore
from tests.conftest import SYN_JSONL


def _store():
    from app.ingestion.jsonl import ingest_jsonl
    recs, _ = ingest_jsonl(SYN_JSONL)
    return RuleStore(recs)


class FakeSemantic:
    def __init__(self, order):
        self.order = order

    def search(self, query, top_k=10):
        return [(i, 1.0 - n * 0.1) for n, i in enumerate(self.order[:top_k])]


def test_without_semantic_equals_lexical():
    st = _store()
    a = HybridRetriever(st).search("synthetic fee permission", top_k=3)
    b = st.search("synthetic fee permission", top_k=3)
    assert [i.evidence_id for i in a.items] == [i.evidence_id for i in b.items]


def test_semantic_hits_are_fused_and_labelled():
    st = _store()
    fee_idx = next(i for i, c in enumerate(st.chunks) if c.rule_key == "9")
    res = HybridRetriever(st, FakeSemantic([fee_idx])).search("open space front", top_k=10)
    methods = {i.rule_key: i.retrieval_method for i in res.items}
    assert methods["9"] == "semantic"  # found only semantically
    assert methods["5"] in ("bm25", "hybrid")
    assert len({i.evidence_id for i in res.items}) == len(res.items)  # deduplicated


def test_exact_rule_number_stays_first_and_filters_apply():
    st = _store()
    idx9 = next(i for i, c in enumerate(st.chunks) if c.rule_key == "9")
    h = HybridRetriever(st, FakeSemantic([idx9]))
    res = h.search("Rule 26-B synthetic", top_k=5)
    assert res.items[0].retrieval_method == "exact_rule_number" and res.items[0].rule_number == "26-B"
    only5 = h.search("synthetic", top_k=10, rule_keys={"5"})
    assert only5.items and all(i.rule_key == "5" for i in only5.items)


def test_confidence_comes_from_lexical_signal_only():
    st = _store()
    idx9 = next(i for i, c in enumerate(st.chunks) if c.rule_key == "9")
    res = HybridRetriever(st, FakeSemantic([idx9])).search("zzzz qqqq unrelated", top_k=3)
    assert res.top_coverage == 0.0  # semantic similarity alone never makes the system confident
