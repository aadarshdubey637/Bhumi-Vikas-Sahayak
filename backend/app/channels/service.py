"""ChannelService: the single object that runs "Rule Dost" (WhatsApp) and "Nirmaan Helpline" (phone) for one app instance.

Both channels call ``answer_text`` (the shared, source-backed answering service). This module adds transport concerns only:
duplicate protection, per-sender throttling, voice-note transcription, replies, call turns, consented follow-ups, status and self-test.
Personal data policy: phone numbers are used in memory to reply and are stored only as keyed hashes; message text is never stored.
"""
from __future__ import annotations

import json
import re
import secrets
import time
from collections.abc import Callable
from typing import Any

from fastapi import FastAPI
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.deps import refresh_store_if_missing
from app.channels import voice as V
from app.channels.answering import AnswerContext, ChannelAnswer, answer_text
from app.channels.hashing import conversation_id, keyed_id
from app.channels.messages import T, render_whatsapp
from app.channels.providers import (
    IncomingMessage,
    ProviderError,
    STTUnavailable,
    TwilioClient,
    WhatsAppClient,
    make_transcriber,
    twilio_signature,
    verify_meta_signature,
    verify_twilio_signature,
)
from app.channels.store import SenderThrottle, claim_event, get_contact, log_event, save_response, stored_response
from app.core.config import Settings
from app.models import ChannelDedupe, ChannelLog, Conversation

WA_OWNER, VOICE_OWNER, DEMO_OWNER = "channel:whatsapp", "channel:twilio", "channel:demo"
SELFTEST_QUESTIONS = ["I applied for building permission and the authority has not replied. What happens if they miss the deadline?",
                      "What is the fee for building permission for a residential house?", "Rule 52"]
SELFTEST_OFF_TOPIC = "How do I pay my property tax online?"
BYE_WORDS = {"bye", "goodbye", "bas", "बस", "alvida", "अलविदा", "धन्यवाद", "dhanyavad", "thanks", "thank you", "shukriya", "शुक्रिया"}


class CaptureWhatsApp:
    """Demo/test stand-in for the Cloud API client: records what WOULD be sent. Used only in clearly-labelled simulation."""

    def __init__(self) -> None:
        self.sent: list[tuple[str, str]] = []

    def send_text(self, to: str, body: str) -> None:
        self.sent.append((to, body))


