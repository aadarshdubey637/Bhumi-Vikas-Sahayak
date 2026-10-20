from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.api import mappers
from app.api.deps import DB, Store, get_principal, get_retriever
from app.core.exceptions import NotFound, ValidationFailed
from app.models import RuleChunk, RuleVersion, SourceDocument
from app.repositories import rule_repository as repo
from app.rules.normalization import RuleRef, parse_rule_ref
from app.schemas.api import (
    AmendmentAffects,
    AmendmentOut,
    AmendmentsResponse,
    DocumentsResponse,
    Evidence,
    RuleSearchRequest,
    RuleSearchResponse,
    RuleSummary,
    RuleVersionsResponse,
    VersionResolution,
)
from app.services.hybrid_retrieval_service import HybridRetriever
from app.services.version_service import resolve_version

router = APIRouter(tags=["rules"], dependencies=[Depends(get_principal)])
AsOf = Annotated[str | None, Query(pattern=r"^\d{4}-\d{2}-\d{2}$", description="ISO date for version resolution")]


def _resolution(db, rule, as_of: str | None) -> VersionResolution:
    versions = db.scalars(select(RuleVersion).where(RuleVersion.rule_id == rule.id, RuleVersion.version_status == "active")
                          .options(selectinload(RuleVersion.source_document))).all()
    consolidated = max((v.source_document.consolidation_date for v in versions if v.source_document.consolidation_date), default=None)
    res = resolve_version(
        RuleRef(base=rule.stable_rule_id), [{"version_id": v.version_key, "verification_status": v.verification_status,
                                            "effective_from": mappers.iso(v.effective_from), "effective_until": mappers.iso(v.effective_until)}
                                           for v in versions],
        repo.load_amendment_dataclasses(db), as_of, consolidated.isoformat() if consolidated else None)
    return VersionResolution.model_validate(res.to_dict())


@router.post("/rules/search", response_model=RuleSearchResponse, summary="Search rule text (exact rule number and BM25)")
def search_rules(req: RuleSearchRequest, store: Store, retriever: Annotated[HybridRetriever | None, Depends(get_retriever)]) -> RuleSearchResponse:
    if not req.query and not req.rule_number:
        raise ValidationFailed("provide 'query' and/or 'rule_number'")
    if store is None:
        return RuleSearchResponse(items=[], total=0, limit=req.limit, offset=req.offset,
                                  note="No rules have been ingested yet. Run: python -m scripts.ingest_jsonl --load-db --migrate")
    note = None
    if req.rule_number:
        ref = parse_rule_ref(req.rule_number, known_keys=store.known_keys)
        if ref is None:
            raise ValidationFailed(f"unrecognised rule number {req.rule_number!r}")
        if not req.query or ref.key in store.embedded:
            items = store.lookup(ref, max_chunks=50)
            if req.verification_status:
                items = [i for i in items if i.verification_status == req.verification_status]
            if req.document_key:
                items = [i for i in items if i.source_document_id == req.document_key]
            if not items:
                note = f"Rule {ref.display} was not found in the ingested corpus; no related text was substituted."
            return RuleSearchResponse(items=[Evidence.model_validate(i.to_dict()) for i in items[req.offset: req.offset + req.limit]],
                                      total=len(items), limit=req.limit, offset=req.offset, note=note)
        rule_keys = {ref.key}
    else:
        rule_keys = None
    if req.document_key:
        in_doc = {r.rule_key for r in store.records if r.source_document_id == req.document_key}
        rule_keys = in_doc if rule_keys is None else rule_keys & in_doc
        if not rule_keys:
            return RuleSearchResponse(items=[], total=0, limit=req.limit, offset=req.offset,
                                      note=f"No rules found for document {req.document_key!r}.")
    res = (retriever or store).search(req.query, top_k=req.limit, offset=req.offset, language=req.language, rule_keys=rule_keys,
                                      part=req.part, verification_status=req.verification_status)
    if not res.items:
        note = "No matching rule text found; the corpus does not establish an answer."
    return RuleSearchResponse(items=[Evidence.model_validate(i.to_dict()) for i in res.items], total=res.total,
                              limit=req.limit, offset=req.offset, note=note)


