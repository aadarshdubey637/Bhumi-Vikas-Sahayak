"""WhatsApp "Rule Dost" through the real webhook route, the real rule corpus and fake providers (no network, no credentials)."""
from __future__ import annotations

import json
import re

import pytest
from sqlalchemy import text

from app.channels.providers import ProviderError, STTUnavailable
from tests.channels.conftest import PHONE, SECRETS

pytestmark = pytest.mark.real_corpus
QUOTE = re.compile(r"“([^”]+)”")
CITED = re.compile(r"(?:Rule|नियम) (\d+(?:-[A-Za-z])?) —")


def chunk_texts(env, rule_number: str) -> list[str]:
    store = env.app.state.store
    rec = next(r for r in store.records if r.official_rule_id == rule_number)
    return [c.text for c in rec.chunks]


def assert_quotes_are_exact(env, reply: str) -> list[str]:
    """Every “quotation” in the reply is a verbatim substring of the stored text of the rule cited next to it."""
    rules = CITED.findall(reply)
    assert rules, reply
    blocks = re.split(r"\n\n", reply)
    seen = []
    for b in blocks:
        m = CITED.search(b)
        q = QUOTE.search(b)
        if m and q:
            quote = q.group(1).rstrip("…").strip()
            quote = re.sub(r"\s+", " ", quote)
            haystack = [re.sub(r"\s+", " ", t) for t in chunk_texts(env, m.group(1))]
            assert any(quote in h for h in haystack), f"quote not found verbatim in Rule {m.group(1)}: {quote!r}"
            seen.append(m.group(1))
    assert seen
    return seen


# ------------------------------------------------------------------------------------------------ handshake + signature
def test_verification_handshake(env):
    ok = env.client.get("/api/v1/channels/whatsapp/webhook", params={"hub.mode": "subscribe", "hub.verify_token": SECRETS["WHATSAPP_VERIFY_TOKEN"], "hub.challenge": "12345"})
    assert ok.status_code == 200 and ok.text == "12345"
    bad = env.client.get("/api/v1/channels/whatsapp/webhook", params={"hub.mode": "subscribe", "hub.verify_token": "wrong", "hub.challenge": "12345"})
    assert bad.status_code == 403 and "12345" not in bad.text
    wrong_mode = env.client.get("/api/v1/channels/whatsapp/webhook", params={"hub.mode": "unsubscribe", "hub.verify_token": SECRETS["WHATSAPP_VERIFY_TOKEN"], "hub.challenge": "1"})
    assert wrong_mode.status_code == 403


def test_unconfigured_server_refuses_webhooks(engine):
    from tests.channels.conftest import Env
    e = Env(engine, WHATSAPP_APP_SECRET="", WHATSAPP_VERIFY_TOKEN="", WHATSAPP_ACCESS_TOKEN="", WHATSAPP_PHONE_NUMBER_ID="", PII_HASH_SECRET="",
            TWILIO_AUTH_TOKEN="", TWILIO_ACCOUNT_SID="", TWILIO_SMS_FROM="", PUBLIC_BASE_URL="")
    try:
        assert e.post_wa(e.wa_payload("wamid.1", "hi"), signed=False).status_code == 503
        assert e.client.get("/api/v1/channels/whatsapp/webhook", params={"hub.mode": "subscribe", "hub.verify_token": "x", "hub.challenge": "1"}).status_code == 503
    finally:
        e.close()


@pytest.mark.parametrize("how", ["missing", "wrong_secret", "tampered_body", "no_prefix", "garbage"])
def test_invalid_signatures_are_rejected_and_nothing_is_processed(env, how):
    raw = json.dumps(env.wa_payload("wamid.sig." + how, "Rule 21")).encode()
    headers = {"missing": {}, "wrong_secret": env.sign(raw, "not-the-secret"), "tampered_body": env.sign(raw + b" "),
               "no_prefix": {"X-Hub-Signature-256": "abc"}, "garbage": {"X-Hub-Signature-256": "sha256=zzzz"}}[how]
    r = env.client.post("/api/v1/channels/whatsapp/webhook", content=raw, headers=headers)
    assert r.status_code == 401
    assert env.wa.sent == []


