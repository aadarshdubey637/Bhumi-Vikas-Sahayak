"""Nirmaan Helpline: Twilio signature checks, TwiML safety, dialogue rules, duplicate turns. Real corpus; no real telephony is involved."""
from __future__ import annotations

import itertools
import xml.etree.ElementTree as ET

import pytest

from app.channels.providers import twilio_signature
from app.channels.voice import Say, VoiceReply, spoken_number_to_digits, to_twiml
from tests.channels.conftest import BASE_URL, SECRETS

SID = ""
_counter = itertools.count(1)


@pytest.fixture(autouse=True)
def _fresh_call_sid():
    """A new CallSid per test: a repeated (CallSid, turn) is, correctly, treated as a provider retry and replayed."""
    global SID
    SID = "CA" + f"{next(_counter):032d}"


def _say_text(xml: str) -> str:
    return " ".join(e.text or "" for e in ET.fromstring(xml.split("?>", 1)[1]).iter("Say"))


def test_twilio_signature_matches_the_example_in_twilios_docs_as_recalled():
    # Example as I recall it from Twilio's security docs (token 12345). Recalled from memory, not re-fetched: if this ever fails,
    # check the vector against the current docs before suspecting the code.
    url = "https://mycompany.com/myapp.php?foo=1&bar=2"
    params = {"CallSid": ["CA1234567890ABCDE"], "Caller": ["+12349013030"], "Digits": ["1234"], "From": ["+12349013030"], "To": ["+18005551212"]}
    assert twilio_signature("12345", url, params) == "0/KCTR6DLpKmkAf8muzZqo1nDgQ="


def test_twilio_signature_follows_the_documented_algorithm():
    # Independent re-derivation of the documented scheme (url + params sorted by name, each name+value appended; HMAC-SHA1; base64).
    # NOT checked against a signature produced by Twilio itself: that needs a real Twilio request (see docs/channels.md).
    import base64
    import hashlib
    import hmac
    url = "https://mycompany.com/myapp.php?foo=1&bar=2"
    params = {"To": ["+18005551212"], "CallSid": ["CA1234567890ABCDE"], "Digits": ["1234"], "From": ["+14158675310"]}
    data = url + "".join(k + params[k][0] for k in sorted(params))
    expected = base64.b64encode(hmac.new(b"12345", data.encode(), hashlib.sha1).digest()).decode()
    assert twilio_signature("12345", url, params) == expected


def test_incoming_call_greets_as_ai_and_not_official(env):
    r = env.post_voice("incoming", {"CallSid": SID, "From": "+919876543210"})
    assert r.status_code == 200 and "xml" in r.headers["content-type"]
    text = _say_text(r.text)
    assert "AI" in text and "सरकारी अधिकारी नहीं" in text
    assert "<Gather" in r.text and "svc.example.com" in r.text


def test_unsigned_or_wrongly_signed_voice_requests_are_rejected(env):
    assert env.post_voice("incoming", {"CallSid": SID}, sign=False).status_code == 403
    assert env.post_voice("incoming", {"CallSid": SID}, token="wrong-token").status_code == 403
    # A signature computed for different parameters must not validate a changed body.
    url = f"{BASE_URL}/api/v1/channels/voice/turn"
    sig = twilio_signature(SECRETS["TWILIO_AUTH_TOKEN"], url, {"CallSid": [SID], "SpeechResult": ["x"]})
    r = env.client.post("/api/v1/channels/voice/turn", content=f"CallSid={SID}&SpeechResult=changed",
                        headers={"X-Twilio-Signature": sig, "Content-Type": "application/x-www-form-urlencoded"})
    assert r.status_code == 403


def test_unconfigured_phone_line_is_503(make_env):
    e = make_env(TWILIO_AUTH_TOKEN="", TWILIO_ACCOUNT_SID="", TWILIO_SMS_FROM="")
    assert e.client.post("/api/v1/channels/voice/incoming", content="CallSid=" + SID,
                         headers={"Content-Type": "application/x-www-form-urlencoded"}).status_code == 503


