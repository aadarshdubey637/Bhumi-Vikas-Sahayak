"""HTTP API over a SYNTHETIC corpus: contracts, statuses, errors, ownership, limits."""
import pytest
from fastapi.testclient import TestClient

from app.core.config import Settings
from app.main import create_app
from app.services.llm_service import LLMUnavailable
from tests.conftest import A_HDR, B_HDR, make_client

P = "/api/v1"
INPUTS = {"plot_length": {"value": "20", "unit": "m"}, "plot_width": {"value": "10", "unit": "m"},
          "plot_area": {"value": "200", "unit": "sqm"}, "building_use": "residential"}


# ---- ops --------------------------------------------------------------------------------------------
def _stamp_head(engine):
    from alembic.script import ScriptDirectory
    from sqlalchemy import text

    from app.db.migrate import alembic_config
    head = ScriptDirectory.from_config(alembic_config("sqlite://")).get_current_head()
    with engine.begin() as c:
        c.execute(text("CREATE TABLE alembic_version (version_num VARCHAR(32) NOT NULL)"))
        c.execute(text("INSERT INTO alembic_version VALUES (:v)"), {"v": head})


def test_health_and_ready(client, db_engine):
    assert client.get(f"{P}/health").json()["status"] == "ok"
    _stamp_head(db_engine)
    r = client.get(f"{P}/ready")
    assert r.status_code == 200 and r.json()["rules_loaded"] == 4 and r.json()["status"] == "ready"
    assert "sqlite" not in r.text.lower()  # no infrastructure details


def test_ready_reports_unmigrated_db_and_empty_corpus(empty_client):
    r = empty_client.get(f"{P}/ready")  # tables exist (create_all) but no alembic_version => not at head
    assert r.status_code == 503 and r.json()["checks"]["schema_current"] is False
    assert any("alembic upgrade head" in n for n in r.json()["notes"])


def test_openapi_lists_required_endpoints(client):
    paths = client.get("/openapi.json").json()["paths"]
    for p in ("/ask", "/rules/search", "/rules/{rule_id}", "/rules/{rule_id}/versions", "/projects", "/projects/{project_id}",
              "/assessments", "/assessments/{assessment_id}", "/assessments/{assessment_id}/evidence", "/calculations/plot-area",
              "/calculations/assess", "/plots/preview", "/assessments/{assessment_id}/report", "/feedback", "/health", "/ready"):
        assert P + p in paths


def test_error_envelope_and_request_id(client):
    r = client.post(f"{P}/ask", json={"question": ""})
    assert r.status_code == 422 and set(r.json()) == {"code", "message", "request_id", "details"}
    assert r.json()["code"] == "validation_error" and r.headers["x-request-id"] == r.json()["request_id"]
    assert client.get(f"{P}/nope").json()["code"] == "not_found"
    secret = client.post(f"{P}/ask", json={"question": "x", "bogus": "SENSITIVE-VALUE"})
    assert "SENSITIVE-VALUE" not in secret.text  # submitted values are never echoed back


def test_unknown_fields_rejected(client):
    assert client.post(f"{P}/ask", json={"question": "fee?", "bogus": 1}).status_code == 422


# ---- empty database ---------------------------------------------------------------------------------
def test_empty_corpus_gives_clear_no_data(empty_client):
    r = empty_client.post(f"{P}/rules/search", json={"query": "open space"})
    assert r.status_code == 200 and r.json()["items"] == [] and "ingest" in r.json()["note"]
    a = empty_client.post(f"{P}/ask", json={"question": "open space at front?"}).json()
    assert a["status"] == "not_established" and a["evidence"] == []


# ---- rules ------------------------------------------------------------------------------------------
def test_exact_rule_lookup_and_alias_forms(client):
    for q in ("26-B", "26 B", "Rule 26(B)", "rule 26b"):
        r = client.post(f"{P}/rules/search", json={"rule_number": q}).json()
        assert r["items"] and r["items"][0]["rule_number"] == "26-B" and r["items"][0]["retrieval_method"] == "exact_rule_number"


def test_unknown_rule_number_returns_nothing_not_neighbours(client):
    r = client.post(f"{P}/rules/search", json={"rule_number": "999"}).json()
    assert r["items"] == [] and "not found" in r["note"]


