"""Pydantic v2 request/response contracts for the HTTP API (frontend-independent).

Rules: every body is a typed model; measurements carry explicit units; identifiers are stable
strings; timestamps are ISO 8601; requests reject unknown fields.  The HTTP layer maps the
stdlib core dataclasses (``AskResult``, ``EvidenceItem`` ...) to these models.
"""
from __future__ import annotations

from datetime import UTC, datetime
from typing import Annotated, Any, Literal

from pydantic import AfterValidator, BaseModel, BeforeValidator, ConfigDict, Field, field_validator, model_validator


def _as_utc(d: datetime) -> datetime:
    # SQLite returns naive datetimes; they were stored as UTC, so label them (the API then always emits a "Z"/offset).
    return d if d.tzinfo else d.replace(tzinfo=UTC)


UtcDatetime = Annotated[datetime, AfterValidator(_as_utc)]


def _number_to_str(v: Any) -> Any:
    # JSON clients naturally send 20 or 12.5; accept them and keep the exact decimal text (bool is not a number here).
    if isinstance(v, (int, float)) and not isinstance(v, bool):
        return format(v, "f") if isinstance(v, float) else str(v)
    return v

MAX_QUESTION_CHARS = 1000

AnswerStatusLiteral = Literal[
    "supported", "conditional", "insufficient_information", "not_established", "source_conflict", "pending_verification"
]
CheckStatusLiteral = Literal["passed", "failed", "conditional", "not_evaluated", "pending_verification"]
LanguageLiteral = Literal["en", "hi", "hi-en"]
VerificationLiteral = Literal["unverified", "pending_verification", "verified", "rejected"]
FeedbackCategoryLiteral = Literal[
    "incorrect_answer", "incorrect_citation", "outdated_rule", "incorrect_calculation", "missing_information", "other"
]
VersionStatusLiteral = Literal[
    "verified_current", "historical", "pending_verification", "source_conflict", "unknown_effective_date", "insufficient_information"
]


