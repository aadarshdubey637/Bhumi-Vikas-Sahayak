"""Request/response models for the operator + demo endpoints of the channels. (Webhooks are provider-defined and not modelled here.)"""
from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

SESSION_PATTERN = r"^[A-Za-z0-9_\-]{8,64}$"


class _Req(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class _Resp(BaseModel):
    model_config = ConfigDict(extra="ignore")


class DemoWhatsAppRequest(_Req):
    """Simulated incoming WhatsApp message. ``session_id`` stands in for a phone number (random, chosen by the demo page)."""
    session_id: str = Field(pattern=SESSION_PATTERN)
    kind: Literal["text", "voice_note", "image"] = "text"
    text: str | None = Field(default=None, max_length=1000)
    transcript: str | None = Field(default=None, max_length=1000, description="What the simulated voice note says (no real audio is processed)")

    @field_validator("text", "transcript")
    @classmethod
    def _blank_to_none(cls, v: str | None) -> str | None:
        return v or None


class DemoWhatsAppResponse(_Resp):
    simulated: Literal[True] = True
    label: str
    messages: list[str]


class DemoCallRequest(_Req):
    """Simulated phone call turn. Mirrors what Twilio sends: a start, then speech / silence / a keypad digit."""
    session_id: str = Field(pattern=SESSION_PATTERN)
    event: Literal["start", "speech", "silence", "digit"]
    speech: str | None = Field(default=None, max_length=1000)
    confidence: float | None = Field(default=None, ge=0, le=1)
    digits: str | None = Field(default=None, pattern=r"^[0-9*#]$")
    n: int = Field(default=1, ge=0, le=50)
    miss: int = Field(default=0, ge=0, le=10)
    lang: Literal["hi-IN", "en-IN"] = "hi-IN"
    evidence_ids: list[str] = Field(default_factory=list, max_length=4)


class SaySegment(_Resp):
    text: str
    lang: str


class DemoCallResponse(_Resp):
    simulated: Literal[True] = True
    label: str
    say: list[SaySegment]
    listen: bool
    hangup: bool
    lang: str
    next_n: int
    misses: int
    evidence_ids: list[str]
    twiml: str


class ChannelStatusResponse(_Resp):
    demo_enabled: bool
    whatsapp: dict[str, Any]
    voice: dict[str, Any]
    stt: dict[str, Any]
    recent_events: list[dict[str, Any]]
    recent_tests: list[dict[str, Any]]
    recent_errors: list[dict[str, Any]]


class CheckResult(_Resp):
    provider: str
    label: str
    outcome: Literal["passed", "failed", "not_configured"]
    error_code: str | None = None
    detail: dict[str, Any] | None = None


class ConnectionCheckResponse(_Resp):
    results: list[CheckResult]


class SelfTestCheck(_Resp):
    name: str
    ok: bool
    note: str = ""


class SelfTestResponse(_Resp):
    ok: bool
    checks: list[SelfTestCheck]
