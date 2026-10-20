"""End-to-end /ask workflow against the REAL ingested corpus (no synthetic legal text)."""
import pytest

from app.services.evidence_service import validate_evidence
from app.services.question_service import ask, classify_intent

pytestmark = pytest.mark.real_corpus

OUT_OF_SCOPE = ["How do I pay my property tax online?", "What is the current market rate for land in Kolar Road, Bhopal?"]


@pytest.mark.parametrize("q", OUT_OF_SCOPE)
def test_out_of_scope_abstains(store, amendments, q):
    r = ask(store, amendments, q)
    assert r.status == "not_established" and r.evidence == []


def test_empty_store_returns_controlled_no_data():
    r = ask(None, [], "anything")
    assert r.status == "not_established" and "No rule corpus loaded." in r.warnings


def test_amendment_question_is_pending_not_answered(store, amendments):
    q = "Do I need separate development permission for a 300 sq m plot that matches the Development Plan? (Tip: this changed in August 2026.)"
    r = ask(store, amendments, q)
    assert r.status == "pending_verification"
    assert any("AMD-2026-08-28-R2-5-C" in w for w in r.warnings)
    assert r.calculations == []


def test_setback_question_states_the_front_open_space_with_a_verbatim_quote(store, amendments):
    r = ask(store, amendments, "My house faces a 10 m wide street and will be 9 m tall. How much open space do I leave at the front?")
    assert r.status == "supported"
    assert r.evidence and r.evidence[0]["rule_key"] == "56"
    assert "3.6 m" in r.answer and "Rule 56" in r.answer and "6 March 2025" in r.answer
    d = r.direct_answer
    assert d and d["rules"] == ["56"] and all(q["verified"] for q in d["quotes"])
    assert any("3.6 meters" in q["text"] for q in d["quotes"])  # the table row, verbatim
    facts = {f["name"]: f for f in r.extracted_facts}
    assert facts["road_width"]["value"] == "10"


def test_exact_rule_lookup_needs_no_ranking(store, amendments):
    r = ask(store, amendments, "Rule 52")
    assert r.intent == "rule_lookup"
    assert r.evidence[0]["rule_key"] == "52" and r.evidence[0]["retrieval_method"] == "exact_rule_number"


def test_inserted_rule_lookup(store, amendments):
    r = ask(store, amendments, "show me rule 26-B")
    assert r.evidence and r.evidence[0]["rule_key"] == "26b"


def test_unknown_rule_number_is_not_invented(store, amendments):
    r = ask(store, amendments, "Rule 999")
    assert r.evidence == [] and r.status == "not_established"


def test_hindi_question_runs_against_english_corpus(store, amendments):
    r = ask(store, amendments, "बिल्डिंग परमिशन की फीस कितनी है और किस नियम में लिखी है?")
    assert r.language == "hi" and r.evidence
    assert "21" in {e["rule_key"] for e in r.evidence}


def test_every_citation_resolves_to_stored_text(store, amendments):
    for q in ["Who is allowed to sign and submit my building plans?", "What documents go with an application for building permission?",
              "What are the rules for lifts in a building taller than 15 m?"]:
        r = ask(store, amendments, q)
        for e in r.evidence:
            stored = store.get_evidence(e["evidence_id"])
            assert stored is not None and stored.excerpt == e["excerpt"] and e["page_start"] and e["page_end"]
        assert r.rejected_evidence == []


def test_tampered_evidence_is_rejected(store):
    item = store.lookup(__import__("app.rules.normalization", fromlist=["parse_rule_ref"]).parse_rule_ref("56"))[0]
    item.excerpt = "invented legal text"
    v = validate_evidence(store, [item])
    assert v.valid == [] and "differs" in v.rejected[0][1]


def test_unverified_corpus_never_yields_supported(store, amendments):
    assert store.stats()["verified_rules"] == 0
    r = ask(store, amendments, "Rule 56")
    assert r.status != "supported"


@pytest.mark.parametrize("text,intent", [
    ("What is the fee for building permission?", "fees"), ("how many floors can I build", "floor_area"),
    ("pay my property tax online", "out_of_scope"), ("Rule 12", "rule_lookup"),
])
def test_intent_classification(text, intent):
    assert classify_intent(text, text.lower().startswith("rule")) == intent


def test_unknown_rule_warns_with_the_number(store, amendments):
    r = ask(store, amendments, "Rule 999")
    assert any("999" in w and "not found" in w for w in r.warnings)


def test_mixed_known_and_unknown_rule_keeps_known_and_warns(store, amendments):
    r = ask(store, amendments, "Compare Rule 56 and Rule 999")
    assert any(e["rule_key"] == "56" for e in r.evidence)
    assert any("999" in w for w in r.warnings)


# ---- regression: Hinglish question from a real user was answered "not established" with no evidence ----------------
HINGLISH_Q = ("Sir, mere paas 200 square metre ka plot hai aur road 9 metre chaudi hai. Mujhe ghar banane ke liye kitna setback "
              "chhodna hoga aur kitne floors bana sakta hoon?")


def test_hinglish_setback_floors_question_finds_rule_text(store, amendments):
    from app.services.question_service import ask
    r = ask(store, amendments, HINGLISH_Q)
    assert r.language == "hi-en" and r.status == "conditional" and r.evidence  # inputs inferred (plot type, height) are said so
    assert "56" in {e["rule_number"] for e in r.evidence}  # Rule 56: Residential Buildings
    assert {f["name"] for f in r.extracted_facts} >= {"plot_area", "road_width"}
    assert "3.0 मीटर" in r.answer and "1.25" in r.answer  # answered in Hindi: front 3.0 m, FAR 1.25


def test_off_topic_hinglish_and_english_still_abstain(store, amendments):
    from app.services.question_service import ask
    for q in ("mujhe ek achhi biryani ki recipe batao ji", "mere paas ek kutta hai aur wo bahut bhaunkta hai kya karu",
              "how to bake a chocolate cake", "Who won the cricket world cup?"):
        r = ask(store, amendments, q)
        assert r.status == "not_established" and r.evidence == [], q


def test_residential_is_not_mistaken_for_a_side_setback_question():
    from app.services.question_service import classify_intent
    assert classify_intent("how many floors can I build on a residential plot", False) == "floor_area"
    assert classify_intent("kitne floors bana sakta hoon", False) == "floor_area"
    assert classify_intent("side open space for residential plot", False) == "setback"