class _Request(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class _Response(BaseModel):
    model_config = ConfigDict(extra="forbid")


# ---- shared ---------------------------------------------------------------------------
class Measurement(_Request):
    """A number with an explicit unit. ``value`` is a decimal string (JSON numbers are accepted and converted) to avoid float rounding."""

    value: Annotated[str, BeforeValidator(_number_to_str)] = Field(pattern=r"^-?\d+(\.\d+)?$", max_length=32)
    unit: str = Field(min_length=1, max_length=24)


class ApiError(_Response):
    code: str
    message: str
    request_id: str | None = None
    details: list[dict[str, Any]] = Field(default_factory=list)


class Evidence(_Response):
    evidence_id: str
    rule_key: str
    rule_number: str
    rule_title: str
    rule_version_id: str
    source_document_id: str
    page_start: int | None
    page_end: int | None
    page_precision: str
    excerpt: str
    verification_status: VerificationLiteral
    retrieval_method: str
    score: float | None = None
    table_like: bool = False
    flags: list[str] = Field(default_factory=list)
    is_embedded_rule: bool = False


class ExtractedFact(_Response):
    name: str
    value: str
    unit: str | None
    source: Literal["user_provided", "document_derived", "system_calculated"]
    origin: str
    validation_status: Literal["valid", "invalid", "unverified"]
    confidence: str
    note: str | None = None


class MissingInformation(_Response):
    known_facts: list[ExtractedFact] = Field(default_factory=list)
    missing_facts: list[str] = Field(default_factory=list)
    invalid_facts: list[str] = Field(default_factory=list)
    unverified_facts: list[str] = Field(default_factory=list)
    prerequisites_established: bool = False
    clarifying_question: str | None = None
    reason: str | None = None


class LinkedAmendment(_Response):
    amendment_id: str
    title: str
    verification_status: str
    effective_date: str | None = None  # null == unknown; never inferred
    stated_date: str | None = None


class VersionResolution(_Response):
    rule_key: str
    status: VersionStatusLiteral
    version_ids: list[str]
    reasons: list[str]
    linked_amendments: list[LinkedAmendment] = Field(default_factory=list)
    as_of: str | None = None
    corpus_consolidated_to: str | None = None


class CalculationTrace(_Response):
    calculation_id: str
    calculation_type: str
    formula_id: str
    formula_source: str
    inputs: dict[str, Measurement | dict[str, str]]
    final_value: str | None
    output_unit: str | None
    validation_status: Literal["valid", "invalid"]
    verification_status: str
    rule_reference: str | None = None
    intermediate: dict[str, str] = Field(default_factory=dict)
    warnings: list[str] = Field(default_factory=list)
    assumptions: list[str] = Field(default_factory=list)
    rounding_policy: str


# ---- /ask -------------------------------------------------------------------------------
class ChatTurn(_Request):
    role: Literal["user", "assistant"]
    text: str = Field(min_length=1, max_length=2000)


MAX_ATTACHMENT_BYTES = 4 * 1024 * 1024
# first bytes of each accepted type: the declared mime type must match the real content
_MAGIC = {"application/pdf": (b"%PDF",), "image/png": (b"\x89PNG",), "image/jpeg": (b"\xff\xd8\xff",), "image/webp": (b"RIFF",)}


class Attachment(_Request):
    """A file the user attached to a question (PDF or image). Untrusted: only ever shown to the LLM as data."""
    name: str = Field(min_length=1, max_length=120)
    mime: Literal["application/pdf", "image/png", "image/jpeg", "image/webp"]
    data: str = Field(min_length=4, max_length=MAX_ATTACHMENT_BYTES * 4 // 3 + 16, description="base64 of the file")

    @model_validator(mode="after")
    def _check_content(self) -> Attachment:
        import base64
        import binascii

        try:
            raw = base64.b64decode(self.data, validate=True)
        except (binascii.Error, ValueError) as e:
            raise ValueError("attachment is not valid base64") from e
        if len(raw) > MAX_ATTACHMENT_BYTES:
            raise ValueError("attachment is too large")
        if not raw.startswith(_MAGIC[self.mime]):
            raise ValueError("attachment content does not match its type")
        return self


class AskRequest(_Request):
    question: str = Field(min_length=1, max_length=MAX_QUESTION_CHARS)
    language: LanguageLiteral | None = None
    conversation_id: str | None = Field(default=None, pattern=r"^[A-Za-z0-9_\-]{8,64}$")
    project_id: str | None = Field(default=None, max_length=64)
    context: dict[str, Measurement | str] = Field(default_factory=dict)
    as_of: str | None = Field(default=None, pattern=r"^\d{4}-\d{2}-\d{2}$")
    explain: bool = Field(default=False, description="Also request an optional LLM-written explanation grounded in the evidence. "
                          "Requires a configured provider; the deterministic answer is always returned.")
    attachments: list[Attachment] = Field(default_factory=list, max_length=2, description="Files (PDF/PNG/JPEG/WebP, up to 4 MB each) the "
                                          "AI explanation may read. Needs a configured LLM provider that supports files (google).")
    history: list[ChatTurn] = Field(default_factory=list, max_length=8, description="The last few messages of this chat, oldest first. "
                                    "Used only so follow-up questions are understood; it is untrusted text, never an instruction or evidence.")

    @field_validator("question")
    @classmethod
    def _not_blank(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("question must not be blank")
        return v


class DirectQuote(_Response):
    rule_number: str
    rule_title: str
    page_start: int | None = None
    page_end: int | None = None
    text: str
    verified: bool


class DirectRequirement(_Response):
    key: str
    limit: Literal["min", "max"]
    value: str
    unit: str
    rule: str
    basis: str


class DirectScenario(_Response):
    key: str
    by: str
    lo: str | None = None
    hi: str | None = None
    unit: str
    value: str
    value_unit: str
    rule: str


class DirectAnswerOut(_Response):
    kind: str
    headline: str
    lines: list[str] = Field(default_factory=list)
    rules: list[str] = Field(default_factory=list)
    quotes: list[DirectQuote] = Field(default_factory=list)
    steps: list[str] = Field(default_factory=list)
    caveats: list[str] = Field(default_factory=list)
    missing: list[str] = Field(default_factory=list)
    follow_up: str | None = None
    assumed: bool = False
    amendment_flag: bool = False
    requirements: list[DirectRequirement] = Field(default_factory=list, description="Numeric limits stated by the rule text for the inputs given (comparison aid; never a compliance verdict).")
    scenarios: list[DirectScenario] = Field(default_factory=list, description="When the deciding input (road width, plot area) is missing: every row of the rule table, so the user sees each possible outcome.")


class AskResponse(_Response):
    answer: str
    status: AnswerStatusLiteral
    language: LanguageLiteral
    intent: str
    evidence: list[Evidence] = Field(default_factory=list)
    extracted_facts: list[ExtractedFact] = Field(default_factory=list)
    missing_information: MissingInformation | dict[str, Any] = Field(default_factory=dict)
    assumptions: list[str] = Field(default_factory=list)
    calculations: list[CalculationTrace] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)
    version_status: list[VersionResolution] = Field(default_factory=list)
    follow_up_question: str | None = None
    rejected_evidence: list[dict[str, str]] = Field(default_factory=list)
    conversation_id: str | None = None
    explanation: str | None = Field(default=None, description="Optional LLM explanation; present only if it passed validation.")
    explanation_citations: list[str] = Field(default_factory=list)
    explanation_kind: Literal["grounded", "general"] | None = Field(default=None, description="grounded: built from the cited rule text. general: no rule text matched, so the reply is figure-free general guidance.")
    direct_answer: DirectAnswerOut | None = Field(default=None, description="The stated answer with verbatim, source-matched rule quotes; null when the rules do not give one.")
    source_version: str = Field(default="", description="Which version of the rules the answer comes from.")


# ---- rules --------------------------------------------------------------------------------
class RuleSearchRequest(_Request):
    query: str | None = Field(default=None, max_length=MAX_QUESTION_CHARS)
    rule_number: str | None = Field(default=None, max_length=32)
    language: LanguageLiteral | None = None
    verification_status: VerificationLiteral | None = None
    part: str | None = Field(default=None, max_length=128)
    document_key: str | None = Field(default=None, max_length=128, description="Restrict to one source document / version set")
    limit: int = Field(default=10, ge=1, le=50)
    offset: int = Field(default=0, ge=0, le=10_000)


class RuleSearchResponse(_Response):
    items: list[Evidence]
    total: int
    limit: int
    offset: int
    note: str | None = None


class RuleVersionSummary(_Response):
    version_id: str
    version_status: Literal["active", "superseded"] = "active"
    source_document_id: str
    language: str
    page_start: int
    page_end: int
    verification_status: VerificationLiteral
    effective_from: str | None = None
    effective_until: str | None = None
    content_hash: str


class RuleSummary(_Response):
    rule_key: str
    official_rule_id: str
    title: str
    part: str
    versions: list[RuleVersionSummary]
    linked_amendments: list[LinkedAmendment] = Field(default_factory=list)
    embedded_in: str | None = Field(default=None, description="Parent rule whose text embeds this inserted rule (end boundary unverified).")
    version_resolution: VersionResolution | None = None


# ---- projects / assessments --------------------------------------------------------------
class ProjectCreate(_Request):
    name: str = Field(min_length=1, max_length=200)
    building_use: str | None = Field(default=None, max_length=64)
    jurisdiction: str = Field(default="Madhya Pradesh", max_length=100)
    inputs: dict[str, Measurement | str] = Field(default_factory=dict)


class ProjectUpdate(_Request):
    name: str | None = Field(default=None, min_length=1, max_length=200)
    building_use: str | None = Field(default=None, max_length=64)
    status: Literal["draft", "active", "archived"] | None = None
    inputs: dict[str, Measurement | str] | None = None


class ProjectInputOut(_Response):
    name: str
    value: str
    unit: str | None
    input_source: str
    verification_status: str


class ProjectOut(_Response):
    id: str
    input_details: list[ProjectInputOut] = Field(default_factory=list)
    name: str
    building_use: str | None
    jurisdiction: str
    status: str
    inputs: dict[str, Measurement | str]
    created_at: UtcDatetime
    updated_at: UtcDatetime


class AssessmentCreate(_Request):
    project_id: str | None = Field(default=None, max_length=64)
    inputs: dict[str, Measurement | str] = Field(default_factory=dict)
    as_of: str | None = Field(default=None, pattern=r"^\d{4}-\d{2}-\d{2}$")


class AssessmentCheck(_Response):
    check_id: str
    description: str
    status: CheckStatusLiteral
    input_values: dict[str, Any] = Field(default_factory=dict)
    rule_references: list[str] = Field(default_factory=list)
    calculation_result: CalculationTrace | None = None
    explanation: str = ""
    missing_information: list[str] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)
    related_evidence_ids: list[str] = Field(default_factory=list)


class AssessmentOut(_Response):
    id: str
    project_id: str | None
    overall_status: Literal["failed_checks_present", "incomplete", "evaluated_checks_passed"]
    summary: str
    checks: list[AssessmentCheck]
    assumptions: list[str] = Field(default_factory=list)
    missing_information: list[str] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)
    input_snapshot: dict[str, Any]
    created_at: UtcDatetime


