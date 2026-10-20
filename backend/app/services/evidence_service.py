"""Response validation: every citation must resolve to a stored record with page metadata."""
from __future__ import annotations

import re
from dataclasses import dataclass

from app.services.retrieval_service import EvidenceItem, RuleStore


@dataclass
class EvidenceValidation:
    valid: list[EvidenceItem]
    rejected: list[tuple[str, str]]  # (evidence_id, reason)


def validate_evidence(store: RuleStore, items: list[EvidenceItem]) -> EvidenceValidation:
    valid, rejected = [], []
    for it in items:
        if it.is_embedded_rule:
            rec = store.embedded.get(it.rule_key)
            if rec is None:
                rejected.append((it.evidence_id, "embedded rule not in store"))
                continue
        else:
            stored = store.get_evidence(it.evidence_id)
            if stored is None:
                rejected.append((it.evidence_id, "evidence id does not resolve to a stored chunk"))
                continue
            if stored.excerpt != it.excerpt:
                rejected.append((it.evidence_id, "excerpt differs from stored source text"))
                continue
        if it.rule_key not in store.known_keys:
            rejected.append((it.evidence_id, "referenced rule does not exist"))
        elif not it.page_start or not it.page_end:
            rejected.append((it.evidence_id, "source page metadata missing"))
        else:
            valid.append(it)
    return EvidenceValidation(valid, rejected)


_NUM = re.compile(r"\d+(?:\.\d+)?")


def unsupported_numbers(answer_text: str, evidence: list[EvidenceItem], calc_values: list[str], user_values: list[str]) -> list[str]:
    """Numbers in a generated answer that appear in no evidence excerpt, calculation or user input."""
    allowed = set(calc_values) | set(user_values)
    for e in evidence:
        allowed.update(_NUM.findall(e.excerpt))
        allowed.update(_NUM.findall(e.rule_number))
        allowed.update(str(e.page_start or ""), str(e.page_end or ""))
    return sorted({n for n in _NUM.findall(answer_text) if n not in allowed})