@router.get("/rules/{rule_id}", response_model=RuleSummary, summary="Stable rule identity with versions and linked amendments")
def get_rule(rule_id: str, db: DB, as_of: AsOf = None) -> RuleSummary:
    rule = repo.resolve_rule(db, rule_id)
    if rule is None:
        raise NotFound(f"rule {rule_id!r} not found in the ingested corpus")
    if rule.parent_rule_id:
        parent = db.get(type(rule), rule.parent_rule_id)
        vers = db.scalars(select(RuleVersion).where(RuleVersion.rule_id == parent.id).options(
            selectinload(RuleVersion.source_document), selectinload(RuleVersion.rule))).all()
        return RuleSummary(rule_key=rule.stable_rule_id, official_rule_id=rule.official_rule_number, title=rule.title,
                           part=rule.part or "", versions=[], embedded_in=parent.official_rule_number,
                           version_resolution=_resolution(db, parent, as_of))
    vers = db.scalars(select(RuleVersion).where(RuleVersion.rule_id == rule.id).options(
        selectinload(RuleVersion.source_document), selectinload(RuleVersion.rule)).order_by(RuleVersion.id)).all()
    res = _resolution(db, rule, as_of)
    return RuleSummary(rule_key=rule.stable_rule_id, official_rule_id=rule.official_rule_number, title=rule.title,
                       part=rule.part or "", versions=[mappers.version_summary(v) for v in vers],
                       linked_amendments=res.linked_amendments, version_resolution=res)


@router.get("/rules/{rule_id}/versions", response_model=RuleVersionsResponse, summary="Version history with source metadata")
def get_rule_versions(rule_id: str, db: DB, as_of: AsOf = None) -> RuleVersionsResponse:
    rule = repo.resolve_rule(db, rule_id)
    if rule is None:
        raise NotFound(f"rule {rule_id!r} not found in the ingested corpus")
    target = db.get(type(rule), rule.parent_rule_id) if rule.parent_rule_id else rule
    vers = db.scalars(select(RuleVersion).where(RuleVersion.rule_id == target.id).options(
        selectinload(RuleVersion.source_document), selectinload(RuleVersion.rule)).order_by(RuleVersion.id)).all()
    return RuleVersionsResponse(rule_key=rule.stable_rule_id, items=[mappers.version_detail(v) for v in vers],
                                version_resolution=_resolution(db, target, as_of))


@router.get("/evidence/{evidence_id}", response_model=Evidence, summary="Resolve a citation to the stored source text")
def get_evidence(evidence_id: str, db: DB, store: Store) -> Evidence:
    row = db.execute(select(RuleChunk, RuleVersion).join(RuleVersion, RuleChunk.rule_version_id == RuleVersion.id)
                     .where(RuleChunk.evidence_id == evidence_id).options(selectinload(RuleVersion.rule),
                                                                            selectinload(RuleVersion.source_document))).first()
    if row:
        return mappers.chunk_evidence(*row)
    if store is not None:  # inserted rules embedded in a parent record have synthetic evidence ids
        for key in store.embedded:
            for it in store.lookup(RuleRef(base=key), 1):
                if it.evidence_id == evidence_id:
                    return Evidence.model_validate(it.to_dict())
    raise NotFound("evidence id does not resolve to a stored record")


@router.get("/amendments", response_model=AmendmentsResponse, summary="Stored amendment register (verification status as recorded)")
def list_amendments(db: DB) -> AmendmentsResponse:
    items = [AmendmentOut(
        amendment_id=a.amendment_id, title=a.title, verification_status=a.verification_status, publication_date=a.publication_date,
        effective_date=a.effective_date, stated_date=a.stated_date, source_url=a.source_url, summary=a.summary,
        affects=[AmendmentAffects(rule=x["rule"], clause_path="/".join(x["path"]), relationship=x["relationship"],
                                  verification_status=a.verification_status) for x in a.affects])
        for a in repo.load_amendment_dataclasses(db)]
    return AmendmentsResponse(items=items, note="Only amendments present in the stored register are listed. Nothing here has been checked "
                                                 "against an official gazette unless its status says verified; dates are shown as recorded.")


@router.get("/documents", response_model=DocumentsResponse, summary="Registered source documents")
def list_documents(db: DB) -> DocumentsResponse:
    return DocumentsResponse(items=[mappers.document_out(d) for d in db.scalars(select(SourceDocument).order_by(SourceDocument.id))])