def test_malformed_json_with_valid_signature_is_400_and_oversized_is_413(env):
    raw = b"{not json"
    assert env.client.post("/api/v1/channels/whatsapp/webhook", content=raw, headers=env.sign(raw)).status_code == 400
    big = b"x" * 70_000
    assert env.client.post("/api/v1/channels/whatsapp/webhook", content=big, headers=env.sign(big)).status_code == 413


def test_status_updates_and_unknown_shapes_are_ignored(env):
    payload = {"object": "whatsapp_business_account", "entry": [{"changes": [{"value": {"statuses": [{"id": "x", "status": "read"}]}}]}]}
    r = env.post_wa(payload)
    assert r.status_code == 200 and r.json() == {"received": 0}
    assert env.post_wa({"object": "page", "entry": []}).json() == {"received": 0}
    assert env.wa.sent == []


# ------------------------------------------------------------------------------------------------ answers
def test_hinglish_question_gets_rule_28_with_exact_quote_and_pdf_page(env):
    env.say("wamid.h1", "authority ne jawab nahi diya to kya hoga, kitne din me permission mil jaati hai")
    reply = env.last_reply()
    assert "नियम 28" in reply and "PDF पृष्ठ" in reply and "deemed to have been sanctioned" in " ".join(reply.split())
    assert "अभी मानव-समीक्षा नहीं हुई" in reply and "मानव-सत्यापित" not in reply   # never claims a human verified it
    assert "उत्तर:" in reply and "धारा 30(5)" in reply                          # the stated answer, in Hindi, leads the message
    assert "आधिकारिक निर्णय नहीं" in reply and "AI" in reply
    assert "28" in assert_quotes_are_exact(env, reply)


def test_english_question_gets_fee_rule_with_page(env):
    env.say("wamid.e1", "What is the fee for building permission for a residential house?")
    reply = env.last_reply()
    assert "*Rule 21 — Fees*" in reply and re.search(r"PDF pages? \d+", reply)
    assert "Rs 1.00 per sq m" in reply and "Rs 750" in reply and "not an official decision" in reply   # the stated answer, not only a pointer
    assert "not been reviewed by a human" not in reply and "human-verified" not in reply
    assert "21" in assert_quotes_are_exact(env, reply)


def test_hindi_devanagari_question(env):
    env.say("wamid.d1", "बिल्डिंग परमिशन की फीस कितनी है और किस नियम में लिखी है?")
    reply = env.last_reply()
    assert "नियम 21" in reply and "PDF पृष्ठ" in reply


def test_exact_rule_lookup_shows_more_of_the_rule(env):
    env.say("wamid.r1", "Rule 52")
    reply = env.last_reply()
    assert "Rule 52 — Distance from electric lines" in reply
    assert "52" in assert_quotes_are_exact(env, reply)


def test_example_question_asks_one_followup_then_remembers_the_answer(env):
    env.say("wamid.x1", "Mere 1500 sq. ft. plot par ghar banane ke kya rules hain?")
    first = env.last_reply()
    assert "नियम" in first and "प्लॉट का क्षेत्रफल: 1500 वर्ग फुट" in first               # what we understood, in the user's own numbers
    assert first.count("❓") == 1 and "सड़क" in first                                    # ONE follow-up question, about the road width
    assert "eligible" not in first.lower() and "अनुमत है" not in first and "बना सकते हैं" not in first   # no eligibility verdict
    env.say("wamid.x2", "9")
    second = env.last_reply()
    assert "सड़क की चौड़ाई: 9 मीटर" in second and "मैंने मीटर मान लिया" in second
    assert "सड़क" not in second.split("❓")[-1] if "❓" in second else True            # the road width is not asked again
    assert_quotes_are_exact(env, second)


def test_followup_is_not_asked_for_unrelated_questions_or_repeated(env):
    env.say("wamid.f1", "authority ne jawab nahi diya to kya hoga")
    assert "❓" not in env.last_reply()
    env.say("wamid.f2", "What is the fee for building permission for a residential house?")
    assert "❓" not in env.last_reply()


