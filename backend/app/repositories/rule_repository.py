"""Rule persistence: idempotent, history-preserving import and DB-backed store construction.

* Same rule + same source document + same content hash  -> no-op (idempotent).
* Same rule + same source document + new content        -> NEW RuleVersion; the previous
  active one becomes ``superseded``. Nothing is overwritten and reviewer data is kept.
* Import never raises a verification status; reviews are applied only from the review file.
"""
from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass, field
from datetime import date
from pathlib import Path
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.models import Amendment, IngestionRun, Rule, RuleAmendmentLink, RuleChunk, RuleVersion, SourceDocument
from app.rules.normalization import parse_rule_ref
from app.rules.schemas import Chunk, EmbeddedRule, RuleRecord
from app.services.retrieval_service import RuleStore
from app.services.version_service import Amendment as AmendmentDC

EN_DOC_KEY = "MP-BVR-2012-EN-CONSOL-2025-03-06"
EN_DOC_TITLE = "Madhya Pradesh Bhumi Vikas Rules, 2012 (updated up to 6 March 2025) - English"


@dataclass
class ImportStats:
    rules_created: int = 0
    versions_created: int = 0
    versions_unchanged: int = 0
    versions_superseded: int = 0
    chunks_created: int = 0
    child_rules_created: int = 0
    dry_run: bool = False
    notes: list[str] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return dict(self.__dict__)


def file_sha256(path: Path | None) -> str | None:
    if not path or not Path(path).exists():
        return None
    h = hashlib.sha256()
    with Path(path).open("rb") as fh:
        for block in iter(lambda: fh.read(1 << 20), b""):
            h.update(block)
    return h.hexdigest()


def get_or_create_source_document(session: Session, doc_key: str, **fields: Any) -> SourceDocument:
    doc = session.scalar(select(SourceDocument).where(SourceDocument.doc_key == doc_key))
    if doc is None:
        doc = SourceDocument(doc_key=doc_key, **fields)
        session.add(doc)
        session.flush()
    return doc


def default_english_document(session: Session, pdf_path: Path | None = None, page_count: int | None = None) -> SourceDocument:
    doc = get_or_create_source_document(
        session, EN_DOC_KEY, title=EN_DOC_TITLE, document_type="rulebook", jurisdiction="Madhya Pradesh", language="en",
        consolidation_date=date(2025, 3, 6),  # printed on the document's title page
        document_version="consolidated-2025-03-06", verification_status="unverified",
        local_path=str(pdf_path) if pdf_path else None, file_hash=file_sha256(pdf_path), page_count=page_count,
    )
    if pdf_path and doc.file_hash is None:
        doc.file_hash = file_sha256(pdf_path)
    return doc


