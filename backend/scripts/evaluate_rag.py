"""Run the sample questions through /ask logic and report what the system did.

Metrics reported (only what the data supports; nothing is invented):
  * citation validity            every cited evidence id resolves to a stored record with page metadata
  * unsupported-answer handling  questions the source file labels out-of-scope must be ``not_established``
  * version-resolution           no answer may be ``supported`` while its evidence/version is unverified; amendment-linked
                                 rules must never resolve to ``verified_current`` with an unknown effective date
  * calculation correctness      data/evaluation/calc_cases.json (expected values derived from the formulas)
  * Recall@k / correctness       ONLY if reviewed labels exist in data/evaluation/labels.jsonl

IMPORTANT: data/evaluation/sample_questions.md ships WITHOUT reference answers or labelled
rule numbers.  This script therefore reports only (a) citation validity, (b) abstention
behaviour on the two questions the source file labels as outside the rules, and (c) the
retrieved rules for human review.  Recall@k / correctness require reviewed labels in
data/evaluation/labels.jsonl ({"id": 8, "expected_rules": ["17"]}); none are invented here.

    python -m scripts.evaluate_rag
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from decimal import Decimal
from pathlib import Path

from app.services.calculation_service import plot_area, unit_conversion
from app.services.question_service import ask
from app.services.retrieval_service import load_default_store
from app.services.version_service import load_amendments

OUT_OF_SCOPE_IDS = {16, 17}  # labelled in sample_questions.md under "Outside the rules"


def parse_questions(path: Path) -> list[tuple[int, str]]:
    out = []
    for line in path.read_text(encoding="utf-8").splitlines():
        m = re.match(r"^\s*(\d+)\.\s+(.*\S)\s*$", line)
        if m:
            out.append((int(m.group(1)), m.group(2)))
    return out


def run_calc_cases(path: Path) -> tuple[int, int, list[str]]:
    ok, failures = 0, []
    cases = json.loads(path.read_text(encoding="utf-8"))["cases"]
    for c in cases:
        a = dict(c["args"])
        if c["op"] == "plot_area":
            r = plot_area(a["length"], a["width"], a.get("unit", "m"), a.get("output_unit", "sqm"))
        else:
            r = unit_conversion(a["value"], a["from_unit"], a["to_unit"], a.get("places", c.get("places", 4)))
        got = r.final_value if r.validation_status == "valid" else None
        same = got == c["expected"] or (got is not None and c["expected"] is not None and Decimal(got) == Decimal(c["expected"]))
        if same and (got is None or r.output_unit == c["unit"]):
            ok += 1
        else:
            failures.append(f"{c['id']}: expected {c['expected']} got {got}")
    return ok, len(cases), failures


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--db", action="store_true", help="evaluate against the database instead of the corpus file")
    ap.add_argument("--json-out", type=Path, default=None)
    ap.add_argument("--top-k", type=int, default=5)
    a = ap.parse_args(argv)
    base = Path(__file__).resolve().parents[1]
    if a.db:
        from app.core.config import Settings
        from app.db.session import make_engine, make_session_factory
        from app.repositories.rule_repository import build_store, load_amendment_dataclasses
        with make_session_factory(make_engine(Settings().database_url))() as s:
            store, amendments = build_store(s), load_amendment_dataclasses(s)
    else:
        store = load_default_store(base)
        amendments = load_amendments(base / "data/pending/amendments_pending.json")
    if store is None:
        print("No corpus. Run: python -m scripts.ingest_jsonl [--load-db --migrate]", file=sys.stderr)
        return 2
    qs = parse_questions(base / "data/evaluation/sample_questions.md")
    labels: dict[int, list[str]] = {}
    lp = base / "data/evaluation/labels.jsonl"
    if lp.exists():
        for line in lp.read_text(encoding="utf-8").splitlines():
            if line.strip():
                d = json.loads(line)
                labels[d["id"]] = d["expected_rules"]
    rows, citation_ok, citation_total, version_violations = [], 0, 0, []
    for qid, q in qs:
        r = ask(store, amendments, q, top_k=a.top_k)
        for e in r.evidence:
            citation_total += 1
            citation_ok += (store.get_evidence(e["evidence_id"]) is not None or e["retrieval_method"] == "exact_rule_number") and bool(e["page_start"])
        if r.status == "supported" and any(e["verification_status"] != "verified" for e in r.evidence)                 and not (r.direct_answer and r.direct_answer["quotes"] and all(q["verified"] for q in r.direct_answer["quotes"])):
            version_violations.append(f"Q{qid}: 'supported' without verbatim, source-matched quotes")
        for v in r.version_status:
            if v["status"] == "verified_current" and any(x["effective_date"] is None for x in v["linked_amendments"]):
                version_violations.append(f"Q{qid}: verified_current despite an amendment with unknown effective date")
        rows.append((qid, q, r))
        print(f"[{qid:>2}] status={r.status:<22} intent={r.intent:<22} rules={list(dict.fromkeys(e['rule_number'] for e in r.evidence))[:5]}")
    abst = [(qid, r.status) for qid, _, r in rows if qid in OUT_OF_SCOPE_IDS]
    metrics: dict = {"questions": len(qs), "citation_validity": f"{citation_ok}/{citation_total}",
                     "unsupported_answer_handling": "PASS" if all(s == "not_established" for _, s in abst) else "FAIL",
                     "version_resolution_violations": version_violations,
                     "status_distribution": {s: sum(1 for _, _, r in rows if r.status == s) for s in sorted({r.status for _, _, r in rows})}}
    gp = base / "data/evaluation/golden_answers.json"
    if gp.exists():
        ok_n, bad = 0, []
        cases = json.loads(gp.read_text(encoding="utf-8"))["cases"]
        for c in cases:
            r = ask(store, amendments, c["q"], top_k=a.top_k)
            d = r.direct_answer
            flat = " ".join(" ".join(q["text"].split()) for q in (d["quotes"] if d else []))
            good = ((r.status == "not_established" and d is None) if not c["rules"] else
                    d is not None and set(c["rules"]) <= set(d["rules"])
                    and all(n in r.answer for n in c.get("must_contain", []))
                    and all(n in flat for n in c.get("quote_contains", []))
                    and c.get("status", r.status) == r.status)
            ok_n += bool(good)
            if not good:
                bad.append(c["id"])
        metrics["answer_correctness_vs_golden"] = f"{ok_n}/{len(cases)}"
        metrics["answer_incorrect_ids"] = bad
        metrics["golden_label_status"] = "assistant-derived from the rule text; awaiting human review"
    cc = base / "data/evaluation/calc_cases.json"
    if cc.exists():
        ok, n, fails = run_calc_cases(cc)
        metrics["calculation_correctness"] = f"{ok}/{n}"
        metrics["calculation_failures"] = fails
    if labels:
        hit = sum(1 for qid, _, r in rows if qid in labels and set(labels[qid]) & {e["rule_number"] for e in r.evidence})
        metrics[f"recall_at_{a.top_k}"] = f"{hit}/{len(labels)}"
    else:
        metrics["recall_and_answer_correctness"] = "NOT COMPUTED (no reviewed labels supplied; none invented)"
    print("\n== metrics (only what the data supports) ==")
    print(json.dumps(metrics, indent=2))
    if a.json_out:
        a.json_out.write_text(json.dumps({"metrics": metrics, "answers": [{"id": i, "question": q, **r.to_dict()} for i, q, r in rows]},
                                         indent=2, ensure_ascii=False), encoding="utf-8")
    failed = (metrics["unsupported_answer_handling"] == "FAIL" or version_violations or metrics.get("calculation_failures")
              or metrics.get("answer_incorrect_ids"))
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