def test_bm25_search_filters_and_pagination(client):
    r = client.post(f"{P}/rules/search", json={"query": "synthetic open space front", "limit": 2}).json()
    assert 0 < len(r["items"]) <= 2 and r["items"][0]["rule_number"] == "5"
    assert client.post(f"{P}/rules/search", json={"query": "synthetic", "verification_status": "verified"}).json()["items"] == []
    assert client.post(f"{P}/rules/search", json={"query": "synthetic", "document_key": "NOPE"}).json()["items"] == []
    both = client.post(f"{P}/rules/search", json={"query": "synthetic", "document_key": "SYN-DOC-1", "limit": 50}).json()
    assert both["total"] >= 4
    p2 = client.post(f"{P}/rules/search", json={"query": "synthetic", "limit": 1, "offset": 1}).json()
    assert len(p2["items"]) == 1
    assert client.post(f"{P}/rules/search", json={}).status_code == 422
    assert client.post(f"{P}/rules/search", json={"query": "x", "limit": 500}).status_code == 422


def test_every_citation_resolves_to_a_stored_record(client):
    for it in client.post(f"{P}/rules/search", json={"query": "synthetic fee permission", "limit": 5}).json()["items"]:
        got = client.get(f"{P}/evidence/{it['evidence_id']}")
        assert got.status_code == 200 and got.json()["excerpt"] == it["excerpt"] and got.json()["page_start"]
    assert client.get(f"{P}/evidence/EV-fake-000-deadbeef").status_code == 404


def test_rule_detail_versions_and_amendment_status(client):
    r = client.get(f"{P}/rules/2").json()
    assert r["official_rule_id"] == "2" and len(r["versions"]) == 1
    vr = r["version_resolution"]
    assert vr["status"] == "pending_verification"  # linked amendment is unverified
    assert vr["linked_amendments"][0]["effective_date"] is None  # unknown stays unknown
    assert client.get(f"{P}/rules/5").json()["linked_amendments"] == []
    v = client.get(f"{P}/rules/2/versions").json()
    assert v["items"][0]["original_text"].startswith("2.") and v["items"][0]["source_document"]["document_key"] == "SYN-DOC-1"
    assert client.get(f"{P}/rules/12345").status_code == 404
    assert client.get(f"{P}/rules/2?as_of=notadate").status_code == 422


def test_documents_listing(client):
    assert client.get(f"{P}/documents").json()["items"][0]["verification_status"] == "unverified"


def test_amendment_register_is_listed_as_recorded_never_verified_or_dated_by_inference(client):
    body = client.get(f"{P}/amendments").json()
    assert "note" in body and body["items"], "the shipped register has at least one entry"
    for a in body["items"]:
        assert a["verification_status"] != "verified"            # nothing has been human-verified
        assert a["effective_date"] is None                        # unknown stays unknown (never copied from the stated date)
    assert {"amendment_id", "title", "stated_date", "affects", "source_url"} <= body["items"][0].keys()


# ---- ask ----------------------------------------------------------------------------------------------
def test_ask_never_claims_supported_on_unverified_text(client):
    a = client.post(f"{P}/ask", json={"question": "open space at the front of a building?"}).json()
    assert a["status"] == "pending_verification" and a["evidence"] and a["calculations"] == []
    assert any("not been human-verified" in w for w in a["warnings"])


def test_ask_out_of_scope_abstains(client):
    a = client.post(f"{P}/ask", json={"question": "How do I pay my property tax online?"}).json()
    assert a["status"] == "not_established" and a["evidence"] == []


def test_ask_unknown_rule_number_abstains(client):
    a = client.post(f"{P}/ask", json={"question": "What does Rule 999 say?"}).json()
    assert a["status"] == "not_established" and a["evidence"] == []


def test_ask_amendment_question_flags_pending_amendment(client):
    a = client.post(f"{P}/ask", json={"question": "Has the definition of plot in Rule 2(5)(c) changed in 2026?"}).json()
    assert a["status"] == "pending_verification"
    assert any("SYN-AMD-1" in w for w in a["warnings"])
    assert a["version_status"] and a["version_status"][0]["linked_amendments"][0]["effective_date"] is None


def test_conversation_memory_carries_facts(client):
    q1 = client.post(f"{P}/ask", json={"question": "Front open space for my 150 sq m plot on a 9 m wide road?"}).json()
    cid = q1["conversation_id"]
    assert cid and {f["name"] for f in q1["extracted_facts"]} >= {"plot_area", "road_width"}
    q2 = client.post(f"{P}/ask", json={"question": "And what about rear open space?", "conversation_id": cid}).json()
    names = {f["name"]: f for f in q2["extracted_facts"]}
    assert names["plot_area"]["value"] == "150" and names["plot_area"]["origin"] == "structured_context"
    assert q2["conversation_id"] == cid


