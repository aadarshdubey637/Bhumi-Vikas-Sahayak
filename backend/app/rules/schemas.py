"""Internal (stdlib) data structures for the legal corpus.

These are deliberately plain dataclasses so that ingestion, retrieval and calculations run
without any third-party dependency.  The HTTP layer maps them to Pydantic models.
"""
from __future__ import annotations

from dataclasses import asdict, dataclass, field
from typing import Any

VERIFICATION_STATUSES = ("unverified", "pending_verification", "verified", "rejected")


@dataclass
class Issue:
    code: str
    severity: str  # error | warning | info
    message: str
    rule: str | None = None
    line_no: int | None = None


@dataclass
class Chunk:
    chunk_id: str
    rule_key: str
    official_rule_id: str
    index: int
    text: str  # verbatim lines of the original text (running-header lines omitted)
    context_heading: str  # e.g. "Rule 56 - Open spaces"; prepended only for indexing
    page_start: int | None
    page_end: int | None
    page_precision: str  # "located_in_page_text" | "rule_range"
    omitted_lines: int
    table_like: bool
    content_hash: str

    @property
    def evidence_id(self) -> str:
        return f"EV-{self.rule_key}-{self.index:03d}-{self.content_hash[:8]}"


@dataclass
class EmbeddedRule:
    official_rule_id: str
    rule_key: str
    parent_rule_key: str
    text: str
    start_offset: int
    boundary_verified: bool = False  # end of the inserted rule is NOT established
    page_hint: int | None = None


@dataclass
class RuleRecord:
    rule_key: str
    official_rule_id: str
    title: str
    part: str
    page_start: int
    page_end: int
    original_text: str  # preserved exactly as supplied
    searchable_text: str  # cleaned copy used only for indexing
    content_hash: str
    version_id: str
    source_document_id: str
    language: str = "en"
    verification_status: str = "unverified"
    flags: list[str] = field(default_factory=list)
    chunks: list[Chunk] = field(default_factory=list)
    embedded_rules: list[EmbeddedRule] = field(default_factory=list)
    page_crosscheck: dict[str, Any] = field(default_factory=dict)
    extra: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)

    @classmethod
    def from_dict(cls, d: dict[str, Any]) -> RuleRecord:
        d = dict(d)
        d["chunks"] = [Chunk(**c) for c in d.get("chunks", [])]
        d["embedded_rules"] = [EmbeddedRule(**e) for e in d.get("embedded_rules", [])]
        return cls(**d)
