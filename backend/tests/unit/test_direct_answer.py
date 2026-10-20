"""The direct-answer layer: stated answers, verbatim quotes, language, version handling, honest abstention."""
from __future__ import annotations

import json
import re
from decimal import Decimal
from pathlib import Path

import pytest

from app.services import direct_answer as da
from app.services.entity_extraction_service import extract_facts
from app.services.question_service import ask
from app.services.retrieval_service import load_default_store
from app.services.version_service import load_amendments

BASE = Path(__file__).resolve().parents[2]
GOLDEN = json.loads((BASE / "data/evaluation/golden_answers.json").read_text(encoding="utf-8"))["cases"]


@pytest.fixture(scope="module")
def store():
    s = load_default_store(BASE)
    if s is None:
        pytest.skip("real corpus not ingested")
    return s


@pytest.fixture(scope="module")
def amendments():
    return load_amendments(BASE / "data/pending/amendments_pending.json")


def _ws(s: str) -> str:
    return re.sub(r"\s+", " ", s)


@pytest.mark.parametrize("case", GOLDEN, ids=lambda c: f"q{c['id']}")
def test_golden_answer(store, amendments, case):
    r = ask(store, amendments, case["q"])
    if not case["rules"]:
        assert r.status == "not_established" and r.direct_answer is None and r.evidence == []
        return
    d = r.direct_answer
    assert d is not None, "no stated answer"
    assert set(case["rules"]) <= set(d["rules"]), (case["rules"], d["rules"])
    for needle in case.get("must_contain", []):
        assert needle in r.answer, f"{needle!r} missing from the answer:\n{r.answer}"
    quotes = _ws(" ".join(q["text"] for q in d["quotes"]))
    for needle in case.get("quote_contains", []):
        assert needle in quotes, f"{needle!r} missing from the quotes"
    if "status" in case:
        assert r.status == case["status"]
    if "language" in case:
        assert r.language == case["language"]
    assert "6 March 2025" in r.answer and r.source_version.endswith("6 March 2025")


@pytest.mark.parametrize("case", [c for c in GOLDEN if c["rules"]], ids=lambda c: f"q{c['id']}")
def test_every_quote_is_verbatim_source_text_with_a_page(store, amendments, case):
    d = ask(store, amendments, case["q"]).direct_answer
    assert d and d["quotes"]
    for q in d["quotes"]:
        assert q["verified"] is True and q["page_start"] and q["page_end"]
        key = re.sub(r"[^0-9a-z]", "", q["rule_number"].lower())
        rec = store.by_key.get(key) or store.by_key[re.match(r"\d+", key).group(0)]
        src = _ws(rec.original_text)
        for line in q["text"].splitlines():
            assert _ws(line) in src, line


@pytest.mark.parametrize("road,front", [(3, "3.0"), (9, "3.0"), (9.01, "3.6"), (12, "3.6"), (12.5, "4.5"), (18, "4.5"), (18.5, "6.0")])
def test_front_open_space_band_boundaries(store, amendments, road, front):
    r = ask(store, amendments, f"How much front open space for a house on a {road} m wide road?")
    assert f"minimum {front} m" in r.answer, r.answer


@pytest.mark.parametrize("plot,rear", [(40, "Nil"), (40.5, "1.50"), (150, "1.50"), (151, "2.50"), (225, "2.50"), (226, "3.00")])
def test_rear_open_space_band_boundaries(store, amendments, plot, rear):
    r = ask(store, amendments, f"What is the rear open space for a {plot} sq m residential plot?")
    assert (rear if rear == "Nil" else f"minimum {rear} m") in r.answer, r.answer


@pytest.mark.parametrize("area,fee", [(75, 750), (76, 1250), (125, 1250), (126, 2000), (300, 3000), (301, 4000), (2500, 25000), (2501, 50000)])
def test_permission_fee_slab_boundaries(store, amendments, area, fee):
    r = ask(store, amendments, f"What is the fee for a residential house with {area} sq m built-up area?")
    assert f"Rs {fee:,}" in r.answer and f"Rs {area:,}" in r.answer, r.answer  # permission slab + application fee Rs 1/sq m


