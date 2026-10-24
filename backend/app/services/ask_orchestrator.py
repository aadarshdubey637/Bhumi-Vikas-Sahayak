"""/ask orchestration around the pure ``question_service.ask`` workflow:
project + conversation context merging, persistence of confirmed facts, and the optional,
validated LLM explanation. Deterministic behaviour never depends on the LLM."""
from __future__ import annotations

import logging
import uuid
from typing import Any

from sqlalchemy.orm import Session

from app.core.config import Settings
from app.core.exceptions import NotFound, ServiceUnavailable
from app.core.security import Principal
from app.models import Conversation
from app.rag.prompts import GENERAL_SYSTEM_PROMPT, GROUNDED_SYSTEM_PROMPT, build_user_prompt
from app.repositories import project_repository as projects
from app.schemas.api import AskRequest
from app.services.evidence_service import _NUM
from app.services.input_service import INPUT_DIMENSIONS, TEXT_INPUTS, normalize_inputs, to_context
from app.services.llm_service import LLMProvider, LLMUnavailable, NullProvider, parse_explanation, validate_explanation
from app.services.question_service import ask
from app.services.retrieval_service import EvidenceItem, RuleStore
from app.services.version_service import Amendment

log = logging.getLogger(__name__)
PERSISTED_FACTS = set(INPUT_DIMENSIONS) | set(TEXT_INPUTS)


def _load_conversation(db: Session, conv_id: str, principal: Principal) -> Conversation | None:
    conv = db.get(Conversation, conv_id)
    if conv is not None and (
        (principal.guest and conv.owner_id is not None) or (principal.owner_id is not None and conv.owner_id != principal.owner_id)
    ):
        raise NotFound("conversation not found")
    return conv


def run_ask(db: Session, req: AskRequest, *, store: RuleStore | None, amendments: list[Amendment], principal: Principal,
            llm: LLMProvider, settings: Settings, retriever: Any | None = None) -> dict[str, Any]:
    if (req.explain or req.attachments) and isinstance(llm, NullProvider):
        raise ServiceUnavailable("LLM explanations are not configured on this server; retry with explain=false "
                                 "(the deterministic, evidence-cited answer does not need an LLM)", code="llm_unavailable")
    context: dict[str, Any] = {}
    if req.project_id:  # lowest priority
        context.update(to_context(projects.project_inputs_as_internal(projects.get_project(db, req.project_id, principal))))
    conv = _load_conversation(db, req.conversation_id, principal) if req.conversation_id else None
    if conv:
        context.update(conv.facts or {})
    context.update(to_context(normalize_inputs({k: (v.model_dump() if hasattr(v, "model_dump") else v)
                                                for k, v in req.context.items()})))  # strict; highest priority

    result = ask(store, amendments, req.question, req.language, context=context, as_of=req.as_of, retriever=retriever)
    prev_user = next((m.text for m in reversed(req.history) if m.role == "user"), None)
    if prev_user and (not result.evidence or result.status == "not_established"):
        # a short follow-up ("and for 12 m road?") has no rule keywords of its own: search again together with the earlier question
        again = ask(store, amendments, f"{prev_user} {req.question}", req.language, context=context, as_of=req.as_of, retriever=retriever)
        if again.evidence and again.status != "not_established":
            result = again
    out = result.to_dict()

    # carry user-stated, valid facts forward so a follow-up answer re-evaluates with them
    new_facts = {f["name"]: ({"value": f["value"], "unit": f["unit"]} if f["unit"] else f["value"])
                 for f in out["extracted_facts"]
                 if f["name"] in PERSISTED_FACTS and f["validation_status"] in ("valid", "unverified")
                 and f["source"] == "user_provided"}
    conv_id = req.conversation_id
    if new_facts or conv:
        if conv is None:
            conv_id = conv_id or uuid.uuid4().hex
            conv = Conversation(id=conv_id, owner_id=principal.owner_id, facts={})
            db.add(conv)
        conv.facts = {**(conv.facts or {}), **new_facts}
        conv.last_intent = result.intent
        db.commit()
    out["conversation_id"] = conv_id if conv else None
    out["explanation"], out["explanation_citations"], out["explanation_kind"] = None, [], None

    if req.explain or req.attachments:
        # grounded: explain the cited rule text. general: nothing usable was found, so still reply helpfully but with
        # figure-free guidance (validated to contain no numbers or rule references) instead of a bare "not found".
        _explain(out, req, llm, settings, grounded=bool(result.evidence) and result.status != "not_established")
    return out


def _retry_note(problems: list[str]) -> str:
    bullets = "\n".join(f"- {p}" for p in problems)
    return (f"\n<previous_attempt_rejected>\n{bullets}\nWrite the answer again and fix these problems. Do not mention evidence ids "
            "or numbers that are not in the evidence.\n</previous_attempt_rejected>")


def _explain(out: dict[str, Any], req: AskRequest, llm: LLMProvider, settings: Settings, *, grounded: bool = True) -> None:
    """Best-effort: any failure leaves the deterministic answer intact and adds a warning.

    A reply that fails validation is retried once with the problems fed back to the model."""
    evidence_dicts = out["evidence"] if grounded else []
    hints = [out["follow_up_question"]] if out.get("follow_up_question") else None
    system = GROUNDED_SYSTEM_PROMPT if grounded else GENERAL_SYSTEM_PROMPT
    history = [{"role": m.role, "text": m.text} for m in req.history]
    prompt = build_user_prompt(req.question, out["language"], evidence_dicts, out["extracted_facts"], hints=hints, history=history,
                               attachment_names=[a.name for a in req.attachments] or None)
    evidence = [EvidenceItem(**e) for e in evidence_dicts]
    user_vals = [str(f["value"]) for f in out["extracted_facts"]] + [req.question] + _NUM.findall(req.question) + _NUM.findall(" ".join(m.text for m in req.history))
    calc_vals = [str(c.get("final_value")) for c in out["calculations"]]
    problems: list[str] = []
    expl = None
    for _ in range(2):
        try:
            retry_note = _retry_note(problems) if problems else ""
            extra = {"attachments": [{"mime": a.mime, "data": a.data} for a in req.attachments]} if req.attachments else {}
            raw = llm.complete(system, prompt + retry_note, settings.llm_max_output_tokens, **extra)
            expl = parse_explanation(raw)
            problems = validate_explanation(expl, evidence, user_vals, calc_vals, require_citations=grounded, allow_rule_refs=False,
                                           check_numbers=not req.attachments)
        except LLMUnavailable as e:
            out["warnings"].append(f"LLM explanation unavailable: {e}")
            return
        if not problems:
            break
    if problems or expl is None:
        log.warning("llm explanation rejected", extra={"event": "llm_rejected"})
        out["warnings"].append("LLM explanation was rejected by validation and omitted: " + "; ".join(problems))
        return
    out["explanation"], out["explanation_citations"] = expl.summary, expl.cited_evidence_ids
    out["explanation_kind"] = "grounded" if grounded else "general"
    out["warnings"].extend(expl.caveats)