def test_structured_context_validated(client):
    ok = client.post(f"{P}/ask", json={"question": "open space?", "context": {"plot_area": {"value": "150", "unit": "sqm"}}})
    assert ok.status_code == 200
    bad = client.post(f"{P}/ask", json={"question": "open space?", "context": {"plot_area": {"value": "150", "unit": "m"}}})
    assert bad.status_code == 422 and bad.json()["code"] == "validation_error"
    assert client.post(f"{P}/ask", json={"question": "x?", "context": {"colour": "red"}}).status_code == 422


def test_hindi_question_answered(client):
    a = client.post(f"{P}/ask", json={"question": "मेरा प्लॉट 200 वर्ग मीटर का है और सामने 9 मीटर चौड़ी सड़क है। आगे कितनी जगह खाली छोड़नी होगी?"}).json()
    assert a["language"] in ("hi", "hi-en") and a["intent"] == "setback"


def test_explain_requires_provider_with_controlled_error(client):
    r = client.post(f"{P}/ask", json={"question": "open space front?", "explain": True})
    assert r.status_code == 503 and r.json()["code"] == "llm_unavailable"
    assert client.post(f"{P}/ask", json={"question": "open space front?"}).status_code == 200  # still works without an LLM


class FakeLLM:
    name = "fake"

    def __init__(self, text: str | Exception):
        self.text = text

    def complete(self, system, user, max_tokens):
        if isinstance(self.text, Exception):
            raise self.text
        return self.text.replace("{EID}", user.split('<evidence id="')[1].split('"')[0])


def _ask_explain(db_engine, llm):
    app = create_app(Settings.from_env({"DATABASE_URL": "sqlite://", "RATE_LIMIT_PER_MINUTE": "1000"}), engine=db_engine)
    app.state.llm = llm
    with TestClient(app) as c:
        return c.post(f"{P}/ask", json={"question": "open space at the front of the synthetic building?", "explain": True}).json()


def test_valid_llm_explanation_is_shown(db_engine, synthetic_loaded):
    a = _ask_explain(db_engine, FakeLLM('{"summary": "The excerpt is about open space at the front.", "cited_evidence_ids": ["{EID}"], "caveats": []}'))
    assert a["explanation"] and a["explanation_citations"] and a["status"] == "pending_verification"


@pytest.mark.parametrize("payload,why", [
    ('{"summary": "The front space is 12 m.", "cited_evidence_ids": ["{EID}"], "caveats": []}', "numbers"),
    ('{"summary": "See it.", "cited_evidence_ids": ["EV-made-up-000-00000000"], "caveats": []}', "unknown evidence"),
    ('{"summary": "The building complies with the rule.", "cited_evidence_ids": ["{EID}"], "caveats": []}', "compliance"),
    ('{"summary": "As per Rule 77 it is fine.", "cited_evidence_ids": ["{EID}"], "caveats": []}', "rule"),
    ("not json at all", "schema"),
])
def test_invalid_llm_output_is_rejected_and_omitted(db_engine, synthetic_loaded, payload, why):
    a = _ask_explain(db_engine, FakeLLM(payload))
    assert a["explanation"] is None and any("explanation" in w.lower() for w in a["warnings"]) and a["evidence"]


def test_llm_outage_degrades_to_deterministic_answer(db_engine, synthetic_loaded):
    a = _ask_explain(db_engine, FakeLLM(LLMUnavailable("timeout")))
    assert a["explanation"] is None and a["evidence"] and any("unavailable" in w for w in a["warnings"])


# ---- calculations / plots ------------------------------------------------------------------------------
def test_plot_area_trace_and_units(client):
    t = client.post(f"{P}/calculations/plot-area", json={"length": {"value": "20", "unit": "m"}, "width": {"value": "10", "unit": "m"}}).json()
    assert t["final_value"] == "200" and t["output_unit"] == "sqm" and t["verification_status"] == "not_applicable_general_arithmetic"
    t = client.post(f"{P}/calculations/plot-area", json={"length": {"value": "100", "unit": "ft"}, "width": {"value": "50", "unit": "ft"},
                                                         "output_unit": "sqft"}).json()
    assert t["final_value"] == "5000"
    for bad in ({"value": "0", "unit": "m"}, {"value": "-3", "unit": "m"}, {"value": "5", "unit": "sqm"}, {"value": "5", "unit": "furlong"}):
        assert client.post(f"{P}/calculations/plot-area", json={"length": bad, "width": {"value": "1", "unit": "m"}}).status_code == 422
    assert client.post(f"{P}/calculations/plot-area", json={"length": {"value": "abc", "unit": "m"}, "width": {"value": "1", "unit": "m"}}).status_code == 422


