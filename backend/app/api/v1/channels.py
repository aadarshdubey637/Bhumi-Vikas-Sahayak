"""WhatsApp ("Rule Dost") and phone ("Nirmaan Helpline") channels.

Webhooks (called by Meta / Twilio) are public but protected by provider signatures, never by an API key. Operator and demo endpoints
require the normal API key (when AUTH_MODE=api_key). Demo endpoints are clearly marked as simulation in every response.
"""
from __future__ import annotations

import json
import re
import secrets
from typing import Annotated
from urllib.parse import parse_qs

from fastapi import APIRouter, BackgroundTasks, Depends, Query, Request, Response
from fastapi.responses import PlainTextResponse

from app.api.deps import get_principal
from app.channels import voice as V
from app.channels.providers import IncomingMessage, parse_whatsapp_webhook
from app.channels.service import CaptureWhatsApp, ChannelService
from app.channels.store import log_event
from app.core.exceptions import AppError, ServiceUnavailable, Unauthorized
from app.schemas.channels import (
    ChannelStatusResponse,
    ConnectionCheckResponse,
    DemoCallRequest,
    DemoCallResponse,
    DemoWhatsAppRequest,
    DemoWhatsAppResponse,
    SelfTestResponse,
)

router = APIRouter(prefix="/channels", tags=["channels"])
Authed = Depends(get_principal)
_CALL_SID = re.compile(r"^[A-Za-z0-9]{10,64}$")
_EVIDENCE_ID = re.compile(r"^EV-[A-Za-z0-9\-]{3,60}$")
SIM_LABEL = "SIMULATION: no real WhatsApp message or phone call is involved. Answers come from the real rule-answering backend."
VOICE_PATH = "/api/v1/channels/voice/turn"


class Forbidden(AppError):
    status_code, code = 403, "forbidden"


def svc(request: Request) -> ChannelService:
    return request.app.state.channels


def _reject(service: ChannelService, provider: str, kind: str, code: str) -> None:
    with service.app.state.session_factory() as db:
        log_event(db, provider, kind, "rejected", error_code=code)


# ------------------------------------------------------------------------------------------------ WhatsApp webhook
@router.get("/whatsapp/webhook", include_in_schema=False)
def whatsapp_verify(request: Request, mode: Annotated[str | None, Query(alias="hub.mode")] = None,
                    token: Annotated[str | None, Query(alias="hub.verify_token")] = None,
                    challenge: Annotated[str | None, Query(alias="hub.challenge")] = None) -> PlainTextResponse:
    """Meta's one-time handshake when the callback URL is registered: echo hub.challenge iff the verify token matches."""
    service = svc(request)
    expected = service.settings.whatsapp_verify_token
    if expected is None:
        raise ServiceUnavailable("WhatsApp is not configured on this server", code="channel_not_configured")
    ok = mode == "subscribe" and token is not None and secrets.compare_digest(token.encode(), expected.get_secret_value().encode())
    if not ok or challenge is None:
        _reject(service, "whatsapp", "message", "bad_verify_token")
        raise Forbidden("verification failed")
    return PlainTextResponse(challenge)


@router.post("/whatsapp/webhook", include_in_schema=False)
async def whatsapp_webhook(request: Request, background: BackgroundTasks) -> dict[str, int]:
    """Receives messages. Answers 200 quickly (Meta retries slow/failed webhooks); the reply is produced in the background."""
    service = svc(request)
    if not service.whatsapp_receiving_configured:
        raise ServiceUnavailable("WhatsApp is not configured on this server", code="channel_not_configured")
    raw = await request.body()
    if not service.verify_meta(raw, request.headers.get("x-hub-signature-256")):
        _reject(service, "whatsapp", "message", "bad_signature")
        raise Unauthorized("invalid webhook signature")
    try:
        payload = json.loads(raw)
    except ValueError as e:
        _reject(service, "whatsapp", "message", "bad_json")
        raise AppError("malformed JSON body", code="bad_request") from e
    messages = parse_whatsapp_webhook(payload)
    for m in messages:
        background.add_task(service.process_whatsapp_message, m)
    return {"received": len(messages)}


