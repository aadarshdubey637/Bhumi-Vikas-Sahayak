"""Projects and assessments: persistence, ownership checks, immutable snapshots."""
from __future__ import annotations

from typing import Any

from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from app.core.exceptions import NotFound
from app.core.security import Principal
from app.models import Assessment, AssessmentEvidence, Feedback, Project, ProjectInput, RuleChunk, RuleVersion
from app.services.assessment_service import run_assessment
from app.services.input_service import TEXT_INPUTS, normalize_inputs
from app.services.retrieval_service import RuleStore
from app.services.version_service import Amendment


# ---- authorization ------------------------------------------------------------------------------
def _allowed(resource_owner: str | None, principal: Principal) -> bool:
    """With auth disabled everything is accessible; with auth enabled only the owner's rows are. Rows with
    no owner (created while auth was off) are inaccessible once auth is on."""
    if principal.guest:
        return False
    return principal.owner_id is None or resource_owner == principal.owner_id


def get_project(db: Session, project_id: str, principal: Principal) -> Project:
    p = db.scalar(select(Project).where(Project.id == project_id).options(selectinload(Project.inputs)))
    if p is None or not _allowed(p.owner_id, principal):
        raise NotFound("project not found")  # 404, not 403: do not reveal that another user's project exists
    return p


def get_assessment(db: Session, assessment_id: str, principal: Principal) -> Assessment:
    a = db.get(Assessment, assessment_id)
    if a is None or not _allowed(a.owner_id, principal):
        raise NotFound("assessment not found")
    return a


# ---- projects ---------------------------------------------------------------------------------
def _set_inputs(project: Project, inputs: dict[str, Any]) -> None:
    existing = {i.name: i for i in project.inputs}
    for name, v in inputs.items():
        value, unit = (v["value"], v["unit"]) if isinstance(v, dict) else (v, None)
        if name in existing:
            existing[name].value, existing[name].unit = value, unit
            existing[name].input_source, existing[name].verification_status = "user_provided", "unverified"
        else:
            project.inputs.append(ProjectInput(name=name, value=value, unit=unit))
    if "building_use" in inputs:
        project.building_use = inputs["building_use"]


def create_project(db: Session, principal: Principal, name: str, building_use: str | None, jurisdiction: str,
                   raw_inputs: dict[str, Any]) -> Project:
    inputs = normalize_inputs(raw_inputs)
    if building_use and "building_use" not in inputs:
        inputs.update(normalize_inputs({"building_use": building_use}))
    p = Project(owner_id=principal.owner_id, name=name, building_use=inputs.get("building_use"), jurisdiction=jurisdiction)
    _set_inputs(p, inputs)
    db.add(p)
    db.commit()
    return p


def update_project(db: Session, p: Project, name: str | None, building_use: str | None, status: str | None,
                   raw_inputs: dict[str, Any] | None) -> Project:
    if name is not None:
        p.name = name
    if status is not None:
        p.status = status
    inputs = normalize_inputs(raw_inputs or {})
    if building_use is not None:
        inputs.update(normalize_inputs({"building_use": building_use}))
    _set_inputs(p, inputs)
    db.commit()
    return p


def list_projects(db: Session, principal: Principal, limit: int, offset: int) -> tuple[list[Project], int]:
    q = select(Project).options(selectinload(Project.inputs))
    cq = select(func.count()).select_from(Project)
    if principal.owner_id is not None:
        q, cq = q.where(Project.owner_id == principal.owner_id), cq.where(Project.owner_id == principal.owner_id)
    rows = db.scalars(q.order_by(Project.created_at.desc(), Project.id).limit(limit).offset(offset)).all()
    return list(rows), db.scalar(cq) or 0


def project_inputs_as_internal(p: Project) -> dict[str, Any]:
    out: dict[str, Any] = {}
    for i in p.inputs:
        out[i.name] = i.value if (i.name in TEXT_INPUTS or i.unit is None) else {"value": i.value, "unit": i.unit}
    if p.building_use and "building_use" not in out:
        out["building_use"] = p.building_use
    return out


# ---- assessments -------------------------------------------------------------------------------
def create_assessment(db: Session, principal: Principal, store: RuleStore | None, amendments: list[Amendment],
                      raw_inputs: dict[str, Any], project_id: str | None, as_of: str | None) -> Assessment:
    base: dict[str, Any] = {}
    if project_id:
        base = project_inputs_as_internal(get_project(db, project_id, principal))
    inputs = {**base, **normalize_inputs(raw_inputs)}
    result = run_assessment(store, inputs, amendments)
    result["input_snapshot"] = inputs

    # evidence: store the exact rule text shown, linked to real stored chunks; role is context, never "applied"
    related = list(dict.fromkeys(e for c in result["checks"] for e in c["related_evidence_ids"]))
    rows = db.execute(
        select(RuleChunk, RuleVersion).join(RuleVersion, RuleChunk.rule_version_id == RuleVersion.id)
        .where(RuleChunk.evidence_id.in_(related))).all() if related else []
    by_eid = {c.evidence_id: (c, v) for c, v in rows}
    unresolved = [e for e in related if e not in by_eid]
    if unresolved:
        result["warnings"].append(f"{len(unresolved)} related evidence id(s) could not be resolved to stored records and were omitted.")
    snapshot: dict[str, dict[str, str]] = {}
    a = Assessment(
        project_id=project_id, owner_id=principal.owner_id, status=result["overall_status"], summary=result["summary"],
        input_snapshot=inputs, calculation_results={"checks": result["checks"]}, assumptions=result["assumptions"],
        missing_information=result["missing_information"], warnings=result["warnings"], as_of=as_of)
    for eid in related:
        if eid in by_eid:
            c, v = by_eid[eid]
            pg = f"{c.page_start}" if c.page_start == c.page_end else f"{c.page_start}-{c.page_end}"
            a.evidence.append(AssessmentEvidence(
                chunk_id=c.id, evidence_id=eid, rule_version_id=v.id, source_document_id=v.source_document_id,
                page_reference=pg, evidence_text=c.text, evidence_role="related_context",
                verification_status=v.verification_status))
            snapshot[v.version_key] = {"version_key": v.version_key, "content_hash": v.content_hash,
                                       "verification_status": v.verification_status}
    a.rule_version_snapshot = list(snapshot.values())
    db.add(a)
    db.commit()
    return a


def list_assessments(db: Session, principal: Principal, project_id: str | None, limit: int, offset: int):
    q, cq = select(Assessment), select(func.count()).select_from(Assessment)
    if principal.owner_id is not None:
        q, cq = q.where(Assessment.owner_id == principal.owner_id), cq.where(Assessment.owner_id == principal.owner_id)
    if project_id:
        q, cq = q.where(Assessment.project_id == project_id), cq.where(Assessment.project_id == project_id)
    rows = db.scalars(q.order_by(Assessment.created_at.desc(), Assessment.id).limit(limit).offset(offset)).all()
    return list(rows), db.scalar(cq) or 0


def create_feedback(db: Session, principal: Principal, category: str, message: str, assessment_id: str | None,
                    evidence_id: str | None) -> Feedback:
    if assessment_id:
        get_assessment(db, assessment_id, principal)  # ownership check; 404 otherwise
    if evidence_id and db.scalar(select(RuleChunk.id).where(RuleChunk.evidence_id == evidence_id)) is None:
        raise NotFound("evidence_id does not resolve to a stored record")
    f = Feedback(owner_id=principal.owner_id, assessment_id=assessment_id, category=category, message=message, evidence_id=evidence_id)
    db.add(f)
    db.commit()
    return f
