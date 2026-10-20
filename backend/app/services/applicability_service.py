"""Missing-information detection.

Required inputs are derived ONLY from verified calculation modules registered for the
question's category.  If none exists, we say prerequisites are not established instead of
asking a generic list of questions or assuming typical values.
"""
from __future__ import annotations

from dataclasses import asdict, dataclass, field
from typing import Any

from app.rules.calculations import registry as calc_registry
from app.services.entity_extraction_service import ExtractedFact

INTENT_TO_CATEGORY = {"setback": "setback", "floor_area": "far", "height": "height", "parking": "parking", "fees": "fee"}


@dataclass
class MissingInformation:
    known_facts: list[dict[str, Any]] = field(default_factory=list)
    missing_facts: list[str] = field(default_factory=list)
    invalid_facts: list[str] = field(default_factory=list)
    unverified_facts: list[str] = field(default_factory=list)
    prerequisites_established: bool = False
    clarifying_question: str | None = None
    reason: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


def detect_missing(intent: str, facts: list[ExtractedFact]) -> MissingInformation:
    out = MissingInformation(known_facts=[f.to_dict() for f in facts])
    out.invalid_facts = [f.name for f in facts if f.validation_status == "invalid"]
    out.unverified_facts = [f.name for f in facts if f.validation_status == "unverified"]
    category = INTENT_TO_CATEGORY.get(intent)
    modules = [calc_registry.get(fid) for fid in calc_registry.available()]
    modules = [m for m in modules if m and m.category == category]
    if not category or not modules:
        out.prerequisites_established = False
        out.reason = ("No verified calculation module exists for this question type yet, so the inputs "
                      "required by the applicable rule cannot be derived from verified rules. No values were assumed.")
        return out
    required: list[str] = []
    for m in modules:
        for r in m.required_inputs:
            if r not in required:
                required.append(r)
    have = {f.name for f in facts if f.validation_status == "valid"}
    out.prerequisites_established = True
    out.missing_facts = [r for r in required if r not in have]
    if out.missing_facts:
        nxt = out.missing_facts[0]  # ask only for the next needed input
        out.clarifying_question = f"Please provide: {nxt.replace('_', ' ')}."
        out.reason = f"Verified rule module(s) {[m.formula_id for m in modules]} require '{nxt}' for the next evaluation step."
    return out