class ChannelService:
    def __init__(self, app: FastAPI, settings: Settings):
        self.app, self.settings = app, settings
        self.throttle = SenderThrottle(settings.channel_user_rate_per_minute)
        self._secret = settings.pii_hash_secret.get_secret_value() if settings.pii_hash_secret else secrets.token_hex(32)  # ephemeral: demo only
        self._wa: WhatsAppClient | None = None
        self._tw: TwilioClient | None = None
        self.stt = make_transcriber(settings)

    # ------------------------------------------------------------------------------------------ configuration
    @property
    def whatsapp_receiving_configured(self) -> bool:
        return bool(self.settings.whatsapp_app_secret and self.settings.pii_hash_secret)

    @property
    def whatsapp_sending_configured(self) -> bool:
        s = self.settings
        return bool(s.whatsapp_access_token and s.whatsapp_phone_number_id)

    @property
    def voice_configured(self) -> bool:
        return bool(self.settings.twilio_auth_token and self.settings.pii_hash_secret)

    def wa(self) -> WhatsAppClient:
        self._wa = self._wa or WhatsAppClient(self.settings)
        return self._wa

    def tw(self) -> TwilioClient:
        self._tw = self._tw or TwilioClient(self.settings)
        return self._tw

    def hash(self, namespace: str, value: str) -> str:
        return keyed_id(self._secret, namespace, value)

    def _ctx(self) -> AnswerContext:
        refresh_store_if_missing(self.app)
        st = self.app.state
        return AnswerContext(st.store, st.retriever, st.llm, self.settings)

    def verify_meta(self, raw: bytes, header: str | None) -> bool:
        secret = self.settings.whatsapp_app_secret
        return bool(secret) and verify_meta_signature(secret.get_secret_value(), raw, header)  # type: ignore[union-attr]

    def verify_twilio(self, url: str, params: dict[str, list[str]], header: str | None) -> bool:
        tok = self.settings.twilio_auth_token
        return bool(tok) and verify_twilio_signature(tok.get_secret_value(), url, params, header)  # type: ignore[union-attr]

    # ------------------------------------------------------------------------------------------ WhatsApp
    def process_whatsapp_message(self, msg: IncomingMessage, *, send: Callable[[str, str], None] | None = None, simulated: bool = False,
                                 transcript: str | None = None) -> list[str]:
        """Handle one incoming WhatsApp message end to end. Returns the replies that were (or, in simulation, would be) sent."""
        t0 = time.perf_counter()
        sender = send or self.wa().send_text
        cid = self.hash("wa", msg.sender)
        with self.app.state.session_factory() as db:
            if not claim_event(db, "whatsapp", msg.id):
                log_event(db, "whatsapp", "message", "duplicate", simulated=simulated)
                return []
            replies: list[str] = []
            outcome, code, detail = "processed", None, {}
            try:
                contact = get_contact(db, cid, "whatsapp")
                verdict = self.throttle.check(cid)
                if verdict != "ok":
                    code = "throttled"
                    if verdict == "warn":
                        replies = [T[contact.language or "hi"]["throttle"]]
                    outcome = "rejected" if not replies else "processed"
                    db.commit()
                else:
                    replies, detail = self._whatsapp_answer(db, msg, contact, cid, simulated, transcript)
                    db.commit()
            except Exception:   # never leave a user without a reply, never leak internals
                db.rollback()
                outcome, code = "failed", "processing_error"
                replies = [T["hi"]["error"] + "\n\n" + T["en"]["error"]]
            sent = 0
            for body in replies:
                try:
                    sender(msg.sender, body)
                    sent += 1
                except ProviderError as e:
                    outcome, code = "failed", f"send_{e.code}"
                    break
            log_event(db, "whatsapp", "message", outcome, error_code=code, latency_ms=int((time.perf_counter() - t0) * 1000),
                      simulated=simulated, detail={**detail, "type": msg.type, "replies": sent})
        return replies

    def _whatsapp_answer(self, db: Session, msg: IncomingMessage, contact, cid: str, simulated: bool, transcript: str | None):
        lang = contact.language or "hi"
        if msg.type in ("text", "audio"):
            text, echo = msg.text or "", None
            if msg.type == "audio":
                if transcript is None:
                    try:
                        audio, mime = self.wa().download_media(msg.media_id or "")
                        transcript = self.stt.transcribe(audio, mime)
                    except STTUnavailable:
                        return [T[lang]["voice_off"]], {"kind": "voice_off"}
                    except ProviderError as e:
                        return [T[lang]["voice_fail"]], {"kind": "voice_fail", "stt_error": e.code}
                text = echo = " ".join(transcript.split())
                if len(re.sub(r"\W", "", text)) < 2:
                    return [T[lang]["voice_fail"]], {"kind": "voice_fail"}
            ans = answer_text(db, self._ctx(), contact, conversation_id(cid, "wa"), text, owner=DEMO_OWNER if simulated else WA_OWNER, echo=echo)
        else:
            ans = ChannelAnswer("unsupported", lang)
        return self._render(ans), {"kind": ans.kind, "status": ans.status, "rules": [c.rule_number for c in ans.citations]}

    @staticmethod
    def _render(ans: ChannelAnswer) -> list[str]:
        if ans.kind == "unsupported":
            t = T[ans.language]
            return [t["unsupported"]]
        return render_whatsapp(ans)

    # ------------------------------------------------------------------------------------------ voice
    def voice_turn(self, *, call_sid: str, n: int, miss: int, lang: str, speech: str | None, confidence: float | None,
                   digits: str | None, evidence_ids: list[str], from_number: str | None, start: bool = False,
                   simulated: bool = False) -> V.VoiceReply:
        """One call turn. ``from_number`` is used only to send an explicitly requested written follow-up; it is never stored or logged."""
        t0 = time.perf_counter()
        code = lang if lang in V.LANGS else self.settings.voice_language
        L = V.LANGS[code]
        t = V.S[L]
        call_hash = self.hash("call", call_sid)
        outcome, err, detail = "processed", None, {}
        reply = V.VoiceReply(lang=code, next_n=n + 1, misses=miss)
        with self.app.state.session_factory() as db:
            try:
                if start:
                    reply.say = [V.Say(t["greet"], code)] + ([V.Say(V.S["hi"]["greet_en"], "en-IN")] if L == "hi" and V.S["hi"]["greet_en"] else [])
                    reply.next_n, reply.misses = 1, 0
                    detail = {"kind": "greeting"}
                elif n > V.MAX_TURNS:
                    reply.say, reply.listen, reply.hangup = [V.Say(t["bye_limit"], code)], False, True
                elif digits:
                    reply = self._voice_digit(db, digits.strip()[:1], reply, code, L, call_hash, evidence_ids, from_number, simulated)
                    detail = {"kind": "digit", "digit": digits.strip()[:1]}
                elif not (speech or "").strip():
                    reply.misses = miss + 1
                    if reply.misses >= V.MAX_MISSES:
                        reply.say, reply.listen, reply.hangup = [V.Say(t["bye_silent"], code)], False, True
                    else:
                        reply.say = [V.Say(t["silence1"] if reply.misses == 1 else t["silence2"], code)]
                    detail = {"kind": "silence", "misses": reply.misses}
                elif confidence is not None and confidence < V.MIN_CONFIDENCE:
                    reply.misses = miss + 1
                    if reply.misses >= V.MAX_MISSES:
                        reply.say, reply.listen, reply.hangup = [V.Say(t["bye_silent"], code)], False, True
                    else:
                        reply.say = [V.Say(t["unclear"], code)]
                    detail = {"kind": "low_confidence"}
                else:
                    reply, detail = self._voice_answer(db, reply, code, L, call_hash, speech or "", simulated)
                db.commit()
            except Exception:
                db.rollback()
                outcome, err = "failed", "processing_error"
                reply = V.VoiceReply(say=[V.Say(t["error"], code)], listen=False, hangup=True, lang=code)
            log_event(db, "twilio", "call_turn", outcome, error_code=err, latency_ms=int((time.perf_counter() - t0) * 1000),
                      simulated=simulated, detail=detail)
        return reply

    def _voice_answer(self, db: Session, reply: V.VoiceReply, code: str, L: str, call_hash: str, speech: str, simulated: bool):
        t = V.S[L]
        contact = get_contact(db, call_hash, "voice")
        contact.language = L
        text = V.spoken_number_to_digits(speech) if contact.pending_fact else speech
        ans = answer_text(db, self._ctx(), contact, conversation_id(call_hash, "call"), text, owner=DEMO_OWNER if simulated else VOICE_OWNER)
        norm = " ".join(speech.lower().split()).strip(" .!?।")
        if ans.kind == "thanks" or norm in BYE_WORDS:
            reply.say, reply.listen, reply.hangup = [V.Say(t["bye"], code)], False, True
            return reply, {"kind": "goodbye"}
        if ans.kind in ("optout", "optin"):
            ans = ChannelAnswer("thanks", L)
        if ans.kind == "greeting":
            reply.say = [V.Say(t["greet"], code)]
            return reply, {"kind": "greeting"}
        if ans.kind in ("empty", "too_long", "no_data", "silent"):
            reply.say = [V.Say(t["unclear"], code)]
            return reply, {"kind": ans.kind}
        spoken, evidence_ids = V.speak_answer(ans, code)
        reply.say = [*spoken, V.Say(t["listen_more"], code)]
        reply.evidence_ids, reply.misses = evidence_ids, 0
        if ans.citations:
            self._put_draft(db, call_hash, V.written_text(ans.citations, L))
        return reply, {"kind": ans.kind, "status": ans.status, "rules": [c.rule_number for c in ans.citations], "follow_up": ans.follow_up}

    def _voice_digit(self, db: Session, digit: str, reply: V.VoiceReply, code: str, L: str, call_hash: str, evidence_ids: list[str],
                     from_number: str | None, simulated: bool) -> V.VoiceReply:
        t = V.S[L]
        reply.evidence_ids = evidence_ids
        if digit == "2" and L == "hi":
            reply.lang = "en-IN"
            reply.say = [V.Say("Okay, English. I am an AI assistant, not a government official. Please ask your question.", "en-IN")]
        elif digit == "3":
            reply.say, reply.listen, reply.hangup = [V.Say(t["bye"], code)], False, True
        elif digit == "1":
            draft = stored_response(db, "draft", call_hash)
            reply.send_written = True   # explicit consent: the caller pressed 1 after being offered the written details
            msg = t[self._send_written(from_number, draft, L, simulated)] if draft else t["send_nothing"]
            reply.say = [V.Say(msg + t["listen_more"], code)]
        else:
            reply.say = [V.Say(t["listen_more"], code)]
        return reply

    def _put_draft(self, db: Session, call_hash: str, text: str) -> None:
        if not claim_event(db, "draft", call_hash, text):
            row = db.scalar(select(ChannelDedupe).where(ChannelDedupe.provider == "draft", ChannelDedupe.event_id == call_hash))
            if row is not None:
                row.response = text
                db.commit()

    def _send_written(self, to: str | None, text: str, L: str, simulated: bool) -> str:
        """SMS or approved-template WhatsApp to the caller's own number, only after they pressed 1. Returns a message key."""
        if simulated:
            return "send_ok"
        if not to:
            return "send_fail"
        s = self.settings
        try:
            if self.whatsapp_sending_configured and s.whatsapp_followup_template:
                self.wa().send_template(to.lstrip("+"), s.whatsapp_followup_template, s.whatsapp_followup_template_language, [text])
                return "send_ok"
            if s.twilio_account_sid and s.twilio_auth_token and s.twilio_sms_from:
                self.tw().send_sms(to, text)
                return "send_ok"
        except ProviderError:
            return "send_fail"
        return "send_none"

    # ------------------------------------------------------------------------------------------ voice: webhook helpers
    def voice_event_response(self, db: Session, call_sid: str, n: int, miss: int, start: bool) -> str | None:
        """Replay of a turn the provider retried: same CallSid + turn => same TwiML."""
        return stored_response(db, "twilio", f"{call_sid}:{'start' if start else f'{n}:{miss}'}")

    def voice_claim(self, db: Session, call_sid: str, n: int, miss: int, start: bool, twiml: str | None = None) -> bool:
        return claim_event(db, "twilio", f"{call_sid}:{'start' if start else f'{n}:{miss}'}", twiml)

    def voice_save(self, db: Session, call_sid: str, n: int, miss: int, start: bool, twiml: str) -> None:
        save_response(db, "twilio", f"{call_sid}:{'start' if start else f'{n}:{miss}'}", twiml)

    # ------------------------------------------------------------------------------------------ status / checks
    def credentials(self) -> dict[str, list[dict[str, Any]]]:
        s = self.settings

        def item(name: str, env: str, present: bool, required: bool, purpose: str) -> dict[str, Any]:
            return {"name": name, "env": env, "present": bool(present), "required": required, "purpose": purpose}
        return {
            "whatsapp": [
                item("Verify token", "WHATSAPP_VERIFY_TOKEN", s.whatsapp_verify_token, True, "Meta calls GET /webhook with this token when you register the URL"),
                item("App secret", "WHATSAPP_APP_SECRET", s.whatsapp_app_secret, True, "Verifies the X-Hub-Signature-256 on every incoming webhook"),
                item("Access token", "WHATSAPP_ACCESS_TOKEN", s.whatsapp_access_token, True, "Sends replies through the Cloud API"),
                item("Phone number ID", "WHATSAPP_PHONE_NUMBER_ID", s.whatsapp_phone_number_id, True, "Which WhatsApp number replies"),
                item("PII hash secret", "PII_HASH_SECRET", s.pii_hash_secret, True, "Turns phone numbers into opaque ids (numbers are never stored)"),
                item("Voice-note transcription", "STT_PROVIDER + OPENAI_API_KEY", s.stt_provider == "openai", False, "Needed only to understand voice notes"),
                item("Follow-up template", "WHATSAPP_FOLLOWUP_TEMPLATE", s.whatsapp_followup_template, False, "Needed only to send written details after a phone call"),
            ],
            "voice": [
                item("Auth token", "TWILIO_AUTH_TOKEN", s.twilio_auth_token, True, "Verifies the X-Twilio-Signature on every call webhook"),
                item("Account SID", "TWILIO_ACCOUNT_SID", s.twilio_account_sid, False, "Needed for connection checks and SMS"),
                item("Public base URL", "PUBLIC_BASE_URL", s.public_base_url, True, "The exact https origin Twilio calls (part of the signed URL)"),
                item("PII hash secret", "PII_HASH_SECRET", s.pii_hash_secret, True, "Turns call ids into opaque ids"),
                item("SMS sender number", "TWILIO_SMS_FROM", s.twilio_sms_from, False, "Needed only to SMS written details (India: DLT registration applies)"),
            ],
        }

    def status(self, db: Session) -> dict[str, Any]:
        s = self.settings
        base = s.public_base_url or "https://<your-public-url>"
        counts: dict[str, dict[str, int]] = {"whatsapp": {}, "twilio": {}}
        rows = db.execute(select(ChannelLog.provider, ChannelLog.outcome, func.count()).where(ChannelLog.simulated.is_(False))
                          .where(ChannelLog.kind.in_(["message", "call_turn"])).group_by(ChannelLog.provider, ChannelLog.outcome)).all()
        for prov, outcome, n in rows:
            counts.setdefault(prov, {})[outcome] = n

        def last(kind: list[str], provider: str, outcome: str | None = None):
            q = select(func.max(ChannelLog.ts)).where(ChannelLog.provider == provider, ChannelLog.kind.in_(kind), ChannelLog.simulated.is_(False))
            if outcome:
                q = q.where(ChannelLog.outcome == outcome)
            return db.scalar(q)

        def iso(d):
            return d.isoformat() if d else None

        def checked(provider: str):
            row = db.scalars(select(ChannelLog).where(ChannelLog.provider == provider, ChannelLog.kind == "connection_check")
                             .order_by(ChannelLog.id.desc()).limit(1)).first()
            return None if row is None else {"at": iso(row.ts), "ok": row.outcome == "passed", "error_code": row.error_code, "detail": row.detail}

        def entries(q):
            return [{"at": iso(r.ts), "provider": r.provider, "kind": r.kind, "outcome": r.outcome, "error_code": r.error_code,
                     "latency_ms": r.latency_ms, "simulated": r.simulated, "detail": r.detail} for r in db.scalars(q).all()]
        recent = entries(select(ChannelLog).order_by(ChannelLog.id.desc()).limit(25))
        tests = entries(select(ChannelLog).where(ChannelLog.kind.in_(["selftest", "connection_check"])).order_by(ChannelLog.id.desc()).limit(10))
        errors = entries(select(ChannelLog).where(ChannelLog.outcome.in_(["failed", "rejected"])).order_by(ChannelLog.id.desc()).limit(10))
        creds = self.credentials()
        wa_ready = self.whatsapp_receiving_configured and bool(s.whatsapp_verify_token) and self.whatsapp_sending_configured
        return {
            "demo_enabled": s.demo_enabled,
            "whatsapp": {"name": "Rule Dost", "configured": wa_ready, "credentials": creds["whatsapp"],
                         "webhook_url": f"{base}/api/v1/channels/whatsapp/webhook", "counts": counts.get("whatsapp", {}),
                         "last_message_at": iso(last(["message"], "whatsapp")), "connection": checked("whatsapp"),
                         "voice_notes": s.stt_provider != "none", "api_version": s.whatsapp_api_version},
            "voice": {"name": "Nirmaan Helpline", "configured": self.voice_configured and bool(s.public_base_url), "credentials": creds["voice"],
                      "incoming_url": f"{base}/api/v1/channels/voice/incoming", "counts": counts.get("twilio", {}),
                      "last_call_at": iso(last(["call_turn"], "twilio")), "connection": checked("twilio"), "language": s.voice_language,
                      "tts_voice": s.voice_tts_voice, "written_followup": bool((s.whatsapp_followup_template and self.whatsapp_sending_configured)
                                                                               or (s.twilio_sms_from and s.twilio_account_sid))},
            "stt": {"provider": s.stt_provider, "model": s.stt_model if s.stt_provider != "none" else None},
            "recent_events": recent, "recent_tests": tests, "recent_errors": errors,
        }

    def check_connections(self, db: Session) -> list[dict[str, Any]]:
        """Real, read-only calls to the providers (only when credentials exist). Records pass/fail without any personal data."""
        out = []
        for provider, label, configured, call in (
            ("whatsapp", "WhatsApp Cloud API", self.whatsapp_sending_configured, lambda: self.wa().check_connection()),
            ("twilio", "Twilio", bool(self.settings.twilio_account_sid and self.settings.twilio_auth_token), lambda: self.tw().check_connection()),
        ):
            if not configured:
                out.append({"provider": provider, "label": label, "outcome": "not_configured"})
                continue
            t0 = time.perf_counter()
            try:
                detail = call()
                log_event(db, provider, "connection_check", "passed", latency_ms=int((time.perf_counter() - t0) * 1000), detail=detail)
                out.append({"provider": provider, "label": label, "outcome": "passed", "detail": detail})
            except ProviderError as e:
                log_event(db, provider, "connection_check", "failed", error_code=e.code, latency_ms=int((time.perf_counter() - t0) * 1000))
                out.append({"provider": provider, "label": label, "outcome": "failed", "error_code": e.code})
        return out

    def selftest(self, db: Session) -> dict[str, Any]:
        """Offline checks of our own logic (no provider is called): signatures, atomic dedupe, source-backed quotes, abstention."""
        checks: list[dict[str, Any]] = []

        def check(name: str, ok: bool, note: str = "") -> None:
            checks.append({"name": name, "ok": bool(ok), "note": note})
        body = json.dumps({"x": 1}).encode()
        sig = "sha256=" + __import__("hmac").new(b"k", body, __import__("hashlib").sha256).hexdigest()
        check("meta signature accepted when valid, rejected when body is altered",
              verify_meta_signature("k", body, sig) and not verify_meta_signature("k", body + b" ", sig) and not verify_meta_signature("k", body, None))
        known = {"CallSid": ["CA1234567890ABCDE"], "Caller": ["+12349013030"], "Digits": ["1234"], "From": ["+12349013030"], "To": ["+18005551212"]}
        check("twilio signature algorithm reproduces a documented example",
              twilio_signature("12345", "https://mycompany.com/myapp.php?foo=1&bar=2", known) == "0/KCTR6DLpKmkAf8muzZqo1nDgQ=",
              "example recalled from Twilio's documentation")
        probe = "selftest-" + secrets.token_hex(6)
        first, second = claim_event(db, "selftest", probe), claim_event(db, "selftest", probe)
        db.execute(ChannelDedupe.__table__.delete().where(ChannelDedupe.provider == "selftest"))
        db.commit()
        check("the same webhook event is processed once", first and not second)
        ctx = self._ctx()
        if ctx.store is None:
            check("rules are loaded", False, "no rules in the database")
        else:
            contact = get_contact(db, self.hash("selftest", probe), "selftest")
            cid = conversation_id(self.hash("selftest", probe), "st")
            for q in SELFTEST_QUESTIONS:
                a = answer_text(db, ctx, contact, cid, q, owner=DEMO_OWNER)
                good = bool(a.citations) and all(
                    (ev := ctx.store.get_evidence(c.evidence_id)) is not None and c.quote in ev.excerpt and ev.rule_number == c.rule_number
                    for c in a.citations)
                check(f"answers with exact quotes from stored rule text: “{q[:48]}…”", good, ", ".join(c.rule_number for c in a.citations))
            off = answer_text(db, ctx, contact, cid, SELFTEST_OFF_TOPIC, owner=DEMO_OWNER)
            check("abstains on a question the rules do not answer", off.kind == "abstain" and not off.citations)
            db.execute(Conversation.__table__.delete().where(Conversation.id == cid))
            db.rollback()
        ok = all(c["ok"] for c in checks)
        log_event(db, "system", "selftest", "passed" if ok else "failed", detail={"checks": checks})
        return {"ok": ok, "checks": checks}
