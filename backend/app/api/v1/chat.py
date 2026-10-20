from __future__ import annotations

from fastapi import APIRouter, Request

from app.api.deps import DB, Auth, Cfg, Store, get_llm, get_retriever
from app.repositories.rule_repository import load_amendment_dataclasses
from app.schemas.api import AskRequest, AskResponse
from app.services.ask_orchestrator import run_ask

router = APIRouter(tags=["ask"])


@router.post("/ask", response_model=AskResponse, summary="Ask a building-rules question (evidence-first)")
def ask_endpoint(req: AskRequest, request: Request, db: DB, principal: Auth, store: Store, settings: Cfg) -> AskResponse:
    """Always returns one of six explicit statuses. The answer is a pointer to cited rule text, never a compliance
    verdict. Exact rule lookup, retrieval and calculations need no LLM; ``explain=true`` optionally adds a validated explanation."""
    if len(req.question) > settings.max_question_chars:
        from app.core.exceptions import ValidationFailed
        raise ValidationFailed(f"question exceeds {settings.max_question_chars} characters")
    out = run_ask(db, req, store=store, amendments=load_amendment_dataclasses(db), principal=principal,
                  llm=get_llm(request), settings=settings, retriever=get_retriever(request))
    return AskResponse.model_validate(out)
