"""Accounts end to end against a real (in-memory) database: registration, login, sessions, lock-out, password reset, guest isolation."""
from __future__ import annotations

import logging
import re
from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import select, text

from app.core.passwords import hash_password, password_problems, verify_password
from app.models import PasswordReset, User, UserSession
from tests.conftest import make_client

X = {"X-Requested-With": "nirmaansetu"}
PW = "Sunrise2026x"


@pytest.fixture
def acc(db_engine, synthetic_loaded):
    with make_client(db_engine, {"AUTH_MODE": "accounts", "SESSION_TTL_HOURS": "1"}) as c:
        yield c


def signup(c, email="asha@example.com", name="Asha Verma", password=PW):
    return c.post("/api/v1/auth/register", json={"name": name, "email": email, "password": password}, headers=X)


def test_password_hashing_is_salted_scrypt_and_policy_is_enforced():
    a, b = hash_password(PW), hash_password(PW)
    assert a != b and a.startswith("scrypt$") and PW not in a
    assert verify_password(PW, a) and not verify_password("wrong", a) and not verify_password(PW, "garbage")
    assert "too_short" in password_problems("a1")
    assert "needs_letter_and_digit" in password_problems("onlyletters")
    assert "too_guessable" in password_problems("asha2026zz", email="asha2026zz@example.com")
    assert password_problems(PW, "asha@example.com", "Asha Verma") == []


def test_register_sets_an_httponly_session_cookie_and_me_works(acc, db_engine):
    r = signup(acc)
    assert r.status_code == 201 and r.json()["email"] == "asha@example.com" and "password" not in r.text
    cookie = r.headers["set-cookie"].lower()
    assert "ns_session=" in cookie and "httponly" in cookie and "samesite=lax" in cookie
    me = acc.get("/api/v1/auth/me")
    assert me.status_code == 200 and me.json()["name"] == "Asha Verma"
    with db_engine.connect() as conn:  # nothing sensitive is stored in plain text
        assert conn.execute(text("select password_hash from users")).scalar().startswith("scrypt$")
        raw = acc.cookies.get("ns_session")
        assert raw and raw not in (conn.execute(text("select token_hash from user_sessions")).scalar() or "")


def test_registration_validation_and_duplicates(acc):
    assert signup(acc, email="not-an-email").status_code == 422
    r = signup(acc, password="short1")
    assert r.status_code == 422 and any(d["msg"] == "too_short" for d in r.json()["details"])
    assert signup(acc, password="allletterspw").status_code == 422
    assert signup(acc).status_code == 201
    dup = signup(acc, name="Other")
    assert dup.status_code == 409 and dup.json()["details"][0]["msg"] == "email_taken"
    assert signup(acc, email="ASHA@Example.com").status_code == 409  # e-mail is case-insensitive


def test_state_changing_calls_need_the_csrf_header(acc):
    r = acc.post("/api/v1/auth/register", json={"name": "A", "email": "a@example.com", "password": PW})
    assert r.status_code == 403 and r.json()["code"] == "forbidden"
    signup(acc)
    assert acc.post("/api/v1/projects", json={"name": "P"}).status_code == 403  # cookie-authenticated POST without the header


def test_login_logout_and_generic_errors(acc):
    signup(acc)
    acc.post("/api/v1/auth/logout", headers=X)
    assert acc.get("/api/v1/auth/me").status_code == 401
    bad = acc.post("/api/v1/auth/login", json={"email": "asha@example.com", "password": "Wrong2026x"}, headers=X)
    unknown = acc.post("/api/v1/auth/login", json={"email": "nobody@example.com", "password": PW}, headers=X)
    assert bad.status_code == unknown.status_code == 401 and bad.json()["message"] == unknown.json()["message"]  # no account enumeration
    ok = acc.post("/api/v1/auth/login", json={"email": "ASHA@example.com", "password": PW}, headers=X)
    assert ok.status_code == 200 and acc.get("/api/v1/auth/me").status_code == 200
    assert acc.post("/api/v1/auth/logout", headers=X).status_code == 204
    assert acc.get("/api/v1/auth/me").status_code == 401


def test_repeated_failures_lock_the_account_even_for_the_right_password(acc):
    signup(acc)
    acc.post("/api/v1/auth/logout", headers=X)
    for _ in range(5):
        assert acc.post("/api/v1/auth/login", json={"email": "asha@example.com", "password": "Wrong2026x"}, headers=X).status_code == 401
    locked = acc.post("/api/v1/auth/login", json={"email": "asha@example.com", "password": PW}, headers=X)
    assert locked.status_code == 429 and locked.json()["code"] == "account_locked"


def test_expired_sessions_are_rejected(acc, db_engine, session_factory):
    signup(acc)
    assert acc.get("/api/v1/auth/me").status_code == 200
    with session_factory() as s:
        for row in s.scalars(select(UserSession)):
            row.expires_at = datetime.now(UTC) - timedelta(minutes=1)
        s.commit()
    assert acc.get("/api/v1/auth/me").status_code == 401
    assert acc.get("/api/v1/projects").status_code == 401