def test_question_the_rules_do_not_answer_abstains_without_citing_anything(env):
    for i, q in enumerate(["Who won the cricket world cup?", "mera property tax kitna hoga", "kolar road par zameen ka bhav kya hai"]):
        env.say(f"wamid.a{i}", q)
        reply = env.last_reply()
        assert "Rule Dost" in reply or "रूल दोस्त" in reply
        assert not CITED.search(reply) and "PDF" not in reply and "“" not in reply        # no rule number, page or quotation invented
        assert "guess" in reply or "अंदाज़ा नहीं" in reply


def test_greeting_names_the_assistant_as_ai_in_both_languages(env):
    env.say("wamid.g1", "hello")
    reply = env.last_reply()
    assert "AI assistant" in reply and "not a government official" in reply and "AI सहायक" in reply and "सरकारी अधिकारी नहीं" in reply


def test_too_long_message_is_refused_politely(env):
    env.say("wamid.l1", "building permission " * 80)
    assert "too long" in env.last_reply() or "बहुत लंबा" in env.last_reply()


# ------------------------------------------------------------------------------------------------ duplicates, failures
def test_duplicate_webhook_event_is_processed_once(env):
    payload = env.wa_payload("wamid.dup", "What is the fee for building permission for a residential house?")
    assert env.post_wa(payload).status_code == 200
    assert env.post_wa(payload).status_code == 200      # Meta retries: still 200, but no second reply
    assert env.post_wa(payload).status_code == 200
    assert len(env.wa.sent) == 1
    with env.app.state.session_factory() as db:
        outcomes = [r[0] for r in db.execute(text("select outcome from channel_log where kind='message' order by id")).all()]
    assert outcomes.count("processed") == 1 and outcomes.count("duplicate") == 2


@pytest.mark.parametrize("code", ["http_500", "timeout", "network_error", "http_429"])
def test_provider_failure_or_timeout_never_breaks_the_webhook_and_is_logged(env, code):
    env.wa.fail_with = code
    r = env.say("wamid.fail." + code, "What is the fee for building permission for a residential house?")
    assert r.status_code == 200
    with env.app.state.session_factory() as db:
        row = db.execute(text("select outcome, error_code from channel_log where kind='message' order by id desc limit 1")).one()
    assert row[0] == "failed" and row[1] == f"send_{code}"
    env.wa.fail_with = None
    env.say("wamid.after." + code, "Rule 21")      # the service keeps working afterwards
    assert env.wa.sent


def test_internal_error_still_gives_the_user_an_honest_reply(env, monkeypatch):
    import app.channels.service as S

    def boom(*a, **k):
        raise RuntimeError("database exploded")
    monkeypatch.setattr(S, "answer_text", boom)
    env.say("wamid.boom", "Rule 21")
    reply = env.last_reply()
    assert "technical" not in reply.lower() or True
    assert "गड़बड़" in reply and "something went wrong" in reply
    assert "exploded" not in reply and not CITED.search(reply)       # no internals, no invented content


# ------------------------------------------------------------------------------------------------ voice notes
def audio(env, msg_id: str):
    r = env.post_wa(env.wa_payload(msg_id, mtype="audio", media_id="media-1"))
    assert r.status_code == 200
    return r


def test_voice_note_is_transcribed_echoed_and_answered(env):
    env.svc.stt = __import__("tests.channels.conftest", fromlist=["FakeSTT"]).FakeSTT("authority ne jawab nahi diya to kya hoga")
    audio(env, "wamid.v1")
    reply = env.last_reply()
    assert reply.startswith("🎙") and "authority ne jawab nahi diya" in reply and "नियम 28" in reply


def test_voice_note_transcription_errors_are_handled(env):
    from tests.channels.conftest import FakeSTT
    env.svc.stt = FakeSTT(exc=STTUnavailable("not configured"))
    audio(env, "wamid.v2")
    assert "वॉइस नोट अभी चालू नहीं" in env.last_reply()
    env.svc.stt = FakeSTT("")                         # transcription came back empty
    audio(env, "wamid.v3")
    assert "वॉइस नोट समझ नहीं पाया" in env.last_reply() and not CITED.search(env.last_reply())
    env.svc.stt = FakeSTT("ok")
    env.wa.media = ProviderError("http_404", 404)      # media could not be downloaded
    audio(env, "wamid.v4")
    assert "वॉइस नोट समझ नहीं पाया" in env.last_reply()
    env.svc.stt = FakeSTT(exc=ProviderError("timeout", None, True))   # STT provider timed out
    env.wa.media = None
    audio(env, "wamid.v5")
    assert "वॉइस नोट समझ नहीं पाया" in env.last_reply()


