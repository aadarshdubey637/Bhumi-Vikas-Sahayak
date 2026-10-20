"""Fixtures for the WhatsApp / voice channel tests: the REAL rule corpus in an in-memory database, fake providers, signed requests."""
from __future__ import annotations

import hashlib
import hmac
import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.channels.providers import ProviderError, twilio_signature
from app.core.config import Settings
from app.db.base import Base
from app.db.session import make_engine, make_session_factory
from app.ingestion.jsonl import ingest_jsonl
from app.main import create_app
from app.models import channels as _channel_models  # noqa: F401  (registers the channel tables on Base.metadata)
from app.repositories import rule_repository as repo

BACKEND = Path(__file__).resolve().parents[2]
RAW, FULLTEXT, AMD = (BACKEND / "data/raw/bhumi_vikas_rules.jsonl", BACKEND / "data/raw/bhumi_vikas_rules_fulltext_by_page.txt",
                      BACKEND / "data/pending/amendments_pending.json")

SECRETS = {"PII_HASH_SECRET": "pii-secret-0123456789-0123456789", "WHATSAPP_VERIFY_TOKEN": "verify-me-token", "WHATSAPP_APP_SECRET": "meta-app-secret",
           "WHATSAPP_ACCESS_TOKEN": "wa-access-token-xyz", "WHATSAPP_PHONE_NUMBER_ID": "109876543210", "TWILIO_AUTH_TOKEN": "twilio-auth-token-abc",
           "TWILIO_ACCOUNT_SID": "AC" + "a" * 32, "TWILIO_SMS_FROM": "+15550001111"}
BASE_URL = "https://svc.example.com"
ENV = {"DATABASE_URL": "sqlite://", "RATE_LIMIT_PER_MINUTE": "100000", "PUBLIC_BASE_URL": BASE_URL, **SECRETS}
PHONE = "919876543210"


@pytest.fixture(scope="module")
def engine():
    if not RAW.exists():
        pytest.skip("supplied rule data not present")
    eng = make_engine("sqlite://")
    Base.metadata.create_all(eng)
    records, _ = ingest_jsonl(RAW, FULLTEXT)
    with make_session_factory(eng)() as s:
        doc = repo.default_english_document(s)
        repo.import_records(s, records, doc)
        repo.import_amendments(s, AMD)
        s.commit()
    real_dispose = eng.dispose
    eng.dispose = lambda *a, **k: None   # type: ignore[method-assign]  # app shutdown disposes the engine, which would wipe the shared in-memory DB
    yield eng
    real_dispose()


class FakeWhatsApp:
    """Records replies; can be told to fail like a real provider would."""

    def __init__(self) -> None:
        self.sent: list[tuple[str, str]] = []
        self.templates: list[tuple] = []
        self.fail_with: str | None = None
        self.media: tuple[bytes, str] | ProviderError | None = None

    def send_text(self, to: str, body: str) -> None:
        if self.fail_with:
            raise ProviderError(self.fail_with, 500 if self.fail_with.startswith("http") else None, True)
        self.sent.append((to, body))

    def send_template(self, to: str, name: str, language: str, params: list[str]) -> None:
        if self.fail_with:
            raise ProviderError(self.fail_with, 500, True)
        self.templates.append((to, name, language, params))

    def download_media(self, media_id: str):
        if isinstance(self.media, ProviderError):
            raise self.media
        return self.media or (b"fake-audio", "audio/ogg")

    def mark_read(self, message_id: str) -> None:
        pass


class FakeSTT:
    def __init__(self, text: str | None = "", exc: Exception | None = None) -> None:
        self.text, self.exc = text, exc

    def transcribe(self, audio: bytes, mime: str) -> str:
        if self.exc:
            raise self.exc
        return self.text or ""


class FakeTwilio:
    def __init__(self) -> None:
        self.sms: list[tuple[str, str]] = []

    def send_sms(self, to: str, body: str) -> None:
        self.sms.append((to, body))

    def check_connection(self) -> dict:
        return {"account_status": "active", "type": "Trial"}


class Env:
    """A running app + helpers to send correctly signed webhooks."""

    def __init__(self, engine, **overrides: str):
        from sqlalchemy import text  # fresh channel state per test (the rule corpus in the shared DB is kept)
        with engine.begin() as conn:
            for table in ("channel_contacts", "channel_dedupe", "channel_log"):
                conn.execute(text(f"delete from {table}"))
        self.settings = Settings.from_env({**ENV, **overrides})
        self.app = create_app(self.settings, engine=engine)
        self.client = TestClient(self.app)
        self.client.__enter__()
        self.wa, self.tw = FakeWhatsApp(), FakeTwilio()
        self.svc = self.app.state.channels
        self.svc._wa, self.svc._tw = self.wa, self.tw   # type: ignore[assignment]

    def close(self) -> None:
        self.client.__exit__(None, None, None)

    # ---- WhatsApp
    def wa_payload(self, msg_id: str, text: str | None = None, sender: str = PHONE, mtype: str = "text", media_id: str = "m1") -> dict:
        msg: dict = {"from": sender, "id": msg_id, "timestamp": "1760000000", "type": mtype}
        if mtype == "text":
            msg["text"] = {"body": text}
        else:
            msg[mtype] = {"id": media_id, "mime_type": "audio/ogg; codecs=opus" if mtype == "audio" else "image/jpeg"}
        return {"object": "whatsapp_business_account", "entry": [{"id": "1", "changes": [{"field": "messages", "value": {
            "messaging_product": "whatsapp", "metadata": {"phone_number_id": "109876543210"}, "messages": [msg]}}]}]}

    def sign(self, raw: bytes, secret: str | None = None) -> dict[str, str]:
        key = secret or SECRETS["WHATSAPP_APP_SECRET"]
        return {"X-Hub-Signature-256": "sha256=" + hmac.new(key.encode(), raw, hashlib.sha256).hexdigest(), "Content-Type": "application/json"}

    def post_wa(self, payload: dict | bytes, headers: dict[str, str] | None = None, signed: bool = True):
        raw = payload if isinstance(payload, bytes) else json.dumps(payload).encode()
        return self.client.post("/api/v1/channels/whatsapp/webhook", content=raw, headers=headers if headers is not None else (self.sign(raw) if signed else {}))

    def say(self, msg_id: str, text: str, sender: str = PHONE):
        r = self.post_wa(self.wa_payload(msg_id, text, sender))
        assert r.status_code == 200, r.text
        return r

    def last_reply(self) -> str:
        return self.wa.sent[-1][1]

    # ---- Twilio
    def post_voice(self, path: str, params: dict[str, str], query: str = "", sign: bool = True, token: str | None = None):
        from urllib.parse import urlencode
        body = urlencode(params)
        url = f"{BASE_URL}/api/v1/channels/voice/{path}{('?' + query) if query else ''}"
        headers = {"Content-Type": "application/x-www-form-urlencoded"}
        if sign:
            headers["X-Twilio-Signature"] = twilio_signature(token or SECRETS["TWILIO_AUTH_TOKEN"], url, {k: [v] for k, v in params.items()})
        return self.client.post(f"/api/v1/channels/voice/{path}{('?' + query) if query else ''}", content=body, headers=headers)


@pytest.fixture
def env(engine):
    e = Env(engine)
    yield e
    e.close()


@pytest.fixture
def make_env(engine):
    made: list[Env] = []

    def factory(**overrides: str) -> Env:
        e = Env(engine, **overrides)
        made.append(e)
        return e
    yield factory
    for e in made:
        e.close()
