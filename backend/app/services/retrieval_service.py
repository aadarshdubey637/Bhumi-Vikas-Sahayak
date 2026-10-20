"""Rule store + exact lookup + BM25 retrieval, returning traceable evidence items."""
from __future__ import annotations

import json
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any

from app.ingestion.jsonl import load_corpus
from app.rag.lexical_index import BM25Index, tokenize
from app.rag.query import NormalizedQuery, normalize_query
from app.rag.ranking import dedupe
from app.rules.normalization import RuleRef
from app.rules.schemas import Chunk, EmbeddedRule, RuleRecord


@dataclass
class EvidenceItem:
    evidence_id: str
    rule_key: str
    rule_number: str
    rule_title: str
    rule_version_id: str
    source_document_id: str
    page_start: int | None
    page_end: int | None
    page_precision: str
    excerpt: str
    verification_status: str
    retrieval_method: str
    score: float | None = None
    table_like: bool = False
    flags: list[str] = field(default_factory=list)
    is_embedded_rule: bool = False

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass
class SearchResult:
    items: list[EvidenceItem]
    total: int
    top_coverage: float
    query: NormalizedQuery
    note: str | None = None
    top_domain_hits: int = 0  # distinct building-regulation terms from the query found in the best chunk


_GENERIC_TITLE_WORDS = frozenset(["rule", "general", "provision", "other", "additional", "special", "power", "duty", "right", "requirement",
                                  "norm", "limitation", "responsibility", "condition", "issue", "grant"])
_DOMAIN_EXTRA = frozenset(["plot", "building", "floor", "storey", "height", "road", "street", "fee", "permission", "sanction", "parking",
                           "lift", "fire", "open", "space", "set", "back", "residential", "commercial", "farm", "development", "plan",
                           "electric", "balcony", "verandah", "basement", "staircase", "plinth", "drain", "construction", "ratio", "far"])


def _domain_terms(records: list[RuleRecord]) -> frozenset[str]:
    """Building-regulation vocabulary = words of the 106 rule titles (minus generic ones) plus a small reviewed list. A question whose
    matched words include fewer than two of these is treated as outside the rules, however well one stray word happens to match."""
    out: set[str] = set(_DOMAIN_EXTRA)
    for r in records:
        out.update(t for t in tokenize(r.title) if t.isalpha() and len(t) >= 3 and t not in _GENERIC_TITLE_WORDS)
    return frozenset(out)