# ------------------------------------------------------------------------------------------------ Voice webhooks (Twilio)
def _public_url(service: ChannelService, request: Request) -> str:
    base = service.settings.public_base_url
    if base:
        return base.rstrip("/") + request.url.path + (f"?{request.url.query}" if request.url.query else "")
    return str(request.url)


async def _verified_params(service: ChannelService, request: Request) -> dict[str, list[str]]:
    if not service.voice_configured:
        raise ServiceUnavailable("the phone line is not configured on this server", code="channel_not_configured")
    raw = await request.body()
    params = parse_qs(raw.decode("utf-8", "replace"), keep_blank_values=True)
    if not service.verify_twilio(_public_url(service, request), params, request.headers.get("x-twilio-signature")):
        _reject(service, "twilio", "call_turn", "bad_signature")
        raise Forbidden("invalid webhook signature")
    return params


def _one(params: dict[str, list[str]], key: str) -> str | None:
    v = params.get(key)
    return v[0] if v else None


def _twiml(service: ChannelService, reply: V.VoiceReply) -> str:
    base = (service.settings.public_base_url or "").rstrip("/")
    return V.to_twiml(reply, action_url=V.action_url(base, VOICE_PATH, reply), voice=service.settings.voice_tts_voice)


def _xml(body: str) -> Response:
    return Response(content=body, media_type="application/xml")


@router.post("/voice/incoming", include_in_schema=False)
async def voice_incoming(request: Request) -> Response:
    service = svc(request)
    params = await _verified_params(service, request)
    call_sid = _one(params, "CallSid") or ""
    if not _CALL_SID.match(call_sid):
        raise AppError("missing or invalid CallSid", code="bad_request")
    with service.app.state.session_factory() as db:
        if not service.voice_claim(db, call_sid, 0, 0, True):
            again = service.voice_event_response(db, call_sid, 0, 0, True)
            log_event(db, "twilio", "call_turn", "duplicate")
            if again:
                return _xml(again)
    reply = service.voice_turn(call_sid=call_sid, n=0, miss=0, lang=service.settings.voice_language, speech=None, confidence=None,
                               digits=None, evidence_ids=[], from_number=None, start=True)
    xml = _twiml(service, reply)
    with service.app.state.session_factory() as db:
        service.voice_save(db, call_sid, 0, 0, True, xml)
    return _xml(xml)


@router.post("/voice/turn", include_in_schema=False)
async def voice_turn(request: Request, n: int = Query(default=1, ge=0, le=50), miss: int = Query(default=0, ge=0, le=10),
                     lang: str = Query(default="hi-IN", max_length=8), ev: str = Query(default="", max_length=400)) -> Response:
    service = svc(request)
    params = await _verified_params(service, request)
    call_sid = _one(params, "CallSid") or ""
    if not _CALL_SID.match(call_sid):
        raise AppError("missing or invalid CallSid", code="bad_request")
    with service.app.state.session_factory() as db:
        if not service.voice_claim(db, call_sid, n, miss, False):
            log_event(db, "twilio", "call_turn", "duplicate")
            again = service.voice_event_response(db, call_sid, n, miss, False)
            if again:
                return _xml(again)   # the provider retried this exact turn: replay the same answer, do not process it twice
    try:
        confidence = float(_one(params, "Confidence") or "")
    except ValueError:
        confidence = None
    evidence_ids = [e for e in ev.split(",") if _EVIDENCE_ID.match(e)][:4]
    reply = service.voice_turn(call_sid=call_sid, n=n, miss=miss, lang=lang, speech=_one(params, "SpeechResult"), confidence=confidence,
                               digits=_one(params, "Digits"), evidence_ids=evidence_ids, from_number=_one(params, "From"))
    xml = _twiml(service, reply)
    with service.app.state.session_factory() as db:
        service.voice_save(db, call_sid, n, miss, False, xml)
    return _xml(xml)


