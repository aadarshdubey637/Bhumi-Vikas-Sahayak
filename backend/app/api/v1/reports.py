from __future__ import annotations

from fastapi import APIRouter, Depends

from app.api import mappers
from app.api.deps import DB, Auth, require_user
from app.api.v1.assessments import evidence_rows
from app.core.exceptions import NotFound
from app.repositories import project_repository as repo
from app.schemas.api import ReportOut
from app.services.report_service import build_report

router = APIRouter(tags=["reports"], dependencies=[Depends(require_user)])


@router.post("/assessments/{assessment_id}/report", response_model=ReportOut, status_code=201,
             summary="Generate (or regenerate) the JSON report from the saved assessment snapshot")
def create_report(assessment_id: str, db: DB, principal: Auth) -> ReportOut:
    a = repo.get_assessment(db, assessment_id, principal)
    report = build_report({
        "id": a.id, "created_at": a.created_at.isoformat(), "status": a.status, "summary": a.summary,
        "input_snapshot": a.input_snapshot, "calculation_results": a.calculation_results,
        "evidence": [e.model_dump() for e in mappers.evidence_out(evidence_rows(db, a.id))],
        "assumptions": a.assumptions, "missing_information": a.missing_information, "warnings": a.warnings,
        "rule_version_snapshot": a.rule_version_snapshot})
    a.report = report
    db.commit()
    return ReportOut.model_validate(report)


@router.get("/assessments/{assessment_id}/report", response_model=ReportOut)
def get_report(assessment_id: str, db: DB, principal: Auth) -> ReportOut:
    a = repo.get_assessment(db, assessment_id, principal)
    if not a.report:
        raise NotFound("no report has been generated for this assessment; POST to create one")
    return ReportOut.model_validate(a.report)