def test_assess_only_runs_implemented_checks(client):
    r = client.post(f"{P}/calculations/assess", json={"inputs": INPUTS}).json()
    ids = {c["check_id"]: c["status"] for c in r["checks"]}
    assert ids["geometry.plot_area_consistency"] == "passed"
    assert all(s == "not_evaluated" for k, s in ids.items() if k.startswith("regulatory."))
    assert r["overall_status"] == "incomplete" and r["persisted"] is False
    bad = client.post(f"{P}/calculations/assess", json={"inputs": {**INPUTS, "plot_area": {"value": "400", "unit": "sqm"}}}).json()
    assert bad["overall_status"] == "failed_checks_present"


def test_plot_preview_structure(client):
    r = client.post(f"{P}/plots/preview", json={"inputs": {**INPUTS, "road_width": {"value": "9", "unit": "m"}}}).json()
    assert r["geometry"]["points"] == [[0, 0], [10.0, 0], [10.0, 20.0], [0, 20.0]] and r["verified_constraints"] == []
    assert r["unresolved_constraints"] and r["annotations"][0]["source"] == "user_provided"
    assert client.post(f"{P}/plots/preview", json={"inputs": {}}).json()["geometry"] is None


# ---- projects / assessments / reports / feedback ----------------------------------------------------------
def _project(c, headers=None):
    r = c.post(f"{P}/projects", json={"name": "Test house", "inputs": INPUTS}, headers=headers or {})
    assert r.status_code == 201 and r.headers["location"].endswith(r.json()["id"])
    return r.json()


def test_project_crud_and_provenance(client):
    p = _project(client)
    assert p["building_use"] == "residential" and p["inputs"]["plot_area"] == {"value": "200", "unit": "sqm"}
    d = {i["name"]: i for i in p["input_details"]}
    assert d["plot_area"]["input_source"] == "user_provided" and d["plot_area"]["verification_status"] == "unverified"
    u = client.patch(f"{P}/projects/{p['id']}", json={"status": "active", "inputs": {"road_width": {"value": "9", "unit": "m"}}}).json()
    assert u["status"] == "active" and "road_width" in u["inputs"] and "plot_area" in u["inputs"]
    assert client.get(f"{P}/projects/{p['id']}").json()["name"] == "Test house"
    assert client.get(f"{P}/projects/{'0' * 32}").status_code == 404
    assert client.post(f"{P}/projects", json={"name": "x", "inputs": {"plot_area": {"value": "5", "unit": "m"}}}).status_code == 422
    assert client.get(f"{P}/projects?limit=1").json()["total"] == 1


def test_assessment_snapshot_evidence_and_history(client):
    p = _project(client)
    a = client.post(f"{P}/assessments", json={"project_id": p["id"]}).json()
    assert a["overall_status"] == "incomplete" and a["input_snapshot"]["plot_area"]["value"] == "200"
    ev = client.get(f"{P}/assessments/{a['id']}/evidence").json()["items"]
    assert ev and all(e["evidence_role"] == "related_context" and e["page_reference"] for e in ev)
    for e in ev:  # each stored evidence row resolves to a real record
        assert client.get(f"{P}/evidence/{e['evidence_id']}").status_code == 200
    client.patch(f"{P}/projects/{p['id']}", json={"inputs": {"plot_area": {"value": "300", "unit": "sqm"}}})
    assert client.get(f"{P}/assessments/{a['id']}").json()["input_snapshot"]["plot_area"]["value"] == "200"  # history untouched
    a2 = client.post(f"{P}/assessments", json={"project_id": p["id"]}).json()
    assert a2["id"] != a["id"] and a2["overall_status"] == "failed_checks_present"  # 300 != 20x10
    hist = client.get(f"{P}/projects/{p['id']}/assessments").json()
    assert hist["total"] == 2
    standalone = client.post(f"{P}/assessments", json={"inputs": INPUTS})
    assert standalone.status_code == 201 and standalone.json()["project_id"] is None
    assert client.post(f"{P}/assessments", json={"project_id": "f" * 32}).status_code == 404


