from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select

from app.api.deps import DB, Auth, get_principal, require_user
from app.models import Feedback
from app.repositories import project_repository as repo
from app.schemas.api import FeedbackCreate, FeedbackOut, FeedbackPage

router = APIRouter(tags=["feedback"], dependencies=[Depends(get_principal)])


def _out(f: Feedback) -> FeedbackOut:
    return FeedbackOut(id=f.id, assessment_id=f.assessment_id, evidence_id=f.evidence_id, category=f.category,  # type: ignore[arg-type]
                       resolution_status=f.resolution_status, created_at=f.created_at)  # type: ignore[arg-type]


@router.post("/feedback", response_model=FeedbackOut, status_code=201)
def create_feedback(body: FeedbackCreate, db: DB, principal: Auth) -> FeedbackOut:
    return _out(repo.create_feedback(db, principal, body.category, body.message, body.assessment_id, body.evidence_id))


@router.get("/feedback", response_model=FeedbackPage, summary="List the caller's feedback", dependencies=[Depends(require_user)])
def list_feedback(db: DB, principal: Auth, limit: Annotated[int, Query(ge=1, le=100)] = 20,
                  offset: Annotated[int, Query(ge=0, le=100_000)] = 0) -> FeedbackPage:
    q, cq = select(Feedback), select(func.count()).select_from(Feedback)
    if principal.owner_id is not None:
        q, cq = q.where(Feedback.owner_id == principal.owner_id), cq.where(Feedback.owner_id == principal.owner_id)
    rows = db.scalars(q.order_by(Feedback.created_at.desc(), Feedback.id).limit(limit).offset(offset)).all()
    return FeedbackPage(items=[_out(f) for f in rows], total=db.scalar(cq) or 0, limit=limit, offset=offset)