def test_built_up_area_is_not_mistaken_for_plot_area():
    names = {f.name: f.value for f in extract_facts("fee for built-up area of 120 sq m on a 200 sq m plot")}
    assert names["built_up_area"] == "120" and names["plot_area"] == "200"
    assert {f.name for f in extract_facts("150 वर्ग मीटर निर्मित क्षेत्र")} == {"built_up_area"}


def test_square_feet_are_converted(store, amendments):
    r = ask(store, amendments, "rear open space for a 1500 sq ft plot")  # 139.35 sq m -> 1.50 m band
    assert "minimum 1.50 m" in r.answer


def test_how_far_is_not_read_as_the_FAR_abbreviation(store, amendments):
    r = ask(store, amendments, "How far must my balcony stay from a low-voltage overhead electric line?")
    assert r.direct_answer["rules"] == ["52"]


def test_taller_than_12_5_m_is_sent_to_rule_42_not_answered_from_rule_56(store, amendments):
    r = ask(store, amendments, "front open space for a 25 m tall building on 18 m road")
    assert "6.0 m" not in r.answer and "Rule 42" in r.answer


def test_missing_input_gives_the_table_and_asks_instead_of_guessing(store, amendments):
    r = ask(store, amendments, "How much front open space do I leave?")
    assert r.status == "insufficient_information" and r.follow_up_question and "road width" in r.follow_up_question
    assert "minimum 3" not in r.answer


def test_illustrative_fee_is_not_presented_as_the_answer(store, amendments):
    r = ask(store, amendments, "plot 200 sq m, what fee do I pay?")
    assert "depends on the built-up area" in r.answer and r.status != "supported"


def test_hindi_answers_use_devanagari_not_english_boilerplate(store, amendments):
    r = ask(store, amendments, "मेरा प्लॉट 200 वर्ग मीटर का है और सामने 9 मीटर चौड़ी सड़क है। आगे कितनी जगह खाली छोड़नी होगी?")
    first = r.answer.splitlines()[0]
    assert first.startswith("उत्तर:") and "front" not in first and re.search(r"[ऀ-ॿ]", first)


def test_amendment_changes_the_status_only_where_the_amended_rule_decides(store, amendments):
    q11 = ask(store, amendments, "Do I need separate development permission for a 300 sq m plot that matches the Development Plan?")
    assert q11.status == "pending_verification" and q11.direct_answer["amendment_flag"]
    q10 = ask(store, amendments, "What is the minimum rear open space for a 150 sq m residential plot?")
    assert q10.status != "pending_verification" and any("28 Aug 2026" in w for w in q10.warnings)  # noted, not applied
    assert not any("Version note" in w for w in ask(store, amendments, "who can sign building plans").warnings)  # no plot size -> no note


def test_no_direct_answer_when_quotes_cannot_be_matched_to_the_source(store, amendments, monkeypatch):
    monkeypatch.setattr(da, "_quote", lambda *a, **k: None)
    r = ask(store, amendments, "front open space for a house on a 9 m road")
    assert r.direct_answer is None and "Front open space: minimum" not in r.answer  # falls back to the plain rule pointers


def test_out_of_scope_and_unknown_rule_still_abstain(store, amendments):
    for q in ("How do I pay my property tax online?", "What is Rule 999?"):
        assert ask(store, amendments, q).status == "not_established"


