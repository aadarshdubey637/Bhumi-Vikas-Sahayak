import json

import pytest

from app.core.config import Settings
from app.core.exceptions import Unauthorized, ValidationFailed
from app.core.security import authenticate, hash_api_key
from app.services.input_service import normalize_inputs
from app.services.llm_service import (
    GroundedExplanation,
    LLMUnavailable,
    NullProvider,
    make_provider,
    parse_explanation,
    validate_explanation,
)
from app.services.retrieval_service import EvidenceItem


def _ev(text="The rear space shall be 3 m.", rule="56", eid="EV-56-000-abcdef12"):
    return EvidenceItem(eid, "56", rule, "Open spaces", "56@X", "X", 10, 10, "located_in_page_text", text, "unverified", "bm25")


# ---- input normalisation -------------------------------------------------------------------------
def test_normalize_inputs_canonicalises_units():
    out = normalize_inputs({"plot_area": {"value": "150", "unit": "Sq. M"}, "road_width": {"value": "9", "unit": "metres"},
                            "floors": {"value": "2", "unit": "count"}, "building_use": " Residential "})
    assert out["plot_area"] == {"value": "150", "unit": "sqm"} and out["road_width"]["unit"] == "m"
    assert out["floors"] == {"value": "2", "unit": "count"} and out["building_use"] == "residential"


@pytest.mark.parametrize("bad", [
    {"plot_area": {"value": "150", "unit": "m"}},          # wrong dimension
    {"road_width": {"value": "0", "unit": "m"}},           # zero
    {"road_width": {"value": "-9", "unit": "m"}},          # negative
    {"road_width": {"value": "nine", "unit": "m"}},        # not numeric
    {"road_width": {"value": "1e12", "unit": "m"}},        # implausible magnitude
    {"floors": {"value": "2.5", "unit": "count"}},         # fractional floors
    {"floors": {"value": "2", "unit": "m"}},               # wrong unit
    {"plot_depth": {"value": "1", "unit": "m"}},           # unknown name
    {"road_width": "9 m"},                                  # bare string for a measurement
    {"building_use": "<script>"},                           # unsafe text
])
def test_normalize_inputs_rejects(bad):
    with pytest.raises(ValidationFailed) as e:
        normalize_inputs(bad)
    assert e.value.details


# ---- LLM output validation ---------------------------------------------------------------------------
def test_parse_explanation_handles_fences_and_garbage():
    ok = parse_explanation('```json\n{"summary": "s", "cited_evidence_ids": ["a"]}\n```')
    assert isinstance(ok, GroundedExplanation) and ok.caveats == []
    for raw in ("nope", '{"summary": ""}', '{"x": 1}', "x" * 9000):
        with pytest.raises(LLMUnavailable):
            parse_explanation(raw)


def test_validate_explanation_accepts_grounded_text():
    e = GroundedExplanation(summary="Rule 56 gives the rear space as 3 m.", cited_evidence_ids=["EV-56-000-abcdef12"])
    assert validate_explanation(e, [_ev()], [], []) == []


@pytest.mark.parametrize("summary,ids,needle", [
    ("The rear space is 4 m.", ["EV-56-000-abcdef12"], "numbers"),
    ("Rear space is 3 m.", ["EV-other"], "unknown evidence"),
    ("Rear space is 3 m.", [], "no evidence"),
    ("Rule 99 says 3 m.", ["EV-56-000-abcdef12"], "rule"),
    ("Your plan is compliant, 3 m.", ["EV-56-000-abcdef12"], "compliance"),
])
def test_validate_explanation_rejects(summary, ids, needle):
    problems = validate_explanation(GroundedExplanation(summary=summary, cited_evidence_ids=ids), [_ev()], [], [])
    assert any(needle in p for p in problems), problems


def test_user_and_calculation_numbers_are_allowed():
    e = GroundedExplanation(summary="Your 150 plot gives 200 in the calculation, see 3 m.", cited_evidence_ids=["EV-56-000-abcdef12"])
    assert validate_explanation(e, [_ev()], ["150"], ["200"]) == []


def test_null_provider_and_factory():
    with pytest.raises(LLMUnavailable):
        NullProvider().complete("s", "u", 10)
    assert make_provider(Settings.from_env({})).name == "none"
    assert make_provider(Settings.from_env({"LLM_PROVIDER": "anthropic", "ANTHROPIC_API_KEY": "sk-ant-test-0000000000"})).name == "anthropic"


# ---- auth ---------------------------------------------------------------------------------------------------
def test_authenticate_maps_key_to_server_side_owner():
    s = Settings.from_env({"AUTH_MODE": "api_key", "API_KEY_HASHES": f"alice:{hash_api_key('k1')}"})
    assert authenticate(s, "k1").owner_id == "alice"
    for bad in (None, "", "k2"):
        with pytest.raises(Unauthorized):
            authenticate(s, bad)
    assert authenticate(Settings.from_env({}), None).owner_id is None


def test_json_dump_of_settings_hides_secrets():
    s = Settings.from_env({"AUTH_MODE": "api_key", "API_KEY_HASHES": "a:" + "b" * 64, "LLM_PROVIDER": "anthropic", "ANTHROPIC_API_KEY": "sk-ant-ZZZ123456789"})
    assert "ZZZ123456789" not in json.dumps(s.model_dump(mode="json")) and "b" * 64 not in repr(s)
