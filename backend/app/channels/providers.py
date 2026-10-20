"""HTTP clients for the external services. Thin, explicit and testable with ``httpx.MockTransport``.

Nothing here has been run against the real services in this repository's tests (no credentials were available); the request shapes
follow the providers' public documentation and are exercised against mock transports only. See docs/channels.md "Verification status".
"""
from __future__ import annotations

import base64
import contextlib
import hashlib
import hmac
import time
from dataclasses import dataclass
from typing import Any
from urllib.parse import urlencode

import httpx

from app.core.config import Settings

MAX_AUDIO_BYTES = 8 * 1024 * 1024
GRAPH = "https://graph.facebook.com"
TWILIO_API = "https://api.twilio.com/2010-04-01"
OPENAI_API = "https://api.openai.com/v1"


class ProviderError(Exception):
    """A provider call failed. ``code`` is safe to log and show (no secrets, no personal data)."""

    def __init__(self, code: str, status: int | None = None, retryable: bool = False):
        super().__init__(code)
        self.code, self.status, self.retryable = code, status, retryable


def _request(http: httpx.Client, method: str, url: str, *, retries: int = 1, **kw: Any) -> httpx.Response:
    """One retry for timeouts / 5xx / 429; every failure becomes a ProviderError with a short code."""
    last: ProviderError | None = None
    for attempt in range(retries + 1):
        try:
            r = http.request(method, url, **kw)
        except httpx.TimeoutException:
            last = ProviderError("timeout", None, True)
        except httpx.HTTPError:
            last = ProviderError("network_error", None, True)
        else:
            if r.status_code < 400:
                return r
            last = ProviderError(f"http_{r.status_code}", r.status_code, r.status_code >= 500 or r.status_code == 429)
        if not last.retryable or attempt == retries:
            break
        time.sleep(0.4)
    assert last is not None
    raise last


# ------------------------------------------------------------------------------------------------ WhatsApp Cloud API
def verify_meta_signature(app_secret: str, raw_body: bytes, header: str | None) -> bool:
    """X-Hub-Signature-256 = 'sha256=' + HMAC-SHA256(app_secret, raw body). Constant-time comparison."""
    if not header or not header.startswith("sha256="):
        return False
    expected = hmac.new(app_secret.encode("utf-8"), raw_body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, header[len("sha256="):].strip().lower())


@dataclass
class IncomingMessage:
    id: str
    sender: str          # WhatsApp id (phone number). Used to reply and to derive the opaque contact id; never stored or logged.
    type: str            # text | audio | image | document | video | sticker | location | contacts | interactive | button | unsupported
    text: str | None = None
    media_id: str | None = None
    mime: str | None = None


def parse_whatsapp_webhook(payload: dict[str, Any]) -> list[IncomingMessage]:
    """Extract user messages from a Cloud API webhook; delivery/read statuses and malformed entries are ignored."""
    out: list[IncomingMessage] = []
    if not isinstance(payload, dict) or payload.get("object") != "whatsapp_business_account":
        return out
    for entry in payload.get("entry") or []:
        for change in (entry or {}).get("changes") or []:
            value = (change or {}).get("value") or {}
            for m in value.get("messages") or []:
                if not isinstance(m, dict) or not m.get("id") or not m.get("from"):
                    continue
                t = str(m.get("type") or "unsupported")
                msg = IncomingMessage(id=str(m["id"])[:160], sender=str(m["from"])[:32], type=t)
                if t == "text":
                    msg.text = str((m.get("text") or {}).get("body") or "")
                elif t in ("audio", "image", "document", "video", "sticker"):
                    media = m.get(t) or {}
                    msg.media_id, msg.mime = (str(media["id"]) if media.get("id") else None), media.get("mime_type")
                elif t in ("interactive", "button"):
                    reply = (m.get("interactive") or {}).get("button_reply") or (m.get("interactive") or {}).get("list_reply") or m.get("button") or {}
                    msg.text = str(reply.get("title") or reply.get("text") or "") or None
                    msg.type = "text" if msg.text else t
                out.append(msg)
    return out


