"""User-facing entities: projects, assessments (immutable snapshots), evidence, feedback."""
from __future__ import annotations

from datetime import datetime

from sqlalchemy import JSON, DateTime, ForeignKey, Index, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin, new_id, utcnow


class Project(TimestampMixin, Base):
    __tablename__ = "projects"
    __table_args__ = (Index("ix_projects_owner", "owner_id"),)
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    owner_id: Mapped[str | None] = mapped_column(String(64))  # NULL only when AUTH_MODE=none
    name: Mapped[str] = mapped_column(String(200))
    building_use: Mapped[str | None] = mapped_column(String(64))
    jurisdiction: Mapped[str] = mapped_column(String(100), default="Madhya Pradesh")
    status: Mapped[str] = mapped_column(String(16), default="draft")
    inputs: Mapped[list[ProjectInput]] = relationship(back_populates="project", cascade="all, delete-orphan")
    assessments: Mapped[list[Assessment]] = relationship(back_populates="project", order_by="Assessment.created_at")


class ProjectInput(Base):
    __tablename__ = "project_inputs"
    __table_args__ = (UniqueConstraint("project_id", "name", name="uq_project_input_name"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    project_id: Mapped[str] = mapped_column(ForeignKey("projects.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(64))
    value: Mapped[str] = mapped_column(String(64))
    unit: Mapped[str | None] = mapped_column(String(24))
    input_source: Mapped[str] = mapped_column(String(24), default="user_provided")
    verification_status: Mapped[str] = mapped_column(String(24), default="unverified")  # user-entered, unverified
    project: Mapped[Project] = relationship(back_populates="inputs")


class Assessment(Base):
    """Immutable once written: later rule changes produce a NEW assessment."""
    __tablename__ = "assessments"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    project_id: Mapped[str | None] = mapped_column(ForeignKey("projects.id"), index=True)
    owner_id: Mapped[str | None] = mapped_column(String(64), index=True)
    status: Mapped[str] = mapped_column(String(32))
    summary: Mapped[str] = mapped_column(Text)
    input_snapshot: Mapped[dict] = mapped_column(JSON)
    calculation_results: Mapped[dict] = mapped_column(JSON)  # {"checks": [...]}
    assumptions: Mapped[list] = mapped_column(JSON, default=list)
    missing_information: Mapped[list] = mapped_column(JSON, default=list)
    warnings: Mapped[list] = mapped_column(JSON, default=list)
    rule_version_snapshot: Mapped[list] = mapped_column(JSON, default=list)  # [{version_key, content_hash}]
    as_of: Mapped[str | None] = mapped_column(String(10))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    report: Mapped[dict | None] = mapped_column(JSON)
    project: Mapped[Project | None] = relationship(back_populates="assessments")
    evidence: Mapped[list[AssessmentEvidence]] = relationship(back_populates="assessment", cascade="all, delete-orphan")


class AssessmentEvidence(Base):
    __tablename__ = "assessment_evidence"
    id: Mapped[int] = mapped_column(primary_key=True)
    assessment_id: Mapped[str] = mapped_column(ForeignKey("assessments.id", ondelete="CASCADE"), index=True)
    chunk_id: Mapped[int | None] = mapped_column(ForeignKey("rule_chunks.id"))
    evidence_id: Mapped[str] = mapped_column(String(200))
    rule_version_id: Mapped[int] = mapped_column(ForeignKey("rule_versions.id"))
    source_document_id: Mapped[int] = mapped_column(ForeignKey("source_documents.id"))
    page_reference: Mapped[str | None] = mapped_column(String(32))
    evidence_text: Mapped[str] = mapped_column(Text)
    evidence_role: Mapped[str] = mapped_column(String(32), default="related_context")  # related_context | applied
    verification_status: Mapped[str] = mapped_column(String(24))
    assessment: Mapped[Assessment] = relationship(back_populates="evidence")


class Conversation(TimestampMixin, Base):
    """Carries confirmed facts between /ask turns so follow-up answers re-evaluate the question."""
    __tablename__ = "conversations"
    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    owner_id: Mapped[str | None] = mapped_column(String(64))
    facts: Mapped[dict] = mapped_column(JSON, default=dict)  # name -> {"value","unit"}
    last_intent: Mapped[str | None] = mapped_column(String(32))


class Feedback(Base):
    __tablename__ = "feedback"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    assessment_id: Mapped[str | None] = mapped_column(ForeignKey("assessments.id"), index=True)
    owner_id: Mapped[str | None] = mapped_column(String(64))
    category: Mapped[str] = mapped_column(String(32))
    message: Mapped[str] = mapped_column(Text)
    evidence_id: Mapped[str | None] = mapped_column(String(200))
    resolution_status: Mapped[str] = mapped_column(String(16), default="open")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


