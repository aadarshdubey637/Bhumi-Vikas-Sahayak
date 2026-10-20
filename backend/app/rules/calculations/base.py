"""Calculation result schema and Decimal helpers (no LLM involvement, ever)."""
from __future__ import annotations

import uuid
from dataclasses import asdict, dataclass, field
from decimal import ROUND_HALF_UP, Decimal, InvalidOperation
from typing import Any

ROUNDING_POLICY = "ROUND_HALF_UP"


class CalculationError(ValueError):
    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code
        self.message = message


@dataclass
class CalculationResult:
    calculation_type: str
    formula_id: str
    formula_source: str
    inputs: dict[str, dict[str, str]]  # name -> {"value":..., "unit":...}
    final_value: str | None
    output_unit: str | None
    validation_status: str  # valid | invalid
    verification_status: str  # not_applicable_general_arithmetic | verified | unverified
    rule_reference: str | None = None
    intermediate: dict[str, str] = field(default_factory=dict)
    warnings: list[str] = field(default_factory=list)
    assumptions: list[str] = field(default_factory=list)
    rounding_policy: str = ROUNDING_POLICY
    calculation_id: str = field(default_factory=lambda: f"calc-{uuid.uuid4().hex[:12]}")

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


def to_decimal(value: Any, name: str = "value") -> Decimal:
    if isinstance(value, bool) or value is None:
        raise CalculationError("MISSING_VALUE", f"{name} is missing or not numeric")
    try:
        d = Decimal(str(value).strip().replace(",", ""))
    except (InvalidOperation, ValueError):
        raise CalculationError("NOT_NUMERIC", f"{name} is not a number: {value!r}") from None
    if not d.is_finite():
        raise CalculationError("NOT_FINITE", f"{name} must be finite")
    return d


def positive(value: Any, name: str) -> Decimal:
    d = to_decimal(value, name)
    if d < 0:
        raise CalculationError("NEGATIVE_VALUE", f"{name} must not be negative")
    if d == 0:
        raise CalculationError("ZERO_VALUE", f"{name} must be greater than zero")
    return d


def quantize(d: Decimal, places: int) -> Decimal:
    if places < 0 or places > 12:
        raise CalculationError("BAD_PRECISION", "places must be between 0 and 12")
    return d.quantize(Decimal(1).scaleb(-places), rounding=ROUND_HALF_UP)


def fmt(d: Decimal) -> str:
    s = format(d.normalize(), "f") if d == d.to_integral() else format(d, "f")
    return s
