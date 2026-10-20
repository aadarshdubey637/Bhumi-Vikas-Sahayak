"""DB rows / core dataclasses -> API schemas. Routers never return ORM objects."""
from __future__ import annotations

from typing import Any

from app.models import Assessment, Project, RuleChunk, RuleVersion, SourceDocument
from app.schemas.api import (
    AssessmentCheck,
    AssessmentEvidenceOut,
    AssessmentOut,
    Evidence,
    ProjectInputOut,
    ProjectOut,
    RuleVersionDetail,
    RuleVersionSummary,
    SourceDocumentOut,
)


def iso(d: Any) -> str | None:
    return d.isoformat() if d else None


def project_out(p: Project) -> ProjectOut:
    inputs: dict[str, Any] = {}
    for i in p.inputs:
        inputs[i.name] = i.value if i.unit is None else {"value": i.value, "unit": i.unit}
    return ProjectOut(
        id=p.id, name=p.name, building_use=p.building_use, jurisdiction=p.jurisdiction, status=p.status, inputs=inputs,
        input_details=[ProjectInputOut(name=i.name, value=i.value, unit=i.unit, input_source=i.input_source,
                                       verification_status=i.verification_status) for i in p.inputs],
        created_at=p.created_at, updated_at=p.updated_at)


def assessment_out(a: Assessment) -> AssessmentOut:
    return AssessmentOut(
        id=a.id, project_id=a.project_id, overall_status=a.status, summary=a.summary,  # type: ignore[arg-type]
        checks=[AssessmentCheck.model_validate(c) for c in a.calculation_results.get("checks", [])],
        assumptions=a.assumptions, missing_information=a.missing_information, warnings=a.warnings,
        input_snapshot=a.input_snapshot, created_at=a.created_at)


def evidence_out(db_rows: list[Any]) -> list[AssessmentEvidenceOut]:
    out = []
    for e in db_rows:
        out.append(AssessmentEvidenceOut(
            evidence_id=e.evidence_id, rule_number=e.rule_number, rule_version_id=e.rule_version_key,
            source_document_id=e.source_document_key, page_reference=e.page_reference, evidence_text=e.evidence_text,
            evidence_role=e.evidence_role, verification_status=e.verification_status))
    return out


def document_out(d: SourceDocument) -> SourceDocumentOut:
    return SourceDocumentOut(
        document_key=d.doc_key, title=d.title, document_type=d.document_type, language=d.language, jurisdiction=d.jurisdiction,
        source_url=d.source_url, publication_date=iso(d.publication_date), effective_date=iso(d.effective_date),
        consolidation_date=iso(d.consolidation_date), document_version=d.document_version, file_hash=d.file_hash,
        page_count=d.page_count, verification_status=d.verification_status, notes=d.notes)  # type: ignore[arg-type]


def version_summary(v: RuleVersion) -> RuleVersionSummary:
    return RuleVersionSummary(
        version_id=v.version_key, version_status=v.version_status,  # type: ignore[arg-type]
        source_document_id=v.source_document.doc_key, language=v.language, page_start=v.source_page_start or 0,
        page_end=v.source_page_end or 0, verification_status=v.verification_status,  # type: ignore[arg-type]
        effective_from=iso(v.effective_from), effective_until=iso(v.effective_until), content_hash=v.content_hash)


def version_detail(v: RuleVersion) -> RuleVersionDetail:
    return RuleVersionDetail(
        **version_summary(v).model_dump(), rule_key=v.rule.stable_rule_id, official_rule_id=v.rule.official_rule_number,
        original_text=v.original_text, source_document=document_out(v.source_document), flags=list(v.flags or []),
        reviewer_notes=v.reviewer_notes)


def chunk_evidence(c: RuleChunk, v: RuleVersion) -> Evidence:
    return Evidence(
        evidence_id=c.evidence_id, rule_key=v.rule.stable_rule_id, rule_number=v.rule.official_rule_number,
        rule_title=v.rule.title, rule_version_id=v.version_key, source_document_id=v.source_document.doc_key,
        page_start=c.page_start, page_end=c.page_end, page_precision=c.page_precision, excerpt=c.text,
        verification_status=v.verification_status, retrieval_method="evidence_lookup",  # type: ignore[arg-type]
        table_like=c.table_like, flags=list(v.flags or []), is_embedded_rule=False)
