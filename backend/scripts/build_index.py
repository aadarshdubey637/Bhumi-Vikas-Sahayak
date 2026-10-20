"""Rebuild and verify the search index from the database (or a corpus file).

    python -m scripts.build_index                 # from DATABASE_URL
    python -m scripts.build_index --corpus data/processed/corpus_rules.jsonl
    python -m scripts.build_index --semantic      # also build embeddings (needs sentence-transformers)

The lexical (BM25) index is deterministic and built in memory at API start-up; this command
verifies that the stored chunks form a consistent index (unique evidence ids, every rule has
chunks, exact lookup resolves every rule) and runs smoke queries. It writes a manifest.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import sys
from pathlib import Path

from app.core.config import Settings
from app.rules.normalization import parse_rule_ref
from app.services.retrieval_service import RuleStore

SMOKE = [("open space front rear side", None), ("building permission fee", None), ("Rule 56", "56")]


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--corpus", type=Path, default=None, help="build from a corpus JSONL instead of the database")
    ap.add_argument("--database-url", default=None)
    ap.add_argument("--manifest", type=Path, default=Path("data/processed/index_manifest.json"))
    ap.add_argument("--semantic", action="store_true")
    a = ap.parse_args(argv)

    if a.corpus:
        store = RuleStore.from_files(a.corpus)
        source = str(a.corpus)
    else:
        from app.db.session import make_engine, make_session_factory
        from app.repositories.rule_repository import build_store
        url = a.database_url or Settings().database_url
        with make_session_factory(make_engine(url))() as s:
            store = build_store(s)
        source = "database"
    if store is None:
        print("No rules found. Run: python -m scripts.ingest_jsonl --load-db --migrate", file=sys.stderr)
        return 2
    problems: list[str] = []
    ids = [c.evidence_id for c in store.chunks]
    if len(ids) != len(set(ids)):
        problems.append("duplicate evidence ids")
    for r in store.records:
        if not r.chunks:
            problems.append(f"rule {r.official_rule_id} has no chunks")
        if not store.lookup(parse_rule_ref(r.official_rule_id, known_keys=store.known_keys)):  # type: ignore[arg-type]
            problems.append(f"exact lookup fails for rule {r.official_rule_id}")
    smoke = {}
    for q, _ in SMOKE:
        res = store.search(q, top_k=3)
        smoke[q] = [i.rule_number for i in res.items]
        if not res.items:
            problems.append(f"smoke query returned nothing: {q}")
    manifest = {"source": source, **store.stats(), "evidence_ids_sha256": hashlib.sha256("\n".join(sorted(ids)).encode()).hexdigest(),
                "smoke": smoke, "problems": problems, "semantic": "not built"}
    if a.semantic:
        from app.rag.semantic_index import SemanticIndex, SemanticUnavailable
        try:
            SemanticIndex([c.context_heading + " " + c.text for c in store.chunks])
            manifest["semantic"] = "built in memory (not persisted)"
        except SemanticUnavailable as e:
            manifest["semantic"] = f"unavailable: {e}"
    a.manifest.parent.mkdir(parents=True, exist_ok=True)
    a.manifest.write_text(json.dumps(manifest, indent=2, ensure_ascii=False), encoding="utf-8")
    print(json.dumps(manifest, indent=2, ensure_ascii=False))
    return 1 if problems else 0


if __name__ == "__main__":
    raise SystemExit(main())