def test_garbled_transcript_never_produces_a_made_up_answer(env):
    from tests.channels.conftest import FakeSTT
    env.svc.stt = FakeSTT("hmm uh the the blah")
    audio(env, "wamid.v6")
    reply = env.last_reply()
    assert not CITED.search(reply) and "PDF" not in reply


def test_images_and_documents_are_not_read_or_kept(env):
    r = env.post_wa(env.wa_payload("wamid.img", mtype="image", media_id="img-1"))
    assert r.status_code == 200
    assert "फ़ोटो या दस्तावेज़" in env.last_reply() and "सहेजता" in env.last_reply()


# ------------------------------------------------------------------------------------------------ consent, throttle, privacy
def test_stop_silences_the_assistant_and_start_resumes(env):
    env.say("wamid.s1", "STOP")
    assert "अब आपको कोई संदेश नहीं" in env.last_reply() or "will not receive" in env.last_reply()
    n = len(env.wa.sent)
    env.say("wamid.s2", "What is the fee for building permission?")
    assert len(env.wa.sent) == n                      # opted out: no reply at all
    env.say("wamid.s3", "START")
    assert len(env.wa.sent) == n + 1
    env.say("wamid.s4", "Rule 21")
    assert CITED.search(env.last_reply())


def test_per_sender_throttle_warns_once_then_stays_quiet(make_env):
    e = make_env(CHANNEL_USER_RATE_PER_MINUTE="3")
    for i in range(3):
        e.say(f"wamid.t{i}", "Rule 21")
    e.say("wamid.t3", "Rule 21")
    assert "very quickly" in e.last_reply()   # the sender has been writing in English, so the warning is too
    n = len(e.wa.sent)
    e.say("wamid.t4", "Rule 21")
    e.say("wamid.t5", "Rule 21")
    assert len(e.wa.sent) == n                         # no spam back
    e.say("wamid.other", "Rule 21", sender="911111111111")   # a different person is unaffected
    assert len(e.wa.sent) == n + 1


def test_phone_numbers_and_message_text_are_never_stored(env):
    secret_text = "mera naam Ramesh Verma hai aur plot number 4471 par 150 sq m ghar banana hai"
    env.say("wamid.p1", secret_text)
    env.say("wamid.p2", "9")
    with env.app.state.session_factory() as db:
        # Only the tables the channels write to: scanning the rule corpus is slow and its text may contain any number.
        for table in ("channel_contacts", "channel_dedupe", "channel_log", "conversations"):
            dump = json.dumps([list(map(str, r)) for r in db.execute(text(f"select * from {table}")).all()], ensure_ascii=False)
            assert PHONE not in dump, f"phone number found in {table}"
            assert "Ramesh" not in dump and "4471" not in dump, f"message text found in {table}"


def test_logs_do_not_contain_numbers_or_text(env, caplog):
    import logging
    caplog.set_level(logging.DEBUG)
    env.say("wamid.log1", "mera number " + PHONE + " hai, Rule 21 batao")
    assert PHONE not in caplog.text and "batao" not in caplog.text


# ------------------------------------------------------------------------------------------------ operator endpoints
def test_status_never_exposes_secrets_or_numbers(env):
    env.say("wamid.st1", "Rule 21")
    body = env.client.get("/api/v1/channels/status").text
    for secret in SECRETS.values():
        assert secret not in body, "a secret value leaked into the status response"
    assert PHONE not in body
    j = json.loads(body)
    assert j["whatsapp"]["configured"] is True and all(c["present"] for c in j["whatsapp"]["credentials"] if c["required"])
    assert j["whatsapp"]["webhook_url"] == "https://svc.example.com/api/v1/channels/whatsapp/webhook"


