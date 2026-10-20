from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Query, Response

from app.api import mappers
from app.api.deps import DB, Auth, require_user
from app.repositories import project_repository as repo
from app.schemas.api import AssessmentPage, ProjectCreate, ProjectOut, ProjectPage, ProjectUpdate

router = APIRouter(tags=["projects"], dependencies=[Depends(require_user)])
Limit = Annotated[int, Query(ge=1, le=100)]
Offset = Annotated[int, Query(ge=0, le=100_000)]


@router.post("/projects", response_model=ProjectOut, status_code=201)
def create_project(body: ProjectCreate, db: DB, principal: Auth, response: Response) -> ProjectOut:
    p = repo.create_project(db, principal, body.name, body.building_use, body.jurisdiction,
                            {k: (v.model_dump() if hasattr(v, "model_dump") else v) for k, v in body.inputs.items()})
    response.headers["Location"] = f"/api/v1/projects/{p.id}"
    return mappers.project_out(p)


@router.get("/projects", response_model=ProjectPage, summary="List the caller's projects")
def list_projects(db: DB, principal: Auth, limit: Limit = 20, offset: Offset = 0) -> ProjectPage:
    rows, total = repo.list_projects(db, principal, limit, offset)
    return ProjectPage(items=[mappers.project_out(p) for p in rows], total=total, limit=limit, offset=offset)


@router.get("/projects/{project_id}", response_model=ProjectOut)
def get_project(project_id: str, db: DB, principal: Auth) -> ProjectOut:
    return mappers.project_out(repo.get_project(db, project_id, principal))


@router.patch("/projects/{project_id}", response_model=ProjectOut, summary="Update fields; supplied inputs are upserted by name")
def patch_project(project_id: str, body: ProjectUpdate, db: DB, principal: Auth) -> ProjectOut:
    p = repo.get_project(db, project_id, principal)
    p = repo.update_project(db, p, body.name, body.building_use, body.status,
                            {k: (v.model_dump() if hasattr(v, "model_dump") else v) for k, v in (body.inputs or {}).items()})
    return mappers.project_out(p)


@router.get("/projects/{project_id}/assessments", response_model=AssessmentPage, summary="Assessment history for a project")
def project_assessments(project_id: str, db: DB, principal: Auth, limit: Limit = 20, offset: Offset = 0) -> AssessmentPage:
    repo.get_project(db, project_id, principal)  # ownership check
    rows, total = repo.list_assessments(db, principal, project_id, limit, offset)
    return AssessmentPage(items=[mappers.assessment_out(a) for a in rows], total=total, limit=limit, offset=offset)