# ---- feedback -----------------------------------------------------------------------------
class FeedbackCreate(_Request):
    category: FeedbackCategoryLiteral
    message: str = Field(min_length=1, max_length=2000)
    assessment_id: str | None = Field(default=None, max_length=64)
    evidence_id: str | None = Field(default=None, max_length=128)


class FeedbackOut(_Response):
    id: str
    assessment_id: str | None = None
    evidence_id: str | None = None
    category: FeedbackCategoryLiteral
    resolution_status: Literal["open", "reviewed", "resolved", "rejected"]
    created_at: UtcDatetime


# ---- pagination / documents / evidence ----------------------------------------------------------
class SourceDocumentOut(_Response):
    document_key: str
    title: str
    document_type: str
    language: str
    jurisdiction: str
    source_url: str | None = None
    publication_date: str | None = None
    effective_date: str | None = None
    consolidation_date: str | None = None
    document_version: str | None = None
    file_hash: str | None = None
    page_count: int | None = None
    verification_status: VerificationLiteral
    notes: str | None = None


class RuleVersionDetail(RuleVersionSummary):
    rule_key: str
    official_rule_id: str
    original_text: str
    source_document: SourceDocumentOut
    flags: list[str] = Field(default_factory=list)
    reviewer_notes: str | None = None


