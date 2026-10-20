"""Preliminary plot-feasibility assessment.

Pluggable check modules; only checks whose rule AND inputs are available are evaluated.
A single score never hides unresolved checks and the result is never a compliance verdict.
"""
from __future__ import annotations

from dataclasses import asdict, dataclass, field
from decimal import Decimal
from typing import Any, Protocol

from app.rules.calculations import registry as calc_registry
from app.rules.calculations.base import CalculationError
from app.rules.calculations.geometry import area_difference_percent, plot_area_rectangle
from app.rules.calculations.units import convert_value
from app.services.retrieval_service import RuleStore

AREA_TOLERANCE_PERCENT = Decimal(1)  # input-consistency tolerance only; NOT a regulatory value

REGULATORY_CATEGORIES = {
    "setbacks": ("Front/rear/side open spaces", "open space setback front rear side"),
    "floor_area_ratio_coverage": ("Floor area ratio and ground coverage", "floor area ratio coverage"),
    "height": ("Building height limit", "building height limit"),
    "parking": ("Parking requirement", "parking"),
    "permission_fees": ("Building permission fee", "building permission fee"),
}


@dataclass
class CheckResult:
    check_id: str
    description: str
    status: str  # passed | failed | conditional | not_evaluated | pending_verification
    input_values: dict[str, Any] = field(default_factory=dict)
    rule_references: list[str] = field(default_factory=list)
    calculation_result: dict[str, Any] | None = None
    explanation: str = ""
    missing_information: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)
    related_evidence_ids: list[str] = field(default_factory=list)  # context only; NOT applied

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


class CheckModule(Protocol):
    check_id: str

    def evaluate(self, inputs: dict[str, Any]) -> CheckResult: ...


CHECK_MODULES: list[CheckModule] = []  # verified regulatory check modules register here


def _val(inputs: dict[str, Any], name: str, to_unit: str):
    v = inputs.get(name)
    if v is None:
        return None
    return convert_value(v["value"], v["unit"], to_unit)


def geometry_check(inputs: dict[str, Any]) -> CheckResult:
    cid, desc = "geometry.plot_area_consistency", "Plot dimensions and stated area are internally consistent (input sanity check, not a rule check)"
    try:
        length, width = inputs.get("plot_length"), inputs.get("plot_width")
        stated = inputs.get("plot_area")
        if not (length and width):
            return CheckResult(cid, desc, "not_evaluated", missing_information=["plot_length", "plot_width"],
                               explanation="Plot length and width are needed to compute area from dimensions.")
        if length["unit"] != width["unit"]:
            l_m, w_m = convert_value(length["value"], length["unit"], "m"), convert_value(width["value"], width["unit"], "m")
            calc = plot_area_rectangle(l_m, w_m, "m")
        else:
            calc = plot_area_rectangle(length["value"], width["value"], length["unit"])
        if calc.validation_status != "valid":
            return CheckResult(cid, desc, "failed", {"plot_length": length, "plot_width": width},
                               explanation="Dimensions are invalid.", warnings=calc.warnings,
                               calculation_result=calc.to_dict())
        if not stated:
            return CheckResult(cid, desc, "passed", {"plot_length": length, "plot_width": width},
                               calculation_result=calc.to_dict(), explanation=f"Computed area {calc.final_value} sqm from dimensions.",
                               warnings=["General arithmetic only; not evidence of regulatory compliance."])
        stated_sqm = _val(inputs, "plot_area", "sqm")
        diff = area_difference_percent(stated_sqm, calc.final_value)
        ok = diff <= AREA_TOLERANCE_PERCENT
        return CheckResult(
            cid, desc, "passed" if ok else "failed", {"plot_length": length, "plot_width": width, "plot_area": stated},
            calculation_result=calc.to_dict(),
            explanation=f"Stated area differs from length x width by {diff.quantize(Decimal('0.01'))}% (input-consistency tolerance {AREA_TOLERANCE_PERCENT}%).",
            warnings=["Input-consistency check only; not a regulatory compliance check."],
        )
    except CalculationError as e:
        return CheckResult(cid, desc, "failed", explanation=f"{e.code}: {e.message}")


def run_assessment(store: RuleStore | None, inputs: dict[str, Any], amendments: list | None = None) -> dict[str, Any]:
    """``inputs``: name -> {"value": .., "unit": ..} (building_use is a plain string)."""
    checks: list[CheckResult] = [geometry_check(inputs)]
    for mod in CHECK_MODULES:
        checks.append(mod.evaluate(inputs))
    verified = calc_registry.available()
    for cid, (desc, query) in REGULATORY_CATEGORIES.items():
        related: list[str] = []
        refs: list[str] = []
        if store is not None:
            res = store.search(query, top_k=3)
            related = [i.evidence_id for i in res.items]
            refs = list(dict.fromkeys(i.rule_number for i in res.items))
        checks.append(CheckResult(
            f"regulatory.{cid}", desc, "not_evaluated", dict(inputs.items()),
            rule_references=refs, related_evidence_ids=related,
            explanation="No verified calculation module exists for this requirement; it was not evaluated. "
                        "Rule references listed are related search hits for the reviewer, not applied rules.",
            warnings=[f"Verified formulas available: {verified or 'none'}"],
        ))
    statuses = [c.status for c in checks]
    if "failed" in statuses:
        overall = "failed_checks_present"
    elif any(s in ("not_evaluated", "pending_verification", "conditional") for s in statuses):
        overall = "incomplete"
    else:
        overall = "evaluated_checks_passed"
    warnings = ["This is a preliminary feasibility screen, not an official approval or a compliance determination."]
    if any(a.verification_status != "verified" for a in (amendments or [])):
        warnings.append("Unverified amendments exist (e.g. Rule 2(5)(c)); their effect on this project is not established.")
    return {
        "overall_status": overall,
        "summary": f"{sum(s == 'passed' for s in statuses)} passed, {sum(s == 'failed' for s in statuses)} failed, "
                   f"{sum(s == 'not_evaluated' for s in statuses)} not evaluated. Not a compliance determination.",
        "checks": [c.to_dict() for c in checks],
        "assumptions": [],
        "missing_information": sorted({m for c in checks for m in c.missing_information}),
        "warnings": warnings,
    }
