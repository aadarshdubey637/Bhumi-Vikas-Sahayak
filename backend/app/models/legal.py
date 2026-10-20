"""Legal-source entities. Rule history is preserved: new content => new RuleVersion row."""
from __future__ import annotations

from datetime import date, datetime

from sqlalchemy import JSON, Boolean, Date, DateTime, ForeignKey, Index, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin, utcnow

VERIFICATION = ("unverified", "pending_verification", "verified", "rejected")


class SourceDocument(TimestampMixin, Base):
    __tablename__ = "source_documents"
    id: Mapped[int] = mapped_column(primary_key=True)
    doc_key: Mapped[str] = mapped_column(String(128), unique=True)  # stable identifier
    title: Mapped[str] = mapped_column(String(300))
    document_type: Mapped[str] = mapped_column(String(32))  # rulebook | amendment | other
    jurisdiction: Mapped[str] = mapped_column(String(100), default="Madhya Pradesh")
    language: Mapped[str] = mapped_column(String(8))
    source_url: Mapped[str | None] = mapped_column(String(500))
    local_path: Mapped[str | None] = mapped_column(String(500))
    publication_date: Mapped[date | None] = mapped_column(Date)  # null == not verified
    effective_date: Mapped[date | None] = mapped_column(Date)
    consolidation_date: Mapped[date | None] = mapped_column(Date)
    document_version: Mapped[str | None] = mapped_column(String(64))
    file_hash: Mapped[str | None] = mapped_column(String(64))
    verification_status: Mapped[str] = mapped_column(String(24), default="unverified")
    page_count: Mapped[int | None] = mapped_column(Integer)
    notes: Mapped[str | None] = mapped_column(Text)


class Rule(TimestampMixin, Base):
    """Stable identity of a rule (e.g. ``56``, ``12-A``)."""
    __tablename__ = "rules"
    id: Mapped[int] = mapped_column(primary_key=True)
    stable_rule_id: Mapped[str] = mapped_column(String(64), unique=True)  # normalized key
    official_rule_number: Mapped[str] = mapped_column(String(64))  # exact official label
    title: Mapped[str] = mapped_column(String(500))
    part: Mapped[str | None] = mapped_column(String(200))
    jurisdiction: Mapped[str] = mapped_column(String(100), default="Madhya Pradesh")
    parent_rule_id: Mapped[int | None] = mapped_column(ForeignKey("rules.id"))
    versions: Mapped[list[RuleVersion]] = relationship(back_populates="rule", order_by="RuleVersion.id")
    parent: Mapped[Rule | None] = relationship(remote_side=[id])


class RuleVersion(Base):
    __tablename__ = "rule_versions"
    __table_args__ = (
        UniqueConstraint("rule_id", "source_document_id", "content_hash", name="uq_rule_version_content"),
        Index("ix_rule_versions_rule_status", "rule_id", "version_status"),
    )
    id: Mapped[int] = mapped_column(primary_key=True)
    version_key: Mapped[str] = mapped_column(String(160), unique=True)  # e.g. "56@MP-BVR-2012-EN-..."
    rule_id: Mapped[int] = mapped_column(ForeignKey("rules.id"))
    source_document_id: Mapped[int] = mapped_column(ForeignKey("source_documents.id"))
    original_text: Mapped[str] = mapped_column(Text)  # byte-for-byte as supplied
    normalized_text: Mapped[str] = mapped_column(Text)  # index copy only
    language: Mapped[str] = mapped_column(String(8), default="en")
    source_page_start: Mapped[int | None] = mapped_column(Integer)
    source_page_end: Mapped[int | None] = mapped_column(Integer)
    effective_from: Mapped[date | None] = mapped_column(Date)  # unknown stays NULL
    effective_until: Mapped[date | None] = mapped_column(Date)
    version_status: Mapped[str] = mapped_column(String(16), default="active")  # active | superseded
    verification_status: Mapped[str] = mapped_column(String(24), default="unverified")
    reviewer_notes: Mapped[str | None] = mapped_column(Text)
    content_hash: Mapped[str] = mapped_column(String(64))
    flags: Mapped[list] = mapped_column(JSON, default=list)
    embedded_rules: Mapped[list] = mapped_column(JSON, default=list)
    extra: Mapped[dict] = mapped_column(JSON, default=dict)  # unmodelled source fields + page cross-check
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    rule: Mapped[Rule] = relationship(back_populates="versions")
    source_document: Mapped[SourceDocument] = relationship()
    chunks: Mapped[list[RuleChunk]] = relationship(back_populates="rule_version", order_by="RuleChunk.idx",
                                                   cascade="all, delete-orphan")


