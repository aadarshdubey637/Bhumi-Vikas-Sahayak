from __future__ import annotations

from types import SimpleNamespace

from fastapi import APIRouter, Depends, Response
from sqlalchemy import select

from app.api import mappers
from app.api.deps import DB, Auth, Store, require_user
from app.models import AssessmentEvidence, RuleVersion, SourceDocument
from app.repositories import project_repository as repo
from app.repositories.rule_repository import load_amendment_dataclasses
from app.schemas.api import AssessmentCreate, AssessmentEvidenceList, AssessmentOut

router = APIRouter(tags=["assessments"], dependencies=[Depends(require_user)])


def evidence_rows(db, assessment_id: str):
    """Evidence joined with its rule version and source document (labels resolved from stored rows)."""
    q = (select(AssessmentEvidence, RuleVersion, SourceDocument)
         .join(RuleVersion, AssessmentEvidence.rule_version_id == RuleVersion.id)
         .join(SourceDocument, AssessmentEvidence.source_document_id == SourceDocument.id)
         .where(AssessmentEvidence.assessment_id == assessment_id).order_by(AssessmentEvidence.id))
    out = []
    for e, v, d in db.execute(q):
        out.append(SimpleNamespace(
            evidence_id=e.evidence_id, rule_number=v.rule.official_rule_number, rule_version_key=v.version_key,
            source_document_key=d.doc_key, page_reference=e.page_reference, evidence_text=e.evidence_text,
            evidence_role=e.evidence_role, verification_status=e.verification_status))
    return out


@router.post("/assessments", response_model=AssessmentOut, status_code=201,
             summary="Create an immutable preliminary assessment (never a compliance verdict)")
def create_assessment(body: AssessmentCreate, db: DB, principal: Auth, store: Store, response: Response) -> AssessmentOut:
    a = repo.create_assessment(db, principal, store, load_amendment_dataclasses(db),
                               {k: (v.model_dump() if hasattr(v, "model_dump") else v) for k, v in body.inputs.items()},
                               body.project_id, body.as_of)
    response.headers["Location"] = f"/api/v1/assessments/{a.id}"
    return mappers.assessment_out(a)


@router.get("/assessments/{assessment_id}", response_model=AssessmentOut)
def get_assessment(assessment_id: str, db: DB, principal: Auth) -> AssessmentOut:
    return mappers.assessment_out(repo.get_assessment(db, assessment_id, principal))


@router.get("/assessments/{assessment_id}/evidence", response_model=AssessmentEvidenceList,
            summary="Rule text stored with the assessment (as it was when the assessment was made)")
def get_assessment_evidence(assessment_id: str, db: DB, principal: Auth) -> AssessmentEvidenceList:
    a = repo.get_assessment(db, assessment_id, principal)
    return AssessmentEvidenceList(assessment_id=a.id, items=mappers.evidence_out(evidence_rows(db, a.id)))
