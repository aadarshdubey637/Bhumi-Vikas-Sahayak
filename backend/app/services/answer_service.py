"""Evidence-first status resolution and answer composition (no LLM required)."""
from __future__ import annotations

from enum import Enum

from app.services.language_service import template
from app.services.retrieval_service import EvidenceItem


class AnswerStatus(str, Enum):
    supported = "supported"
    conditional = "conditional"
    insufficient_information = "insufficient_information"
    not_established = "not_established"
    source_conflict = "source_conflict"
    pending_verification = "pending_verification"


def resolve_status(
    evidence: list[EvidenceItem],
    version_statuses: list[str],
    missing_required: bool,
    has_assumptions: bool,
    retrieval_confident: bool,
    needs_unavailable_calculation: bool = False,
) -> AnswerStatus:
    """Priority order is deliberate: never let a weaker status mask a stronger problem."""
    if not evidence or not retrieval_confident:
        return AnswerStatus.not_established
    if "source_conflict" in version_statuses:
        return AnswerStatus.source_conflict
    if missing_required:
        return AnswerStatus.insufficient_information
    if (
        needs_unavailable_calculation
        or any(e.verification_status != "verified" for e in evidence)
        or any(v in ("pending_verification", "unknown_effective_date", "insufficient_information") for v in version_statuses)
    ):
        return AnswerStatus.pending_verification
    if has_assumptions or "historical" in version_statuses:
        return AnswerStatus.conditional
    return AnswerStatus.supported


def compose_answer(status: AnswerStatus, language: str, evidence: list[EvidenceItem], max_items: int = 3) -> str:
    if status == AnswerStatus.not_established:
        return template(language, "not_established")
    lines = [template(language, "pointer")]
    seen = set()
    for e in evidence:
        k = (e.rule_number, e.page_start)
        if k in seen:
            continue
        seen.add(k)
        pg = f"{e.page_start}" if e.page_start == e.page_end else f"{e.page_start}-{e.page_end}"
        prec = "" if e.page_precision == "located_in_page_text" else " (rule-level page range)"
        lines.append(f"- Rule {e.rule_number} ({e.rule_title}), PDF page {pg}{prec} [{e.evidence_id}]")
        if len(seen) >= max_items:
            break
    if status in (AnswerStatus.pending_verification, AnswerStatus.conditional):
        lines.append(template(language, "pending"))
    if status == AnswerStatus.insufficient_information:
        lines.append(template(language, "needs_input"))
    return "\n".join(lines)