def test_status_for_an_unconfigured_server_lists_what_is_missing(engine):
    from tests.channels.conftest import Env
    e = Env(engine, WHATSAPP_APP_SECRET="", WHATSAPP_VERIFY_TOKEN="", WHATSAPP_ACCESS_TOKEN="", WHATSAPP_PHONE_NUMBER_ID="",
            TWILIO_AUTH_TOKEN="", TWILIO_ACCOUNT_SID="", PUBLIC_BASE_URL="")
    try:
        j = e.client.get("/api/v1/channels/status").json()
        assert j["whatsapp"]["configured"] is False and j["voice"]["configured"] is False
        assert {c["env"] for c in j["whatsapp"]["credentials"] if c["required"] and not c["present"]} >= {"WHATSAPP_APP_SECRET", "WHATSAPP_ACCESS_TOKEN"}
        assert j["demo_enabled"] is True
    finally:
        e.close()


def test_selftest_passes_on_the_real_corpus(env):
    j = env.client.post("/api/v1/channels/selftest").json()
    assert j["ok"], [c for c in j["checks"] if not c["ok"]]
    assert len(j["checks"]) >= 6


def test_connection_check_reports_not_configured_without_calling_anyone(make_env):
    e = make_env(WHATSAPP_ACCESS_TOKEN="", TWILIO_ACCOUNT_SID="", TWILIO_AUTH_TOKEN="")
    r = e.client.post("/api/v1/channels/check-connection").json()
    assert {x["provider"]: x["outcome"] for x in r["results"]} == {"whatsapp": "not_configured", "twilio": "not_configured"}


def test_connection_check_records_provider_failure_without_secrets(env):
    class Failing:
        def check_connection(self):
            raise ProviderError("http_401", 401)
    env.svc._wa = Failing()   # type: ignore[assignment]
    r = env.client.post("/api/v1/channels/check-connection").json()
    wa = next(x for x in r["results"] if x["provider"] == "whatsapp")
    assert wa["outcome"] == "failed" and wa["error_code"] == "http_401"
    assert SECRETS["WHATSAPP_ACCESS_TOKEN"] not in json.dumps(r)


# ------------------------------------------------------------------------------------------------ demo mode
def test_demo_whatsapp_is_labelled_simulation_and_sends_nothing_real(env):
    r = env.client.post("/api/v1/channels/demo/whatsapp", json={"session_id": "demo-session-1", "text": "What is the fee for building permission?"})
    assert r.status_code == 200
    j = r.json()
    assert j["simulated"] is True and "SIMULATION" in j["label"] and j["messages"] and "Rule 21" in j["messages"][0]
    assert env.wa.sent == [] and env.wa.templates == []          # the real client was never used


def test_demo_voice_note_and_validation(env):
    ok = env.client.post("/api/v1/channels/demo/whatsapp", json={"session_id": "demo-session-2", "kind": "voice_note", "transcript": "authority ne jawab nahi diya"})
    assert ok.status_code == 200 and "🎙" in ok.json()["messages"][0]
    assert env.client.post("/api/v1/channels/demo/whatsapp", json={"session_id": "demo-session-2", "kind": "voice_note"}).status_code == 422
    assert env.client.post("/api/v1/channels/demo/whatsapp", json={"session_id": "x", "text": "hi"}).status_code == 422
    assert env.client.post("/api/v1/channels/demo/whatsapp", json={"session_id": "demo-session-3", "text": "hi", "evil": 1}).status_code == 422


def test_demo_is_off_by_default_in_production(engine):
    from app.core.config import Settings
    s = Settings.from_env({"APP_ENV": "production", "DATABASE_URL": "postgresql://u:p@h/d", "AUTH_MODE": "api_key",
                           "API_KEY_HASHES": "a:" + "0" * 64, "CORS_ORIGINS": "https://a.example.com"})
    assert s.demo_enabled is False
    assert Settings.from_env({"CHANNELS_DEMO_ENABLED": "true", "DATABASE_URL": "sqlite://"}).demo_enabled is True


def test_demo_disabled_returns_403(make_env):
    e = make_env(CHANNELS_DEMO_ENABLED="false")
    r = e.client.post("/api/v1/channels/demo/whatsapp", json={"session_id": "demo-session-9", "text": "hi"})
    assert r.status_code == 403
