"""The ONE answering service behind WhatsApp ("Rule Dost") and the phone line ("Nirmaan Helpline").

It wraps the existing ``run_ask`` pipeline (retrieval, evidence validation, six-status policy) and adds only presentation data:
the deciding sentence of each cited rule (an exact substring of stored rule text), its PDF page, one follow-up question at a time,
and the chit-chat commands a messaging channel needs (greeting, thanks, STOP). It never writes legal content of its own and never
turns an unverified rule into a verified answer.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta
from typing import Any

from sqlalchemy import delete
from sqlalchemy.orm import Session

from app.channels.passages import Passage, best_passage, best_passage_in_chunks
from app.core.config import Settings
from app.core.security import Principal
from app.models import ChannelContact, Conversation
from app.rag.query import normalize_query
from app.repositories.rule_repository import load_amendment_dataclasses
from app.schemas.api import AskRequest, Measurement
from app.services.ask_orchestrator import run_ask
from app.services.entity_extraction_service import _unit as parse_unit_text
from app.services.entity_extraction_service import extract_facts
from app.services.llm_service import LLMProvider, NullProvider
from app.services.retrieval_service import RuleStore

MAX_TEXT = 1000
MAX_CITATIONS = 2
LOOKUP_CHARS = 1400  # an exact "Rule 56" request shows more of the rule than a normal answer does

STOP_WORDS = {"stop", "unsubscribe", "cancel", "optout", "opt out", "रोकें", "रोको", "रुकें", "बंद", "बन्द", "band", "rukein", "roko"}
START_WORDS = {"start", "subscribe", "resume", "शुरू", "शुरु", "chalu"}
GREETINGS = {"hi", "hii", "hiii", "hy", "hey", "hello", "helo", "namaste", "namaskar", "नमस्ते", "नमस्कार", "हेलो", "हाय", "हैलो",
              "menu", "help", "मदद", "सहायता", "madad"}
THANKS = {"thanks", "thank you", "thx", "ty", "ok", "okay", "ok thanks", "thik hai", "theek hai", "dhanyavad", "dhanyawad", "shukriya",
          "धन्यवाद", "शुक्रिया", "ठीक है", "आभार"}

# what to ask for, in order, when the question is about a building on a plot and the fact is still unknown
NEEDS: dict[str, list[str]] = {
    "setback": ["plot_area", "road_width", "building_height"],
    "floor_area": ["plot_area", "road_width"],
    "height": ["road_width"],
    "parking": ["plot_area"],
    "permission_applicability": ["plot_area"],
    "general_rule_question": ["plot_area", "road_width"],
}
CONSTRUCTION_WORDS = re.compile(r"\b(?:ghar|makaan|makan|house|building|construct\w*|banane|banwana|plot|मकान|घर|निर्माण|प्लॉट|भवन)\b", re.IGNORECASE)
# a follow-up reply is usually just a number with an optional unit: "9", "9 m", "9 मीटर", "150 sq m"
_BARE_MEASURE = re.compile(r"^\s*(\d+(?:[.,]\d+)?)\s*([A-Za-zऀ-ॿ.\s]{0,14}?)\s*[.!]?\s*$")
DEFAULT_UNIT = {"plot_area": "sqm", "road_width": "m", "building_height": "m"}
# re-ask the retrieval with a neutral, PII-free phrasing of the last topic (the user's own words are never stored)
INTENT_QUERY = {
    "setback": "front rear side open space residential building",
    "floor_area": "floor area ratio FAR number of floors",
    "height": "height limit of building",
    "parking": "parking space requirement",
    "fees": "fee for building permission",
    "permission_applicability": "building permission application",
    "general_rule_question": "building permission application residential",
}


@dataclass
class Citation:
    rule_number: str
    rule_title: str
    evidence_id: str
    page_start: int
    page_end: int
    page_exact: bool
    quote: str                  # exact substring of the stored rule text (never rewritten)
    truncated: bool
    verification_status: str
    table_like: bool = False


@dataclass
class ChannelAnswer:
    kind: str                   # answer | abstain | greeting | thanks | optout | optin | silent | empty | error | no_data | too_long | followup_ack
    language: str               # reply language: "hi" | "en"
    status: str | None = None   # the six-status answer policy value, when an answer was attempted
    intent: str | None = None
    citations: list[Citation] = field(default_factory=list)
    follow_up: str | None = None        # fact name being asked for (plot_area, road_width, ...)
    facts: list[dict[str, Any]] = field(default_factory=list)   # what the user told us (their own values)
    explanation: str | None = None      # optional validated LLM explanation, only if configured
    warnings: list[str] = field(default_factory=list)
    echo: str | None = None             # transcript of a voice note, shown back to the user
    assumed_unit: str | None = None
    direct: dict[str, Any] | None = None  # the stated answer (headline, lines, caveats) from the direct-answer layer


@dataclass
class AnswerContext:
    store: RuleStore | None
    retriever: Any | None
    llm: LLMProvider
    settings: Settings


def _norm(text: str) -> str:
    return re.sub(r"[^\wऀ-ॿ ]+", "", " ".join(text.lower().split())).strip()


def reset_stale_session(db: Session, conversation_id: str, ttl_hours: int) -> None:
    """Forget stored facts of a conversation that has been idle longer than the retention window."""
    conv = db.get(Conversation, conversation_id)
    if conv is None:
        return
    ts = conv.updated_at if conv.updated_at.tzinfo else conv.updated_at.replace(tzinfo=UTC)
    if datetime.now(UTC) - ts > timedelta(hours=ttl_hours):
        db.execute(delete(Conversation).where(Conversation.id == conversation_id))
        db.commit()


def _measurement_from_reply(text: str, fact: str) -> tuple[Measurement, str | None] | None:
    m = _BARE_MEASURE.match(text)
    if not m:
        return None
    value = m.group(1).replace(",", ".")
    unit_text = m.group(2).strip().rstrip(".")
    assumed = None
    if unit_text:
        try:
            unit = parse_unit_text(unit_text)
        except Exception:
            return None
    else:
        unit = DEFAULT_UNIT[fact]
        assumed = unit
    try:
        return Measurement(value=value, unit=unit), assumed
    except Exception:
        return None


def _citations(store: RuleStore, out: dict[str, Any], query_tokens: list[str], *, lookup: bool) -> list[Citation]:
    """Up to MAX_CITATIONS distinct rules. For each rule the quoted sentence is chosen across ALL its stored chunks."""
    cites: list[Citation] = []
    seen: set[str] = set()
    for ev in out["evidence"]:
        key = ev["rule_key"]
        if key in seen:
            continue
        seen.add(key)
        rec = store.by_key.get(key)
        chunk = passage = None
        if rec is not None and not ev["is_embedded_rule"]:
            if lookup:
                chunk = next((c for c in rec.chunks if c.evidence_id == ev["evidence_id"]), rec.chunks[0] if rec.chunks else None)
                if chunk is not None:
                    text = chunk.text
                    cut = text.rfind(". ", 0, LOOKUP_CHARS)
                    end = cut + 1 if cut > 200 else min(len(text), LOOKUP_CHARS)
                    passage = Passage(0, end, text[:end].rstrip(), end < len(text.rstrip()))
            else:
                found = best_passage_in_chunks(rec.chunks, lambda c: c.text, query_tokens, store.index.idf)
                if found:
                    chunk, passage = found
        if chunk is not None and passage is not None:
            cites.append(Citation(ev["rule_number"], ev["rule_title"], chunk.evidence_id, chunk.page_start, chunk.page_end,
                                  chunk.page_precision == "located_in_page_text", passage.text, passage.truncated,
                                  rec.verification_status, chunk.table_like))
        else:  # embedded rule, or nothing in the rule matched a query word: quote the start of the cited chunk, never a guess
            p = best_passage(ev["excerpt"], query_tokens, store.index.idf) or None
            quote = p.text if p else " ".join(ev["excerpt"].split())[:300]
            if p is None:
                quote = ev["excerpt"][:300].rsplit(" ", 1)[0]
            cites.append(Citation(ev["rule_number"], ev["rule_title"], ev["evidence_id"], ev["page_start"] or 0, ev["page_end"] or 0,
                                  ev["page_precision"] == "located_in_page_text", quote, False, ev["verification_status"],
                                  bool(ev["table_like"])))
        if len(cites) >= MAX_CITATIONS:
            break
    return cites


def _next_followup(intent: str, text: str, this_turn: list[dict[str, Any]], known: list[dict[str, Any]], contact: ChannelContact) -> str | None:
    """One question at a time, only for a question about a building on a plot, only for a fact we do not have yet, never nagging."""
    needs = NEEDS.get(intent)
    if not needs:
        return None
    if intent in ("general_rule_question", "permission_applicability"):
        has_area = any(f["name"] == "plot_area" for f in this_turn)
        if not (has_area or CONSTRUCTION_WORDS.search(text)):
            return None
    have = {f["name"] for f in known if f["validation_status"] == "valid"} | {f["name"] for f in this_turn if f["validation_status"] == "valid"}
    for fact in needs:
        if fact in have:
            continue
        if contact.pending_fact == fact:   # asked already and the user moved on: do not ask the same thing again
            continue
        return fact
    return None


def answer_text(db: Session, ctx: AnswerContext, contact: ChannelContact, conversation_id: str, text: str, *,
                owner: str, echo: str | None = None) -> ChannelAnswer:
    """Everything between 'a message arrived' and 'what to say'. Side effects: contact/conversation rows only."""
    cleaned = " ".join((text or "").split())
    lang_default = contact.language or "hi"
    if not cleaned:
        return ChannelAnswer("empty", lang_default, echo=echo)
    n = _norm(cleaned)

    if n in STOP_WORDS:
        contact.opted_out, contact.pending_fact = True, None
        return ChannelAnswer("optout", "hi" if re.search(r"[ऀ-ॿ]", cleaned) or n in {"band", "rukein", "roko"} else "en")
    if n in START_WORDS:
        contact.opted_out = False
        return ChannelAnswer("optin", lang_default)
    if contact.opted_out:
        return ChannelAnswer("silent", lang_default)
    if n in GREETINGS:
        return ChannelAnswer("greeting", lang_default, echo=echo)
    if n in THANKS:
        return ChannelAnswer("thanks", lang_default)
    if len(cleaned) > MAX_TEXT:
        return ChannelAnswer("too_long", lang_default)
    store = ctx.store
    if store is None or not store.records:
        return ChannelAnswer("no_data", lang_default)

    reset_stale_session(db, conversation_id, ctx.settings.channel_session_ttl_hours)
    detected = normalize_query(cleaned).language
    lang = "hi" if detected in ("hi", "hi-en") else ("hi" if (contact.language == "hi" and detected == "en" and len(cleaned.split()) <= 3) else "en")
    contact.language = lang

    question, context, assumed = cleaned, {}, None
    if contact.pending_fact:
        parsed = _measurement_from_reply(cleaned, contact.pending_fact)
        if parsed:
            meas, assumed = parsed
            context = {contact.pending_fact: meas}
            question = INTENT_QUERY.get(contact.last_intent or "", INTENT_QUERY["general_rule_question"])
            contact.pending_fact = None

    wants_explanation = ctx.settings.channels_use_llm_explanation and not isinstance(ctx.llm, NullProvider)
    req = AskRequest(question=question, conversation_id=conversation_id, context=context, explain=wants_explanation,
                     language="hi-en" if lang == "hi" and detected != "hi" else None)
    out = run_ask(db, req, store=store, amendments=load_amendment_dataclasses(db), principal=Principal(owner_id=owner),
                  llm=ctx.llm, settings=ctx.settings, retriever=ctx.retriever)

    nq = normalize_query(question, None, store.known_keys)
    abstain = out["status"] == "not_established" or not out["evidence"]
    cites = [] if abstain else _citations(store, out, nq.tokens, lookup=out["intent"] == "rule_lookup")
    # facts SHOWN and used to decide whether this is a building question come from THIS message only; facts remembered from earlier
    # turns are used solely so that we do not ask for the same thing twice
    this_turn = [f.to_dict() for f in extract_facts(question)]
    for name, meas in context.items():
        this_turn.append({"name": name, "value": meas.value, "unit": meas.unit, "source": "user_provided", "origin": "reply",
                          "validation_status": "valid", "confidence": "n/a", "note": None})
    facts = [f for f in this_turn if f["source"] == "user_provided" and f["validation_status"] in ("valid", "unverified")]
    follow = None if abstain else _next_followup(out["intent"], cleaned, this_turn, out["extracted_facts"], contact)
    if follow:
        contact.pending_fact = follow
    contact.last_intent = out["intent"]
    return ChannelAnswer("abstain" if abstain else "answer", lang, out["status"], out["intent"], cites, follow, facts,
                         out.get("explanation"), list(out.get("warnings", [])), echo, assumed, out.get("direct_answer"))