def test_no_assessment_claims_compliance(client):
    a = client.post(f"{P}/assessments", json={"inputs": INPUTS}).json()
    assert "Not a compliance determination" in a["summary"] and a["overall_status"] != "evaluated_checks_passed"
    assert any("preliminary" in w for w in a["warnings"])


def test_report_from_saved_snapshot(client):
    a = client.post(f"{P}/assessments", json={"inputs": INPUTS}).json()
    assert client.get(f"{P}/assessments/{a['id']}/report").status_code == 404
    r = client.post(f"{P}/assessments/{a['id']}/report")
    assert r.status_code == 201
    rep = r.json()
    assert rep["input_snapshot"] == a["input_snapshot"] and len(rep["unevaluated_checks"]) == 5 and "Not an official approval" in rep["disclaimer"]
    assert rep["rule_versions_used"] and rep["evidence"]
    assert client.get(f"{P}/assessments/{a['id']}/report").json()["assessment_id"] == a["id"]


def test_feedback_validation_and_listing(client):
    a = client.post(f"{P}/assessments", json={"inputs": INPUTS}).json()
    ok = client.post(f"{P}/feedback", json={"category": "incorrect_citation", "message": "wrong page", "assessment_id": a["id"]})
    assert ok.status_code == 201 and ok.json()["resolution_status"] == "open"
    assert client.post(f"{P}/feedback", json={"category": "rude", "message": "x"}).status_code == 422
    assert client.post(f"{P}/feedback", json={"category": "other", "message": "x", "assessment_id": "0" * 32}).status_code == 404
    assert client.post(f"{P}/feedback", json={"category": "other", "message": "x", "evidence_id": "EV-nope"}).status_code == 404
    assert client.get(f"{P}/feedback").json()["total"] == 1


# ---- security ---------------------------------------------------------------------------------------------------
def test_auth_required_and_ops_endpoints_open(auth_client):
    assert auth_client.get(f"{P}/health").status_code == 200
    assert auth_client.post(f"{P}/ask", json={"question": "fee?"}).status_code == 401
    assert auth_client.post(f"{P}/ask", json={"question": "fee?"}, headers={"X-API-Key": "wrong"}).status_code == 401
    assert auth_client.post(f"{P}/ask", json={"question": "fee?"}, headers=A_HDR).status_code == 200


def test_resource_level_isolation_between_users(auth_client):
    p = _project(auth_client, A_HDR)
    a = auth_client.post(f"{P}/assessments", json={"project_id": p["id"]}, headers=A_HDR).json()
    for method, url, body in [("get", f"/projects/{p['id']}", None), ("patch", f"/projects/{p['id']}", {"name": "x"}),
                              ("get", f"/projects/{p['id']}/assessments", None), ("get", f"/assessments/{a['id']}", None),
                              ("get", f"/assessments/{a['id']}/evidence", None), ("post", f"/assessments/{a['id']}/report", None),
                              ("post", "/assessments", {"project_id": p["id"]}),
                              ("post", "/feedback", {"category": "other", "message": "x", "assessment_id": a["id"]})]:
        r = getattr(auth_client, method)(P + url, headers=B_HDR, **({"json": body} if body is not None else {}))
        assert r.status_code == 404, (method, url, r.status_code)  # 404, never 403: existence is not leaked
    assert auth_client.get(f"{P}/projects", headers=B_HDR).json()["total"] == 0
    assert auth_client.get(f"{P}/projects", headers=A_HDR).json()["total"] == 1
    assert auth_client.get(f"{P}/projects/{p['id']}", headers=A_HDR).status_code == 200


def test_conversations_are_owner_scoped(auth_client):
    cid = auth_client.post(f"{P}/ask", json={"question": "150 sq m plot open space?"}, headers=A_HDR).json()["conversation_id"]
    r = auth_client.post(f"{P}/ask", json={"question": "and rear?", "conversation_id": cid}, headers=B_HDR)
    assert r.status_code == 404


def test_body_size_limit(db_engine, synthetic_loaded):
    with make_client(db_engine, {"MAX_REQUEST_BYTES": "1024"}) as c:
        r = c.post(f"{P}/ask", content=b'{"question": "' + b"a" * 2000 + b'"}', headers={"Content-Type": "application/json"})
        assert r.status_code == 413 and r.json()["code"] == "payload_too_large"