# ------------------------------------------------------------------------------------------------ operator endpoints
@router.get("/status", response_model=ChannelStatusResponse, dependencies=[Authed],
            summary="Integration status: configuration, credentials present (never their values), recent events and tests")
def channel_status(request: Request) -> ChannelStatusResponse:
    service = svc(request)
    with service.app.state.session_factory() as db:
        return ChannelStatusResponse.model_validate(service.status(db))


@router.post("/check-connection", response_model=ConnectionCheckResponse, dependencies=[Authed],
             summary="Read-only calls to WhatsApp Cloud API / Twilio (only when their credentials are configured)")
def check_connection(request: Request) -> ConnectionCheckResponse:
    service = svc(request)
    with service.app.state.session_factory() as db:
        return ConnectionCheckResponse(results=service.check_connections(db))


@router.post("/selftest", response_model=SelfTestResponse, dependencies=[Authed],
             summary="Offline self-test of signatures, duplicate protection, exact quotes and abstention (calls no provider)")
def selftest(request: Request) -> SelfTestResponse:
    service = svc(request)
    with service.app.state.session_factory() as db:
        return SelfTestResponse.model_validate(service.selftest(db))


def _need_demo(service: ChannelService) -> None:
    if not service.settings.demo_enabled:
        raise Forbidden("demo mode is disabled on this server (CHANNELS_DEMO_ENABLED=false)")


@router.post("/demo/whatsapp", response_model=DemoWhatsAppResponse, dependencies=[Authed],
             summary="SIMULATED WhatsApp message through the real answer pipeline (no WhatsApp involved)")
def demo_whatsapp(body: DemoWhatsAppRequest, request: Request) -> DemoWhatsAppResponse:
    service = svc(request)
    _need_demo(service)
    capture = CaptureWhatsApp()
    mtype = {"text": "text", "voice_note": "audio", "image": "image"}[body.kind]
    msg = IncomingMessage(id="demo-" + secrets.token_hex(8), sender=body.session_id, type=mtype, text=body.text,
                          media_id="demo" if mtype == "audio" else None)
    if mtype == "audio" and not body.transcript:
        raise AppError("a simulated voice note needs 'transcript'", code="validation_error", status_code=422)
    if mtype == "text" and not body.text:
        raise AppError("a text message needs 'text'", code="validation_error", status_code=422)
    service.process_whatsapp_message(msg, send=capture.send_text, simulated=True, transcript=body.transcript)
    return DemoWhatsAppResponse(label=SIM_LABEL, messages=[m for _, m in capture.sent])


@router.post("/demo/call", response_model=DemoCallResponse, dependencies=[Authed],
             summary="SIMULATED phone-call turn through the real dialogue logic (no telephony involved)")
def demo_call(body: DemoCallRequest, request: Request) -> DemoCallResponse:
    service = svc(request)
    _need_demo(service)
    if body.event == "speech" and not body.speech:
        raise AppError("a speech event needs 'speech'", code="validation_error", status_code=422)
    if body.event == "digit" and not body.digits:
        raise AppError("a digit event needs 'digits'", code="validation_error", status_code=422)
    evidence = [e for e in body.evidence_ids if _EVIDENCE_ID.match(e)]
    reply = service.voice_turn(call_sid=body.session_id, n=body.n, miss=body.miss, lang=body.lang,
                               speech=body.speech if body.event == "speech" else None, confidence=body.confidence,
                               digits=body.digits if body.event == "digit" else None, evidence_ids=evidence, from_number=None,
                               start=body.event == "start", simulated=True)
    return DemoCallResponse(label=SIM_LABEL, say=[{"text": s.text, "lang": s.lang} for s in reply.say], listen=reply.listen and not reply.hangup,
                            hangup=reply.hangup, lang=reply.lang, next_n=reply.next_n, misses=reply.misses, evidence_ids=reply.evidence_ids,
                            twiml=_twiml(service, reply))