def import_records(session: Session, records: list[RuleRecord], doc: SourceDocument, dry_run: bool = False) -> ImportStats:
    st = ImportStats(dry_run=dry_run)
    for rec in records:
        rule = session.scalar(select(Rule).where(Rule.stable_rule_id == rec.rule_key))
        if rule is None:
            rule = Rule(stable_rule_id=rec.rule_key, official_rule_number=rec.official_rule_id, title=rec.title, part=rec.part)
            session.add(rule)
            session.flush()
            st.rules_created += 1
        existing = session.scalars(select(RuleVersion).where(
            RuleVersion.rule_id == rule.id, RuleVersion.source_document_id == doc.id)).all()
        if any(v.content_hash == rec.content_hash for v in existing):
            st.versions_unchanged += 1
            continue
        for v in existing:
            if v.version_status == "active":
                v.version_status = "superseded"
                st.versions_superseded += 1
        suffix = "" if not existing else f"#{len(existing) + 1}"
        extra = dict(rec.extra)
        extra["page_crosscheck"] = rec.page_crosscheck
        ver = RuleVersion(
            version_key=f"{rec.version_id}{suffix}", rule_id=rule.id, source_document_id=doc.id,
            original_text=rec.original_text, normalized_text=rec.searchable_text, language=rec.language,
            source_page_start=rec.page_start, source_page_end=rec.page_end, version_status="active",
            verification_status=rec.verification_status or "unverified", content_hash=rec.content_hash,
            flags=list(rec.flags), embedded_rules=[e.__dict__ for e in rec.embedded_rules], extra=extra,
        )
        for c in rec.chunks:
            ver.chunks.append(RuleChunk(
                chunk_key=c.chunk_id, evidence_id=c.evidence_id, idx=c.index, text=c.text, context_heading=c.context_heading,
                page_start=c.page_start, page_end=c.page_end, page_precision=c.page_precision,
                omitted_lines=c.omitted_lines, table_like=c.table_like, content_hash=c.content_hash))
        session.add(ver)
        st.versions_created += 1
        st.chunks_created += len(rec.chunks)
        # embedded (inserted) rules become child identities; their text stays inside the parent version
        for e in rec.embedded_rules:
            if session.scalar(select(Rule.id).where(Rule.stable_rule_id == e.rule_key)) is None:
                session.add(Rule(stable_rule_id=e.rule_key, official_rule_number=e.official_rule_id,
                                 title=f"{e.official_rule_id} (inserted rule; text is embedded in Rule {rec.official_rule_id}, end boundary unverified)",
                                 part=rec.part, parent_rule_id=rule.id))
                st.child_rules_created += 1
    session.flush()
    if dry_run:
        session.rollback()
    return st


def record_run(session: Session, kind: str, input_path: Path, report: dict[str, Any], stats: ImportStats | None,
               accepted: int, rejected: int, dry_run: bool) -> None:
    session.add(IngestionRun(
        kind=kind, input_path=str(input_path), input_hash=file_sha256(input_path), dry_run=dry_run,
        accepted=accepted, rejected=rejected, created_versions=stats.versions_created if stats else 0,
        unchanged_versions=stats.versions_unchanged if stats else 0, report=report))


def apply_reviews(session: Session, reviews_path: Path) -> int:
    """Apply human review decisions from ``rule_reviews.jsonl`` (``version_id``, ``verification_status``,
    optional ``reviewer_notes``). This is the ONLY way a version becomes ``verified``."""
    p = Path(reviews_path)
    if not p.exists():
        return 0
    n = 0
    for line in p.read_text(encoding="utf-8").splitlines():
        if not line.strip():
            continue
        d = json.loads(line)
        ver = session.scalar(select(RuleVersion).where(RuleVersion.version_key == d["version_id"]))
        if ver and d.get("verification_status") in ("verified", "rejected", "pending_verification"):
            ver.verification_status = d["verification_status"]
            ver.reviewer_notes = d.get("reviewer_notes", ver.reviewer_notes)
            n += 1
    session.flush()
    return n


# ---- amendments --------------------------------------------------------------------------------
def _d(v: str | None) -> date | None:
    return date.fromisoformat(v) if v else None


def import_amendments(session: Session, path: Path) -> int:
    """Load the pending-amendment register. Effective/publication dates stay NULL unless the file
    states them; stated (secondary-source) dates go to ``stated_date`` and are never promoted."""
    p = Path(path)
    if not p.exists():
        return 0
    n = 0
    for a in json.loads(p.read_text(encoding="utf-8")).get("amendments", []):
        row = session.scalar(select(Amendment).where(Amendment.amendment_key == a["amendment_id"]))
        if row is None:
            row = Amendment(amendment_key=a["amendment_id"], title=a["title"])
            session.add(row)
            n += 1
        row.title = a["title"]
        row.stated_date = _d(a.get("stated_date"))
        row.publication_date = _d(a.get("publication_date"))
        row.effective_date = _d(a.get("effective_date"))
        row.source_url = a.get("source_url")
        row.verification_status = a.get("verification_status", "pending_verification")
        row.summary, row.original_text, row.reviewer_notes = a.get("summary"), a.get("original_text"), a.get("reviewer_notes")
        session.flush()
        for aff in a.get("affects", []):
            rule = session.scalar(select(Rule).where(Rule.stable_rule_id == aff["rule"]))
            if rule is None:
                continue  # cannot link to a rule absent from the corpus; do not invent one
            cp = "/".join(aff.get("path") or [])
            if session.scalar(select(RuleAmendmentLink.id).where(
                    RuleAmendmentLink.amendment_id == row.id, RuleAmendmentLink.rule_id == rule.id,
                    RuleAmendmentLink.clause_path == cp)) is None:
                session.add(RuleAmendmentLink(amendment_id=row.id, rule_id=rule.id, clause_path=cp,
                                              relationship_type=aff.get("relationship", "amends"),
                                              verification_status=row.verification_status))
    session.flush()
    return n