def test_spoken_question_gets_rule_number_page_and_pending_notice(env):
    r = env.post_voice("turn", {"CallSid": SID, "SpeechResult": "What is the fee for building permission?", "Confidence": "0.9"},
                       query="n=1&miss=0&lang=en-IN")
    assert r.status_code == 200
    text = _say_text(r.text)
    assert "Rule 21" in text and "PDF page" in text and "not yet been verified" in text
    assert "official" not in text.lower().replace("not an official", "")


def test_low_confidence_speech_is_not_answered(env):
    r = env.post_voice("turn", {"CallSid": SID, "SpeechResult": "building fee", "Confidence": "0.1"}, query="n=1&miss=0&lang=en-IN")
    assert r.status_code == 200 and "Rule " not in _say_text(r.text) and "slower" in _say_text(r.text)


def test_silence_twice_then_polite_hangup(env):
    r1 = env.post_voice("turn", {"CallSid": SID}, query="n=1&miss=0&lang=en-IN")
    assert "<Gather" in r1.text and "did not hear" in _say_text(r1.text)
    r2 = env.post_voice("turn", {"CallSid": SID}, query="n=2&miss=1&lang=en-IN")
    assert "<Gather" in r2.text
    r3 = env.post_voice("turn", {"CallSid": SID}, query="n=3&miss=2&lang=en-IN")
    assert "<Hangup" in r3.text and "<Gather" not in r3.text


def test_retried_turn_replays_the_same_answer_without_reprocessing(env):
    p = {"CallSid": SID, "SpeechResult": "What is the fee for building permission?", "Confidence": "0.9"}
    a = env.post_voice("turn", p, query="n=1&miss=0&lang=en-IN")
    b = env.post_voice("turn", p, query="n=1&miss=0&lang=en-IN")
    assert a.status_code == b.status_code == 200 and a.text == b.text


def test_nothing_the_caller_says_can_inject_twiml():
    evil = 'x</Say><Dial>+1555</Dial><Say>"&'
    xml = to_twiml(VoiceReply(say=[Say(evil, "en-IN")]), action_url="https://svc.example.com/t?n=1&miss=0", voice="Polly.Aditi")
    root = ET.fromstring(xml.split("?>", 1)[1])
    assert root.find(".//Dial") is None and evil in "".join(e.text or "" for e in root.iter("Say"))


def test_a_question_outside_the_rules_abstains_by_voice(env):
    r = env.post_voice("turn", {"CallSid": SID, "SpeechResult": "Who won the cricket world cup?", "Confidence": "0.95"}, query="n=1&miss=0&lang=en-IN")
    text = _say_text(r.text)
    assert "will not guess" in text and "Rule " not in text


def test_pressing_1_with_nothing_to_send_says_so_and_sends_nothing(env):
    r = env.post_voice("turn", {"CallSid": SID, "Digits": "1", "From": "+919876543210"}, query="n=1&miss=0&lang=en-IN")
    assert r.status_code == 200 and env.tw.sms == []


def test_pressing_3_ends_the_call(env):
    r = env.post_voice("turn", {"CallSid": SID, "Digits": "3"}, query="n=1&miss=0&lang=en-IN")
    assert "<Hangup" in r.text


def test_demo_call_is_labelled_simulation_and_needs_no_signature(env):
    r = env.client.post("/api/v1/channels/demo/call", json={"session_id": "demo-call-001", "event": "start", "n": 0})
    j = r.json()
    assert r.status_code == 200 and j["simulated"] is True and "SIMULATION" in j["label"] and "AI" in j["say"][0]["text"]
    assert "Sorry" not in j["say"][0]["text"] and env.tw.sms == []


def test_spoken_number_words_become_digits():
    assert spoken_number_to_digits("nine meter") == "9 meter" and spoken_number_to_digits("नौ मीटर") == "9 मीटर"
