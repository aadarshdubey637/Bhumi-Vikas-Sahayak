"""Retrieval accuracy on data/evaluation/expected_rules.json (ASSISTANT-PROPOSED, unreviewed labels).

    python -m scripts.evaluate_retrieval              # corpus file (data/processed/corpus_rules.jsonl)
    python -m scripts.evaluate_retrieval --db         # DATABASE_URL
    python -m scripts.evaluate_retrieval -v --json out.json --min-hit5 0.9

For every case the full /ask pipeline runs. hit@k = a labelled rule is among the first k *distinct* cited rules. Cases labelled with
an empty list must abstain (status not_established, no evidence). These labels were NOT reviewed by a lawyer, so the numbers are a
regression signal, not an accuracy claim.
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from app.core.config import Settings
from app.services.question_service import ask
from app.services.retrieval_service import RuleStore
from app.services.version_service import load_amendments

LABELS = Path("data/evaluation/expected_rules.json")
OUT_OF_SCOPE = Path("data/evaluation/out_of_scope_questions.json")


def distinct_rules(evidence: list[dict]) -> list[str]:
    out: list[str] = []
    for e in evidence:
        if e["rule_number"] not in out:
            out.append(e["rule_number"])
    return out


def run(store: RuleStore, amendments, cases: list[dict], out_of_scope: list[str] | None = None) -> dict:
    rows, hits = [], {1: 0, 3: 0, 5: 0}
    answerable = [c for c in cases if c["expect_any"]]
    neg_ok = neg = 0
    for c in cases:
        r = ask(store, amendments, c["q"])
        rules = distinct_rules(r.evidence)
        exp = set(c["expect_any"])
        row = {"id": c["id"], "status": r.status, "rules": rules[:5], "expect": sorted(exp)}
        if exp:
            for k in hits:
                if exp & set(rules[:k]):
                    hits[k] += 1
            row["hit_at"] = next((k for k in (1, 3, 5) if exp & set(rules[:k])), None)
        else:
            neg += 1
            row["abstained"] = r.status == "not_established" and not r.evidence
            neg_ok += row["abstained"]
        rows.append(row)
    wrong = [q for q in (out_of_scope or []) if (lambda r: r.status != "not_established" or bool(r.evidence))(ask(store, amendments, q))]
    n = len(answerable)
    return {"out_of_scope_probed": len(out_of_scope or []), "out_of_scope_wrongly_answered": wrong,"labels_status": "unreviewed_assistant_proposed", "answerable": n, "hit@1": hits[1] / n, "hit@3": hits[3] / n,
            "hit@5": hits[5] / n, "abstain_correct": f"{neg_ok}/{neg}", "rows": rows}


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--db", action="store_true")
    ap.add_argument("--corpus", type=Path, default=Path("data/processed/corpus_rules.jsonl"))
    ap.add_argument("--json", type=Path, default=None)
    ap.add_argument("--min-hit5", type=float, default=None, help="exit 1 if hit@5 is below this")
    ap.add_argument("-v", "--verbose", action="store_true")
    a = ap.parse_args(argv)
    if a.db:
        from app.db.session import make_engine, make_session_factory
        from app.repositories.rule_repository import build_store, load_amendment_dataclasses
        with make_session_factory(make_engine(Settings().database_url))() as s:
            store, amendments = build_store(s), load_amendment_dataclasses(s)
    else:
        store, amendments = RuleStore.from_files(a.corpus), load_amendments(Path("data/pending/amendments_pending.json"))
    if store is None:
        print("no rules loaded", file=sys.stderr)
        return 2
    cases = json.loads(LABELS.read_text(encoding="utf-8"))["cases"]
    oos = json.loads(OUT_OF_SCOPE.read_text(encoding="utf-8"))["questions"]
    res = run(store, amendments, cases, oos)
    if a.verbose:
        for r in res["rows"]:
            print(f"[{r['id']:>2}] {r['status']:<21} hit@{r.get('hit_at')!s:<4} expect={r['expect']} got={r['rules']}")
    print(f"labels: {res['labels_status']}  answerable={res['answerable']}  hit@1={res['hit@1']:.2f}  hit@3={res['hit@3']:.2f}  "
          f"hit@5={res['hit@5']:.2f}  abstain_correct={res['abstain_correct']}  "
          f"out_of_scope_wrongly_answered={len(res['out_of_scope_wrongly_answered'])}/{res['out_of_scope_probed']}")
    if a.json:
        a.json.write_text(json.dumps(res, indent=2, ensure_ascii=False), encoding="utf-8")
    bad = res["out_of_scope_wrongly_answered"] or (a.min_hit5 is not None and res["hit@5"] < a.min_hit5)
    return 1 if bad else 0


if __name__ == "__main__":
    raise SystemExit(main())