class RuleStore:
    def __init__(self, records: list[RuleRecord], reviews: dict[str, dict[str, Any]] | None = None):
        self.records = records
        self.by_key = {r.rule_key: r for r in records}
        self.embedded: dict[str, tuple[RuleRecord, EmbeddedRule]] = {
            e.rule_key: (r, e) for r in records for e in r.embedded_rules
        }
        self.known_keys = set(self.by_key) | set(self.embedded)
        self.reviews = reviews or {}
        for r in records:
            rv = self.reviews.get(r.version_id)
            if rv and rv.get("verification_status") in ("verified", "rejected", "pending_verification"):
                r.verification_status = rv["verification_status"]
        self.chunks: list[Chunk] = [c for r in records for c in r.chunks]
        self._chunk_rec = {c.chunk_id: self.by_key[c.rule_key] for c in self.chunks}
        self.index = BM25Index([tokenize(c.context_heading + " " + c.text) for c in self.chunks])
        self.domain_terms = _domain_terms(records)

    @classmethod
    def from_files(cls, corpus_path: Path, reviews_path: Path | None = None) -> RuleStore:
        records = load_corpus(corpus_path)
        reviews: dict[str, dict[str, Any]] = {}
        if reviews_path and Path(reviews_path).exists():
            for line in Path(reviews_path).read_text(encoding="utf-8").splitlines():
                if line.strip():
                    d = json.loads(line)
                    reviews[d["version_id"]] = d
        return cls(records, reviews)

    # ---- helpers -------------------------------------------------------------------
    def _evidence(self, rec: RuleRecord, ch: Chunk, method: str, score: float | None) -> EvidenceItem:
        return EvidenceItem(
            evidence_id=ch.evidence_id, rule_key=rec.rule_key, rule_number=rec.official_rule_id,
            rule_title=rec.title, rule_version_id=rec.version_id, source_document_id=rec.source_document_id,
            page_start=ch.page_start, page_end=ch.page_end, page_precision=ch.page_precision,
            excerpt=ch.text, verification_status=rec.verification_status, retrieval_method=method,
            score=score, table_like=ch.table_like, flags=list(rec.flags),
        )

    def get_evidence(self, evidence_id: str) -> EvidenceItem | None:
        for c in self.chunks:
            if c.evidence_id == evidence_id:
                return self._evidence(self._chunk_rec[c.chunk_id], c, "evidence_lookup", None)
        return None

    def lookup(self, ref: RuleRef, max_chunks: int = 3) -> list[EvidenceItem]:
        """Exact rule-number lookup (no LLM, no ranking)."""
        if ref.key in self.by_key:
            rec = self.by_key[ref.key]
            chunks = rec.chunks
            if ref.path:
                chunks = self._clause_chunks(chunks, ref.path) or chunks
            return [self._evidence(rec, c, "exact_rule_number", None) for c in chunks[:max_chunks]]
        if ref.key in self.embedded:
            parent, emb = self.embedded[ref.key]
            ch = parent.chunks[0] if parent.chunks else None
            if not ch:
                return []
            item = self._evidence(parent, ch, "exact_rule_number", None)
            item.rule_number, item.excerpt = emb.official_rule_id, emb.text
            item.rule_key, item.is_embedded_rule = emb.rule_key, True
            item.flags = [*item.flags, "embedded_in_parent_record", "end_boundary_unverified"]
            item.evidence_id = f"EV-{emb.rule_key}-emb-{ch.content_hash[:8]}"
            return [item]
        return []

    @staticmethod
    def _clause_chunks(chunks: list[Chunk], path: tuple[str, ...]) -> list[Chunk]:
        """Chunks that contain the clause path as *line-start* clause markers, in order.
        Falls back to [] (caller then returns the whole rule) when the path is not found."""
        import re

        first = re.compile(rf"(?m)^\s{{0,12}}[\[\"]*\(\s*{re.escape(path[0])}\s*\)")
        start = next((i for i, c in enumerate(chunks) if first.search(c.text)), None)
        if start is None:
            return []
        if len(path) == 1:
            return chunks[start:start + 1]
        sub = re.compile(rf"(?m)^\s{{0,40}}[\[\"]*\(\s*{re.escape(path[1])}\s*\)")
        for i in range(start, min(start + 3, len(chunks))):
            if sub.search(chunks[i].text):
                return chunks[start:i + 1] if i > start else chunks[i:i + 1]
        return chunks[start:start + 1]

    # ---- search --------------------------------------------------------------------
    def search(
        self,
        query: str,
        top_k: int = 5,
        offset: int = 0,
        language: str | None = None,
        rule_keys: set[str] | None = None,
        part: str | None = None,
        verification_status: str | None = None,
    ) -> SearchResult:
        nq = normalize_query(query, language, self.known_keys)
        items: list[EvidenceItem] = []
        for ref in nq.rule_refs:
            items.extend(self.lookup(ref))
        pred = None
        if rule_keys or part or verification_status:
            def pred(i: int) -> bool:
                rec = self._chunk_rec[self.chunks[i].chunk_id]
                return (
                    (not rule_keys or rec.rule_key in rule_keys)
                    and (not part or rec.part == part)
                    and (not verification_status or rec.verification_status == verification_status)
                )
        hits = self.index.search(nq.tokens, top_k=offset + top_k + 20, predicate=pred)
        cov_terms = [t for t in nq.tokens if t.isalpha() and len(t) >= 3 and t not in nq.lay_tokens]  # numbers/units are user data; lay words were replaced by legal terms
        top_cov = self.index.coverage(cov_terms, hits[0][0]) if hits else 0.0
        top_dom = 0
        if hits:
            in_chunk = self.index.tf[hits[0][0]]
            top_dom = len({t for t in set(cov_terms) if t in self.domain_terms and in_chunk.get(t)})
        for i, sc in hits:
            c = self.chunks[i]
            items.append(self._evidence(self._chunk_rec[c.chunk_id], c, "bm25", round(sc, 4)))
        order = dedupe(it.evidence_id for it in items)
        uniq = {it.evidence_id: it for it in reversed(items)}  # exact match wins over bm25
        merged = [uniq[k] for k in order]
        note = "no rule matched the referenced rule number in the ingested corpus" if nq.rule_refs and not items else None
        return SearchResult(merged[offset: offset + top_k], len(merged), top_cov, nq, note=note, top_domain_hits=top_dom)

    def stats(self) -> dict[str, Any]:
        return {
            "rules": len(self.records), "chunks": len(self.chunks), "embedded_rules": len(self.embedded),
            "verified_rules": sum(r.verification_status == "verified" for r in self.records),
        }


def load_default_store(base: Path | None = None) -> RuleStore | None:
    base = base or Path(__file__).resolve().parents[2]
    corpus = base / "data/processed/corpus_rules.jsonl"
    if not corpus.exists():
        return None
    return RuleStore.from_files(corpus, base / "data/verified/rule_reviews.jsonl")