class WhatsAppClient:
    def __init__(self, settings: Settings, http: httpx.Client | None = None):
        self.s = settings
        self.http = http or httpx.Client(timeout=settings.channel_http_timeout_seconds)

    @property
    def _base(self) -> str:
        return f"{GRAPH}/{self.s.whatsapp_api_version}"

    def _auth(self) -> dict[str, str]:
        tok = self.s.whatsapp_access_token
        if not tok or not self.s.whatsapp_phone_number_id:
            raise ProviderError("not_configured")
        return {"Authorization": f"Bearer {tok.get_secret_value()}"}

    def send_text(self, to: str, body: str) -> None:
        _request(self.http, "POST", f"{self._base}/{self.s.whatsapp_phone_number_id}/messages", headers=self._auth(),
                 json={"messaging_product": "whatsapp", "recipient_type": "individual", "to": to, "type": "text",
                       "text": {"preview_url": False, "body": body[:4096]}})

    def send_template(self, to: str, name: str, language: str, body_params: list[str]) -> None:
        """Business-initiated message (outside the 24 h customer-service window) must use an approved template."""
        clean = [" ".join(p.split())[:1000] for p in body_params]   # template parameters may not contain newlines or tabs
        _request(self.http, "POST", f"{self._base}/{self.s.whatsapp_phone_number_id}/messages", headers=self._auth(),
                 json={"messaging_product": "whatsapp", "to": to, "type": "template",
                       "template": {"name": name, "language": {"code": language},
                                    "components": [{"type": "body", "parameters": [{"type": "text", "text": p} for p in clean]}]}})

    def mark_read(self, message_id: str) -> None:
        with contextlib.suppress(ProviderError):  # cosmetic; never block an answer on it
            _request(self.http, "POST", f"{self._base}/{self.s.whatsapp_phone_number_id}/messages", retries=0, headers=self._auth(),
                     json={"messaging_product": "whatsapp", "status": "read", "message_id": message_id})

    def download_media(self, media_id: str) -> tuple[bytes, str]:
        meta = _request(self.http, "GET", f"{self._base}/{media_id}", headers=self._auth()).json()
        url, mime = meta.get("url"), meta.get("mime_type") or "application/octet-stream"
        if not url or int(meta.get("file_size") or 0) > MAX_AUDIO_BYTES:
            raise ProviderError("media_unavailable_or_too_large")
        r = _request(self.http, "GET", url, headers=self._auth())
        if len(r.content) > MAX_AUDIO_BYTES:
            raise ProviderError("media_too_large")
        return r.content, mime

    def check_connection(self) -> dict[str, Any]:
        r = _request(self.http, "GET", f"{self._base}/{self.s.whatsapp_phone_number_id}", retries=0, headers=self._auth(),
                     params={"fields": "verified_name,quality_rating"})
        j = r.json()
        return {"verified_name": j.get("verified_name"), "quality_rating": j.get("quality_rating")}


# ------------------------------------------------------------------------------------------------ Speech to text
class STTUnavailable(Exception):
    pass


class DisabledTranscriber:
    def transcribe(self, audio: bytes, mime: str) -> str:
        raise STTUnavailable("speech-to-text is not configured")


class OpenAITranscriber:
    """OpenAI audio transcription (Whisper family). Accepts the ogg/opus that WhatsApp voice notes use. Hindi, English and mixed
    speech are transcribed; Devanagari output is handled by the same query pipeline as typed Hindi."""
    PROMPT = "भूमि विकास नियम, मकान, प्लॉट, सड़क की चौड़ाई, setback, FAR, open space, building permission, rule 26-B"

    def __init__(self, settings: Settings, http: httpx.Client | None = None):
        self.s = settings
        self.http = http or httpx.Client(timeout=max(settings.channel_http_timeout_seconds, 30.0))

    def transcribe(self, audio: bytes, mime: str) -> str:
        if not self.s.openai_api_key:
            raise STTUnavailable("OPENAI_API_KEY missing")
        ext = "ogg" if "ogg" in mime else "mp3" if "mpeg" in mime else "m4a" if "mp4" in mime or "aac" in mime else "wav" if "wav" in mime else "ogg"
        r = _request(self.http, "POST", f"{OPENAI_API}/audio/transcriptions",
                     headers={"Authorization": f"Bearer {self.s.openai_api_key.get_secret_value()}"},
                     data={"model": self.s.stt_model, "response_format": "json", "prompt": self.PROMPT},
                     files={"file": (f"voice.{ext}", audio, mime.split(";")[0] or "audio/ogg")})
        return " ".join(str(r.json().get("text", "")).split())


def make_transcriber(settings: Settings) -> OpenAITranscriber | DisabledTranscriber:
    return OpenAITranscriber(settings) if settings.stt_provider == "openai" else DisabledTranscriber()


# ------------------------------------------------------------------------------------------------ Twilio
def twilio_signature(auth_token: str, url: str, params: dict[str, list[str]]) -> str:
    """Twilio request signature: base64(HMAC-SHA1(auth_token, url + each POST param name followed by its value, names sorted))."""
    data = url
    for key in sorted(params):
        for value in sorted(params[key]):
            data += key + value
    return base64.b64encode(hmac.new(auth_token.encode("utf-8"), data.encode("utf-8"), hashlib.sha1).digest()).decode()


def verify_twilio_signature(auth_token: str, url: str, params: dict[str, list[str]], header: str | None) -> bool:
    return bool(header) and hmac.compare_digest(twilio_signature(auth_token, url, params), header.strip())


class TwilioClient:
    def __init__(self, settings: Settings, http: httpx.Client | None = None):
        self.s = settings
        self.http = http or httpx.Client(timeout=settings.channel_http_timeout_seconds)

    def _auth(self) -> tuple[str, str]:
        if not (self.s.twilio_account_sid and self.s.twilio_auth_token):
            raise ProviderError("not_configured")
        return self.s.twilio_account_sid, self.s.twilio_auth_token.get_secret_value()

    def send_sms(self, to: str, body: str) -> None:
        if not self.s.twilio_sms_from:
            raise ProviderError("sms_not_configured")
        sid, token = self._auth()
        _request(self.http, "POST", f"{TWILIO_API}/Accounts/{sid}/Messages.json", auth=(sid, token),
                 content=urlencode({"To": to, "From": self.s.twilio_sms_from, "Body": body[:1500]}),
                 headers={"Content-Type": "application/x-www-form-urlencoded"})

    def check_connection(self) -> dict[str, Any]:
        sid, token = self._auth()
        j = _request(self.http, "GET", f"{TWILIO_API}/Accounts/{sid}.json", retries=0, auth=(sid, token)).json()
        return {"account_status": j.get("status"), "type": j.get("type")}