def load_amendment_dataclasses(session: Session) -> list[AmendmentDC]:
    out = []
    for a in session.scalars(select(Amendment).options(selectinload(Amendment.links).selectinload(RuleAmendmentLink.rule))):
        out.append(AmendmentDC(
            amendment_id=a.amendment_key, title=a.title, verification_status=a.verification_status,
            effective_date=a.effective_date.isoformat() if a.effective_date else None,
            publication_date=a.publication_date.isoformat() if a.publication_date else None,
            stated_date=a.stated_date.isoformat() if a.stated_date else None, source_url=a.source_url,
            affects=[{"rule": ln.rule.stable_rule_id, "path": [x for x in ln.clause_path.split("/") if x],
                      "relationship": ln.relationship_type} for ln in a.links],
            summary=a.summary))
    return out


# ---- store ---------------------------------------------------------------------------------------
def build_store(session: Session) -> RuleStore | None:
    """Reconstruct the in-memory retrieval index from ACTIVE rule versions in the database."""
    versions = session.scalars(
        select(RuleVersion).where(RuleVersion.version_status == "active")
        .options(selectinload(RuleVersion.chunks), selectinload(RuleVersion.rule), selectinload(RuleVersion.source_document))
        .order_by(RuleVersion.id)).all()
    if not versions:
        return None
    records: list[RuleRecord] = []
    for v in versions:
        extra = dict(v.extra or {})
        xc = extra.pop("page_crosscheck", {})
        key = v.rule.stable_rule_id
        rec = RuleRecord(
            rule_key=key, official_rule_id=v.rule.official_rule_number, title=v.rule.title, part=v.rule.part or "",
            page_start=v.source_page_start or 0, page_end=v.source_page_end or 0, original_text=v.original_text,
            searchable_text=v.normalized_text, content_hash=v.content_hash, version_id=v.version_key,
            source_document_id=v.source_document.doc_key, language=v.language, verification_status=v.verification_status,
            flags=list(v.flags or []), page_crosscheck=xc, extra=extra,
            embedded_rules=[EmbeddedRule(**e) for e in (v.embedded_rules or [])],
        )
        rec.chunks = [Chunk(chunk_id=c.chunk_key, rule_key=key, official_rule_id=rec.official_rule_id, index=c.idx, text=c.text,
                            context_heading=c.context_heading, page_start=c.page_start, page_end=c.page_end,
                            page_precision=c.page_precision, omitted_lines=c.omitted_lines, table_like=c.table_like,
                            content_hash=c.content_hash) for c in v.chunks]
        records.append(rec)
    return RuleStore(records)


def resolve_rule(session: Session, rule_id: str) -> Rule | None:
    """Accepts a stable id (``56``, ``12-a``) or an official label (``12 A``, ``Rule 56``)."""
    rule = session.scalar(select(Rule).where(Rule.stable_rule_id == rule_id))
    if rule:
        return rule
    known = set(session.scalars(select(Rule.stable_rule_id)))
    ref = parse_rule_ref(rule_id, known_keys=known)
    if ref is not None:
        return session.scalar(select(Rule).where(Rule.stable_rule_id == ref.key))
    return None
