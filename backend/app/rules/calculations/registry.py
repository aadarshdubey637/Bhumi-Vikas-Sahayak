"""Registry of *verified* regulatory formulas.

It ships EMPTY on purpose.  A regulatory formula (setback, FAR, fee ...) may be registered
only after its source rule version, units, conditions and applicability have been verified
by a human reviewer (docs/rule_verification.md).  Unverified entries are refused at
evaluation time.  No default value is ever invented for a missing rule.
"""
from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass, field
from typing import Any

from app.rules.calculations.base import CalculationResult


class FormulaNotVerified(Exception):
    def __init__(self, formula_id: str, reason: str):
        super().__init__(f"{formula_id}: {reason}")
        self.formula_id = formula_id
        self.reason = reason


@dataclass
class RegulatoryFormula:
    formula_id: str
    description: str
    rule_refs: list[str]
    source_version_ids: list[str]
    required_inputs: list[str]
    verification_status: str  # must be "verified" to run
    compute: Callable[[dict[str, Any]], CalculationResult]
    conditions: list[str] = field(default_factory=list)
    category: str = "general"  # e.g. setback | far | height | parking | fee


_REGISTRY: dict[str, RegulatoryFormula] = {}


def register(formula: RegulatoryFormula) -> None:
    _REGISTRY[formula.formula_id] = formula


def clear() -> None:  # test helper
    _REGISTRY.clear()


def get(formula_id: str) -> RegulatoryFormula | None:
    return _REGISTRY.get(formula_id)


def available() -> list[str]:
    return sorted(f.formula_id for f in _REGISTRY.values() if f.verification_status == "verified")


def evaluate(formula_id: str, inputs: dict[str, Any]) -> CalculationResult:
    f = _REGISTRY.get(formula_id)
    if f is None:
        raise FormulaNotVerified(formula_id, "no verified formula is registered for this calculation")
    if f.verification_status != "verified":
        raise FormulaNotVerified(formula_id, f"formula verification_status is {f.verification_status!r}")
    missing = [k for k in f.required_inputs if inputs.get(k) in (None, "")]
    if missing:
        raise FormulaNotVerified(formula_id, f"missing required inputs: {missing}")
    return f.compute(inputs)