def test_question_length_limit(client):
    assert client.post(f"{P}/ask", json={"question": "a" * 1001}).status_code == 422


def test_rate_limit_returns_429_with_retry_after(db_engine, synthetic_loaded):
    with make_client(db_engine, {"RATE_LIMIT_PER_MINUTE": "3"}) as c:
        codes = [c.post(f"{P}/ask", json={"question": "fee?"}).status_code for _ in range(5)]
        assert codes[:3] == [200, 200, 200] and codes[3:] == [429, 429]
        r = c.post(f"{P}/ask", json={"question": "fee?"})
        assert r.json()["code"] == "rate_limited" and int(r.headers["retry-after"]) >= 1
        assert c.get(f"{P}/health").status_code == 200  # probes are exempt


def test_rate_limit_is_not_bypassed_by_rotating_fake_api_keys(db_engine, synthetic_loaded):
    from tests.conftest import key_hash
    env = {"RATE_LIMIT_PER_MINUTE": "3", "AUTH_MODE": "api_key", "API_KEY_HASHES": f"alice:{key_hash('key-alice')}"}
    with make_client(db_engine, env) as c:
        codes = [c.get(f"{P}/documents", headers={"X-API-Key": f"guess-{i}"}).status_code for i in range(6)]
        assert codes == [401, 401, 401, 429, 429, 429]
        assert c.get(f"{P}/documents", headers=A_HDR).status_code == 200  # a valid key has its own bucket


def test_json_numbers_are_accepted_for_measurements_and_timestamps_are_utc(client):
    r = client.post(f"{P}/calculations/plot-area", json={"length": {"value": 20, "unit": "m"}, "width": {"value": 12.5, "unit": "m"}})
    assert r.status_code == 200 and r.json()["final_value"] == "250"
    assert client.post(f"{P}/calculations/plot-area", json={"length": {"value": True, "unit": "m"}, "width": {"value": 1, "unit": "m"}}).status_code == 422
    created = client.post(f"{P}/projects", json={"name": "tz"}).json()["created_at"]
    assert created.endswith(("Z", "+00:00"))


def test_cors_is_restrictive(client):
    ok = client.options(f"{P}/ask", headers={"Origin": "http://localhost:5173", "Access-Control-Request-Method": "POST"})
    assert ok.headers.get("access-control-allow-origin") == "http://localhost:5173"
    bad = client.options(f"{P}/ask", headers={"Origin": "https://evil.example", "Access-Control-Request-Method": "POST"})
    assert "access-control-allow-origin" not in bad.headers


def test_unhandled_error_is_generic(db_engine, synthetic_loaded):
    app = create_app(Settings.from_env({"DATABASE_URL": "sqlite://"}), engine=db_engine)

    @app.get("/boom")
    def boom():
        raise RuntimeError("secret-internal-detail")

    with TestClient(app, raise_server_exceptions=False) as c:
        r = c.get("/boom")
    assert r.status_code == 500 and "secret-internal-detail" not in r.text and r.json()["code"] == "internal_error"


def test_server_started_before_ingestion_picks_rules_up_without_restart(db_engine, session_factory):
    """Regression: a server started on an empty database showed 'No rules loaded' until it was restarted."""
    from tests.conftest import FIX, SYN_AMD, SYN_JSONL, make_client
    with make_client(db_engine) as c:
        before = c.get("/api/v1/ready").json()
        assert before["rules_loaded"] == 0 and before["checks"]["rules_loaded"] is False
        # rules are ingested while the server is already running
        from app.ingestion.jsonl import ingest_jsonl
        from app.repositories import rule_repository as repo
        records, _ = ingest_jsonl(SYN_JSONL)
        with session_factory() as s:
            doc = repo.get_or_create_source_document(s, "SYN-DOC-1", title="SYNTHETIC", document_type="rulebook", language="en",
                                                     verification_status="unverified")
            repo.import_records(s, records, doc)
            repo.import_amendments(s, SYN_AMD)
            s.commit()
        assert FIX.exists()
        import time
        time.sleep(3.2)  # the reload is throttled to once per few seconds
        after = c.get("/api/v1/ready").json()
        assert after["rules_loaded"] > 0 and after["checks"]["rules_loaded"] is True
        r = c.post("/api/v1/rules/search", json={"query": "fee"})
        assert r.status_code == 200 and "No rules have been ingested" not in (r.json().get("note") or "")
