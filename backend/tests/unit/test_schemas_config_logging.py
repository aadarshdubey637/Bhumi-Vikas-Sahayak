import json
import logging

import pytest
from pydantic import ValidationError

from app.core.config import Settings
from app.core.logging import JsonFormatter, new_request_id, redact
from app.schemas.api import (
    AskRequest,
    AskResponse,
    FeedbackCreate,
    Measurement,
    RuleSearchRequest,
)


# ---- schemas ---------------------------------------------------------------------------
def test_ask_request_limits_and_strictness():
    assert AskRequest(question="  hello ").question == "hello"
    for bad in [{"question": ""}, {"question": "   "}, {"question": "x" * 1001}, {"question": "a", "extra": 1},
                {"question": "a", "language": "fr"}, {"question": "a", "as_of": "13-10-2026"}]:
        with pytest.raises(ValidationError):
            AskRequest(**bad)


def test_measurement_is_a_string_number_with_unit():
    assert Measurement(value="10.5", unit="m").unit == "m"
    for bad in [{"value": "abc", "unit": "m"}, {"value": "1", "unit": ""}, {"value": 1e999, "unit": "m"}]:
        with pytest.raises(ValidationError):
            Measurement(**bad)


def test_feedback_category_enforced():
    FeedbackCreate(category="incorrect_citation", message="wrong page")
    with pytest.raises(ValidationError):
        FeedbackCreate(category="rude", message="x")


def test_rule_search_pagination_bounds():
    with pytest.raises(ValidationError):
        RuleSearchRequest(limit=0)
    with pytest.raises(ValidationError):
        RuleSearchRequest(limit=51)


def test_core_ask_result_validates_against_response_schema(store, amendments):
    from app.services.question_service import ask
    for q in ["My house faces a 10 m wide street and will be 9 m tall. How much open space do I leave at the front?",
              "Do I need separate development permission for a 300 sq m plot? (changed in August 2026)", "pay my property tax online"]:
        r = ask(store, amendments, q)
        AskResponse.model_validate(r.to_dict())  # raises if the core output drifts from the API contract


def test_response_rejects_unknown_status():
    with pytest.raises(ValidationError):
        AskResponse(answer="x", status="definitely_compliant", language="en", intent="x")


# ---- settings ------------------------------------------------------------------------------
def test_defaults_are_safe_and_llm_off():
    s = Settings.from_env({})
    assert s.env == "development" and s.llm_provider == "none" and "*" not in s.cors_origins


def test_production_rejects_wildcard_cors_and_sqlite():
    with pytest.raises(ValidationError):
        Settings.from_env({"APP_ENV": "production", "CORS_ORIGINS": "*", "DATABASE_URL": "postgresql+psycopg://u:p@h/db"})
    with pytest.raises(ValidationError):
        Settings.from_env({"APP_ENV": "production", "CORS_ORIGINS": "https://a.example"})
    prod = {"APP_ENV": "production", "CORS_ORIGINS": "https://a.example, https://b.example",
            "DATABASE_URL": "postgresql+psycopg://u:p@h/db"}
    with pytest.raises(ValidationError):  # production must enforce authentication
        Settings.from_env(prod)
    s = Settings.from_env({**prod, "AUTH_MODE": "api_key", "API_KEY_HASHES": "clerk1:" + "a" * 64})
    assert s.cors_origins == ["https://a.example", "https://b.example"]
    assert s.api_key_map == {"a" * 64: "clerk1"}
    assert "a" * 64 not in repr(s) and "a" * 64 not in s.model_dump_json()


def test_api_key_mode_requires_hashes():
    with pytest.raises(ValidationError):
        Settings.from_env({"AUTH_MODE": "api_key"})


def test_anthropic_requires_key_and_key_is_not_printed():
    with pytest.raises(ValidationError):
        Settings.from_env({"LLM_PROVIDER": "anthropic"})
    s = Settings.from_env({"LLM_PROVIDER": "anthropic", "ANTHROPIC_API_KEY": "sk-ant-SECRETVALUE123"})
    assert "SECRETVALUE" not in repr(s) and "SECRETVALUE" not in s.model_dump_json()


# ---- logging -------------------------------------------------------------------------------
def test_redaction():
    assert "sk-ant-abcdefgh1234" not in redact("key sk-ant-abcdefgh1234 used")
    assert "hunter2" not in redact("password=hunter2")


def test_json_log_has_request_id_and_no_secrets():
    rid = new_request_id()
    rec = logging.LogRecord("t", logging.INFO, "f", 1, "api_key=abc123 happened", None, None)
    out = json.loads(JsonFormatter().format(rec))
    assert out["request_id"] == rid and "abc123" not in out["msg"]