def test_password_reset_is_single_use_signs_out_everywhere_and_does_not_leak(acc, caplog, session_factory):
    signup(acc)
    caplog.set_level(logging.WARNING, logger="app.email")
    known = acc.post("/api/v1/auth/forgot-password", json={"email": "asha@example.com"}, headers=X)
    unknown = acc.post("/api/v1/auth/forgot-password", json={"email": "nobody@example.com"}, headers=X)
    assert known.status_code == unknown.status_code == 202 and known.json() == unknown.json()
    link = re.search(r"reset-password\?token=([A-Za-z0-9_-]+)", caplog.text)
    assert link, "the console e-mail backend writes the link to the log in development"
    token = link.group(1)
    with session_factory() as s:
        assert len(s.scalars(select(PasswordReset)).all()) == 1 and token not in s.scalars(select(PasswordReset)).first().token_hash
    weak = acc.post("/api/v1/auth/reset-password", json={"token": token, "password": "short"}, headers=X)
    assert weak.status_code == 422
    ok = acc.post("/api/v1/auth/reset-password", json={"token": token, "password": "NewSunrise2027"}, headers=X)
    assert ok.status_code == 200
    assert acc.get("/api/v1/auth/me").status_code == 401  # the old session was revoked
    again = acc.post("/api/v1/auth/reset-password", json={"token": token, "password": "Another2027x"}, headers=X)
    assert again.status_code == 422 and again.json()["details"][0]["msg"] == "invalid_or_expired"
    assert acc.post("/api/v1/auth/login", json={"email": "asha@example.com", "password": PW}, headers=X).status_code == 401
    assert acc.post("/api/v1/auth/login", json={"email": "asha@example.com", "password": "NewSunrise2027"}, headers=X).status_code == 200


def test_expired_reset_token_is_refused(acc, caplog, session_factory):
    signup(acc)
    caplog.set_level(logging.WARNING, logger="app.email")
    acc.post("/api/v1/auth/forgot-password", json={"email": "asha@example.com"}, headers=X)
    token = re.search(r"token=([A-Za-z0-9_-]+)", caplog.text).group(1)
    with session_factory() as s:
        s.scalars(select(PasswordReset)).first().expires_at = datetime.now(UTC) - timedelta(minutes=1)
        s.commit()
    assert acc.post("/api/v1/auth/reset-password", json={"token": token, "password": "NewSunrise2027"}, headers=X).status_code == 422


def test_guests_use_public_tools_but_not_owned_data(acc):
    assert acc.post("/api/v1/ask", json={"question": "front open space"}).status_code == 200
    assert acc.post("/api/v1/calculations/plot-area", json={"length": {"value": "20", "unit": "m"}, "width": {"value": "10", "unit": "m"}}).status_code == 200
    for method, path in (("get", "/api/v1/projects"), ("post", "/api/v1/projects"), ("post", "/api/v1/assessments"), ("get", "/api/v1/feedback")):
        r = getattr(acc, method)(path, **({"json": {"name": "x"}, "headers": X} if method == "post" else {}))
        assert r.status_code == 401, (method, path, r.status_code)
    assert acc.post("/api/v1/feedback", json={"category": "other", "message": "hello"}, headers=X).status_code in (201, 404)


def test_each_account_only_sees_its_own_projects_and_a_guest_cannot_use_them(db_engine, synthetic_loaded):
    with make_client(db_engine, {"AUTH_MODE": "accounts"}) as a, make_client(db_engine, {"AUTH_MODE": "accounts"}) as b:
        signup(a, "a@example.com", "Ann Lee")
        signup(b, "b@example.com", "Bob Rao")
        pid = a.post("/api/v1/projects", json={"name": "Ann house"}, headers=X).json()["id"]
        assert [p["name"] for p in a.get("/api/v1/projects").json()["items"]] == ["Ann house"]
        assert b.get("/api/v1/projects").json()["items"] == []
        assert b.get(f"/api/v1/projects/{pid}").status_code == 404
        # asking with someone else's project id or conversation as a guest or another user never leaks data
        conv = a.post("/api/v1/ask", json={"question": "front open space for 200 sqm plot"}, headers=X).json().get("conversation_id")
        with make_client(db_engine, {"AUTH_MODE": "accounts"}) as guest:
            assert guest.post("/api/v1/ask", json={"question": "x", "project_id": pid}).status_code == 404
            if conv:
                assert guest.post("/api/v1/ask", json={"question": "x", "conversation_id": conv}).status_code == 404


def test_onboarding_flag_is_stored_per_account(acc):
    signup(acc)
    assert acc.get("/api/v1/auth/me").json()["onboarding_done"] is False
    assert acc.patch("/api/v1/auth/me", json={"onboarding_done": True}, headers=X).json()["onboarding_done"] is True
    assert acc.get("/api/v1/auth/me").json()["onboarding_done"] is True


def test_auth_config_reports_what_the_server_can_do(acc):
    cfg = acc.get("/api/v1/auth/config").json()
    assert cfg == {"auth_mode": "accounts", "registration_open": True, "email_delivery": "console", "password_min_length": 8}


def test_registration_can_be_closed(db_engine, synthetic_loaded):
    with make_client(db_engine, {"AUTH_MODE": "accounts", "REGISTRATION_OPEN": "false"}) as c:
        assert c.post("/api/v1/auth/register", json={"name": "A", "email": "a@example.com", "password": PW}, headers=X).status_code == 403


def test_user_rows_exist_only_after_registration(acc, session_factory):
    with session_factory() as s:
        assert s.scalars(select(User)).all() == []
    signup(acc)
    with session_factory() as s:
        assert [u.email for u in s.scalars(select(User))] == ["asha@example.com"]