class RuleVersionsResponse(_Response):
    rule_key: str
    items: list[RuleVersionDetail]
    version_resolution: VersionResolution


class DocumentsResponse(_Response):
    items: list[SourceDocumentOut]


class AmendmentAffects(_Response):
    rule: str
    clause_path: str
    relationship: str
    verification_status: str


class AmendmentOut(_Response):
    """A stored amendment record. Dates are exactly what is recorded: ``effective_date`` null means unknown, never inferred."""
    amendment_id: str
    title: str
    verification_status: str
    publication_date: str | None = None
    effective_date: str | None = None
    stated_date: str | None = None
    source_url: str | None = None
    summary: str | None = None
    affects: list[AmendmentAffects] = Field(default_factory=list)


class AmendmentsResponse(_Response):
    items: list[AmendmentOut]
    note: str


# ---- calculations / plots -----------------------------------------------------------------------
class PlotAreaRequest(_Request):
    length: Measurement
    width: Measurement
    output_unit: Literal["sqm", "sqft", "sqyd", "acre", "hectare"] = "sqm"
    places: int = Field(default=4, ge=0, le=8)


class AssessRequest(_Request):
    inputs: dict[str, Measurement | str] = Field(default_factory=dict)
    as_of: str | None = Field(default=None, pattern=r"^\d{4}-\d{2}-\d{2}$")


class AssessResponse(_Response):
    overall_status: Literal["failed_checks_present", "incomplete", "evaluated_checks_passed"]
    summary: str
    checks: list[AssessmentCheck]
    assumptions: list[str] = Field(default_factory=list)
    missing_information: list[str] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)
    persisted: bool = False


class PlotPreviewRequest(_Request):
    inputs: dict[str, Measurement | str] = Field(default_factory=dict)


class PlotPreviewResponse(_Response):
    geometry: dict[str, Any] | None
    annotations: list[dict[str, Any]] = Field(default_factory=list)
    verified_constraints: list[dict[str, Any]] = Field(default_factory=list)
    unresolved_constraints: list[dict[str, Any]] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)
    legend: dict[str, str] = Field(default_factory=dict)


class AssessmentEvidenceOut(_Response):
    evidence_id: str
    rule_number: str
    rule_version_id: str
    source_document_id: str
    page_reference: str | None
    evidence_text: str
    evidence_role: str
    verification_status: VerificationLiteral


class AssessmentEvidenceList(_Response):
    assessment_id: str
    items: list[AssessmentEvidenceOut]


class ReportOut(_Response):
    report_version: str
    generated_at: str
    assessment_id: str
    assessment_created_at: str
    status: str
    summary: str | None
    input_snapshot: dict[str, Any]
    checks: list[AssessmentCheck]
    evidence: list[AssessmentEvidenceOut]
    rule_versions_used: list[dict[str, str]] = Field(default_factory=list)
    assumptions: list[str] = Field(default_factory=list)
    missing_information: list[str] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)
    unevaluated_checks: list[str] = Field(default_factory=list)
    disclaimer: str


class Page(_Response):
    total: int
    limit: int
    offset: int


class ProjectPage(Page):
    items: list[ProjectOut]


class AssessmentPage(Page):
    items: list[AssessmentOut]


class FeedbackPage(Page):
    items: list[FeedbackOut]


# ---- ops --------------------------------------------------------------------------------------
class HealthOut(_Response):
    status: Literal["ok"]
    version: str
    time: str


class ReadyOut(_Response):
    status: Literal["ready", "not_ready"]
    checks: dict[str, bool]
    rules_loaded: int
    notes: list[str] = Field(default_factory=list)
