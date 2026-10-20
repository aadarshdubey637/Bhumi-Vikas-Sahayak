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
from app.rag.prompts import SYSTEM_PROMPT, build_user_prompt
from app.repositories import project_repository as projects
from app.schemas.api import AskRequest
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
    if req.explain and isinstance(llm, NullProvider):
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
    out["explanation"], out["explanation_citations"] = None, []

    if req.explain and result.evidence and result.status != "not_established":
        _explain(out, req, llm, settings)
    return out


def _explain(out: dict[str, Any], req: AskRequest, llm: LLMProvider, settings: Settings) -> None:
    """Best-effort: any failure leaves the deterministic answer intact and adds a warning."""
    try:
        raw = llm.complete(SYSTEM_PROMPT, build_user_prompt(req.question, out["language"], out["evidence"], out["extracted_facts"]),
                           settings.llm_max_output_tokens)
        expl = parse_explanation(raw)
        evidence = [EvidenceItem(**e) for e in out["evidence"]]
        user_vals = [str(f["value"]) for f in out["extracted_facts"]] + [req.question]
        calc_vals = [str(c.get("final_value")) for c in out["calculations"]]
        problems = validate_explanation(expl, evidence, user_vals, calc_vals)
    except LLMUnavailable as e:
        out["warnings"].append(f"LLM explanation unavailable: {e}")
        return
    if problems:
        log.warning("llm explanation rejected", extra={"event": "llm_rejected"})
        out["warnings"].append("LLM explanation was rejected by validation and omitted: " + "; ".join(problems))
        return
    out["explanation"], out["explanation_citations"] = expl.summary, expl.cited_evidence_ids
    out["warnings"].extend(expl.caveats)


