"""Retrieval accuracy on the real corpus. Labels are ASSISTANT-PROPOSED and unreviewed (data/evaluation/expected_rules.json): these tests
are a regression floor, not a claim of legal accuracy."""
from __future__ import annotations

import json
from pathlib import Path

import pytest

from app.channels.passages import best_passage_in_chunks
from app.rag.lexical_index import tokenize
from app.rag.query import LEGAL_GLOSSARY, ROMAN_HI_GLOSSARY, normalize_query
from app.services.question_service import ask
from scripts.evaluate_retrieval import distinct_rules, run

pytestmark = pytest.mark.real_corpus
EVAL = Path(__file__).resolve().parents[2] / "data/evaluation"
CASES = json.loads((EVAL / "expected_rules.json").read_text(encoding="utf-8"))["cases"]
OUT = json.loads((EVAL / "out_of_scope_questions.json").read_text(encoding="utf-8"))["questions"]


def test_accuracy_floor_and_no_offtopic_answers(store, amendments):
    res = run(store, amendments, CASES, OUT)
    assert res["hit@5"] >= 0.9, res
    assert res["hit@1"] >= 0.75, res
    assert res["out_of_scope_wrongly_answered"] == []
    assert res["abstain_correct"] == "2/2"


@pytest.mark.parametrize("case", [c for c in CASES if c["expect_any"]], ids=lambda c: f"q{c['id']}")
def test_each_labelled_question_finds_a_labelled_rule_in_top5_or_is_a_known_miss(store, amendments, case):
    known_misses = {11}  # Q11 depends on an unverified August 2026 amendment; its label is the least certain
    rules = distinct_rules(ask(store, amendments, case["q"]).evidence)
    if case["id"] in known_misses:
        pytest.skip("known miss, see data/evaluation/expected_rules.json")
    assert set(case["expect_any"]) & set(rules[:5]), (case["q"], rules)


@pytest.mark.parametrize("q", OUT)
def test_out_of_scope_questions_abstain(store, amendments, q):
    r = ask(store, amendments, q)
    assert r.status == "not_established" and r.evidence == [], (q, r.status, [e["rule_number"] for e in r.evidence])


def test_glossary_targets_exist_in_the_rules_vocabulary(store):
    """Every legal/English term a glossary maps to must occur somewhere in the rule text, else it can never help (or it hides a typo)."""
    vocab = set(store.index.idf)
    missing: dict[str, list[str]] = {}
    chained = {t for k in LEGAL_GLOSSARY for t in tokenize(k)}  # lay words that are themselves mapped on to legal terms in a second step
    for table in (LEGAL_GLOSSARY, ROMAN_HI_GLOSSARY):
        for lay, legal in table.items():
            absent = [t for t in tokenize(legal) if t not in vocab and t not in chained]
            if absent:
                missing[lay] = absent
    assert missing == {}, missing


def test_hinglish_function_words_do_not_dilute_confidence():
    toks = set(normalize_query("authority ne jawab nahi diya to kya hoga, kitne din me permission mil jaati hai").tokens)
    assert set(tokenize("limitation period deemed sanctioned permission days")) <= toks
    assert not toks & {"kya", "hoga", "kitne", "jaati", "nahi"}


@pytest.mark.parametrize("q,must_contain", [
    ("I applied for building permission and the authority has not replied. What happens if they miss the deadline?",
     "deemed to have been sanctioned"),
    ("My development permission was granted in 2023. How long does it stay valid, and how many times can I renew it?",
     "three years"),
])
def test_deciding_sentence_is_found_verbatim(store, amendments, q, must_contain):
    r = ask(store, amendments, q)
    rule_key = r.evidence[0]["rule_key"]
    nq = normalize_query(q, None, store.known_keys)
    found = best_passage_in_chunks(store.by_key[rule_key].chunks, lambda c: c.text, nq.tokens, store.index.idf)
    assert found is not None
    chunk, p = found
    assert chunk.text[p.start:p.end] == p.text   # exact substring of the stored chunk, never rewritten
    assert must_contain in " ".join(p.text.split()), p.text