def test_setback_and_far_carry_structured_numeric_requirements(store, amendments):
    ctx = {"plot_area": {"value": "200", "unit": "sqm"}, "road_width": {"value": "9", "unit": "m"}}
    d = ask(store, amendments, "What front, rear and side open space and floor area ratio apply?", context=ctx).direct_answer
    reqs = {r["key"]: r for r in d["requirements"]}
    assert (reqs["front_open_space"]["limit"], reqs["front_open_space"]["value"]) == ("min", "3.0")
    assert reqs["rear_open_space"]["value"] == "2.50" and reqs["rear_open_space"]["unit"] == "m"
    assert reqs["max_floor_area"]["limit"] == "max" and reqs["max_floor_area"]["value"] == "250"


def test_no_requirements_without_the_inputs_or_above_12_5_m(store, amendments):
    d = ask(store, amendments, "What front open space applies?").direct_answer
    assert d["requirements"] == []
    tall = {"plot_area": {"value": "200", "unit": "sqm"}, "road_width": {"value": "9", "unit": "m"}, "building_height": {"value": "20", "unit": "m"}}
    assert ask(store, amendments, "What front open space applies?", context=tall).direct_answer["requirements"] == []


def test_hindi_floor_area_wording_reaches_the_far_answer(store, amendments):
    ctx = {"plot_area": {"value": "200", "unit": "sqm"}}
    for q in ("मेरे प्लॉट पर अधिकतम फ़्लोर एरिया कितना है?", "मेरे प्लॉट पर अधिकतम फ्लोर एरिया कितना है?"):
        d = ask(store, amendments, q, "hi", context=ctx).direct_answer
        assert d is not None and any(r["key"] == "max_floor_area" and r["value"] == "250" for r in d["requirements"]), q


def test_three_storey_question_on_a_30_by_40_ft_plot(store, amendments):
    r = ask(store, amendments, "Can I build a three-storey house on my 30 × 40 ft plot?")
    facts = {f["name"]: f for f in r.extracted_facts}
    assert facts["floors"]["value"] == "3"
    d = r.direct_answer
    reqs = {x["key"]: x for x in d["requirements"]}
    assert Decimal(reqs["max_floor_area"]["value"]) == Decimal("139.35")  # 30 x 40 ft = 111.48 sq m, FAR 1.25
    assert any("per floor" in ln for ln in d["lines"])
    assert "road_width" in d["missing"] or "building_height" in d["missing"]
    assert d["follow_up"]


def test_spelled_out_and_g_plus_floor_counts():
    for text, n in (("a two storey house", "2"), ("G+2 building", "3"), ("तीन मंजिल का मकान", "3"), ("4 floors", "4")):
        assert {f.name: f.value for f in extract_facts(text)}["floors"] == n, text


def test_missing_road_or_plot_returns_every_row_of_the_table(store, amendments):
    d = ask(store, amendments, "What front open space applies?").direct_answer
    front = [(s["lo"], s["hi"], s["value"]) for s in d["scenarios"] if s["key"] == "front_open_space"]
    assert front == [(None, "9", "3.0"), ("9", "12", "3.6"), ("12", "18", "4.5"), ("18", None, "6.0")]
    assert all(s["by"] == "road_width" and s["unit"] == "m" and s["rule"] == "56(1)(a)" for s in d["scenarios"] if s["key"] == "front_open_space")
    rear = ask(store, amendments, "What rear open space applies?").direct_answer
    assert [(s["lo"], s["hi"], s["value"]) for s in rear["scenarios"]] == [(None, "40", "0"), ("40", "150", "1.50"), ("150", "225", "2.50"), ("225", None, "3.00")]


def test_scenarios_match_what_the_solver_gives_when_the_input_is_known(store, amendments):
    from decimal import Decimal as D

    for road, expect in (("9", "3.0"), ("10", "3.6"), ("15", "4.5"), ("20", "6.0")):
        d = ask(store, amendments, "What front open space applies?", context={"road_width": {"value": road, "unit": "m"}}).direct_answer
        got = next(r for r in d["requirements"] if r["key"] == "front_open_space")["value"]
        assert D(got) == D(expect) and d["scenarios"] == []