class RuleChunk(Base):
    """Derived retrieval unit. Its ``evidence_id`` is the stable citation key."""
    __tablename__ = "rule_chunks"
    __table_args__ = (UniqueConstraint("rule_version_id", "idx", name="uq_rule_chunk_idx"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    rule_version_id: Mapped[int] = mapped_column(ForeignKey("rule_versions.id", ondelete="CASCADE"), index=True)
    chunk_key: Mapped[str] = mapped_column(String(200))
    evidence_id: Mapped[str] = mapped_column(String(200), unique=True)
    idx: Mapped[int] = mapped_column(Integer)
    text: Mapped[str] = mapped_column(Text)
    context_heading: Mapped[str] = mapped_column(String(600))
    page_start: Mapped[int | None] = mapped_column(Integer)
    page_end: Mapped[int | None] = mapped_column(Integer)
    page_precision: Mapped[str] = mapped_column(String(32))
    omitted_lines: Mapped[int] = mapped_column(Integer, default=0)
    table_like: Mapped[bool] = mapped_column(Boolean, default=False)
    content_hash: Mapped[str] = mapped_column(String(64))
    rule_version: Mapped[RuleVersion] = relationship(back_populates="chunks")


class Amendment(TimestampMixin, Base):
    __tablename__ = "amendments"
    id: Mapped[int] = mapped_column(primary_key=True)
    amendment_key: Mapped[str] = mapped_column(String(128), unique=True)
    title: Mapped[str] = mapped_column(String(400))
    publication_date: Mapped[date | None] = mapped_column(Date)
    effective_date: Mapped[date | None] = mapped_column(Date)  # never inferred from publication date
    stated_date: Mapped[date | None] = mapped_column(Date)  # date quoted by a secondary source
    source_document_id: Mapped[int | None] = mapped_column(ForeignKey("source_documents.id"))
    source_url: Mapped[str | None] = mapped_column(String(500))
    verification_status: Mapped[str] = mapped_column(String(24), default="pending_verification")
    summary: Mapped[str | None] = mapped_column(Text)
    original_text: Mapped[str | None] = mapped_column(Text)
    reviewer_notes: Mapped[str | None] = mapped_column(Text)
    links: Mapped[list[RuleAmendmentLink]] = relationship(back_populates="amendment", cascade="all, delete-orphan")


class RuleAmendmentLink(Base):
    __tablename__ = "rule_amendment_links"
    __table_args__ = (UniqueConstraint("amendment_id", "rule_id", "clause_path", name="uq_amendment_rule_clause"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    amendment_id: Mapped[int] = mapped_column(ForeignKey("amendments.id", ondelete="CASCADE"))
    rule_id: Mapped[int] = mapped_column(ForeignKey("rules.id"), index=True)
    clause_path: Mapped[str] = mapped_column(String(64), default="")  # e.g. "5/c"
    relationship_type: Mapped[str] = mapped_column(String(32), default="amends")
    description: Mapped[str | None] = mapped_column(Text)
    verification_status: Mapped[str] = mapped_column(String(24), default="pending_verification")
    amendment: Mapped[Amendment] = relationship(back_populates="links")
    rule: Mapped[Rule] = relationship()


class RuleTable(Base):
    """Verified numerical tables, kept apart from free text. Auto-extracted => never 'verified'."""
    __tablename__ = "rule_tables"
    __table_args__ = (UniqueConstraint("rule_version_id", "table_identifier", name="uq_rule_table_ident"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    rule_id: Mapped[int] = mapped_column(ForeignKey("rules.id"), index=True)
    rule_version_id: Mapped[int] = mapped_column(ForeignKey("rule_versions.id"))
    table_identifier: Mapped[str] = mapped_column(String(64))
    title: Mapped[str | None] = mapped_column(String(300))
    row_labels: Mapped[list] = mapped_column(JSON, default=list)
    column_labels: Mapped[list] = mapped_column(JSON, default=list)
    values: Mapped[dict] = mapped_column(JSON, default=dict)
    units: Mapped[dict] = mapped_column(JSON, default=dict)
    source_page: Mapped[int | None] = mapped_column(Integer)
    extraction_method: Mapped[str] = mapped_column(String(64))
    verification_status: Mapped[str] = mapped_column(String(24), default="unverified")


class RuleDependency(Base):
    __tablename__ = "rule_dependencies"
    id: Mapped[int] = mapped_column(primary_key=True)
    source_rule_id: Mapped[int] = mapped_column(ForeignKey("rules.id"), index=True)
    target_rule_id: Mapped[int | None] = mapped_column(ForeignKey("rules.id"))
    target_calculation: Mapped[str | None] = mapped_column(String(128))
    dependency_type: Mapped[str] = mapped_column(String(32))  # applicability | calculation | exception
    description: Mapped[str | None] = mapped_column(Text)
    verification_status: Mapped[str] = mapped_column(String(24), default="unverified")


class IngestionRun(Base):
    __tablename__ = "ingestion_runs"
    id: Mapped[int] = mapped_column(primary_key=True)
    kind: Mapped[str] = mapped_column(String(32))  # jsonl | pdf | amendments
    input_path: Mapped[str] = mapped_column(String(500))
    input_hash: Mapped[str | None] = mapped_column(String(64))
    dry_run: Mapped[bool] = mapped_column(Boolean, default=False)
    accepted: Mapped[int] = mapped_column(Integer, default=0)
    rejected: Mapped[int] = mapped_column(Integer, default=0)
    created_versions: Mapped[int] = mapped_column(Integer, default=0)
    unchanged_versions: Mapped[int] = mapped_column(Integer, default=0)
    report: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


