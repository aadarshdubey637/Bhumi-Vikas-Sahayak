"""Exact unit conversion (factors are exact by definition)."""
from __future__ import annotations

import re
from decimal import Decimal

from app.rules.calculations.base import (
    CalculationError,
    CalculationResult,
    fmt,
    quantize,
    to_decimal,
)

# factor to base unit (metre / square metre)
_LENGTH = {
    "m": Decimal(1), "cm": Decimal("0.01"), "mm": Decimal("0.001"),
    "ft": Decimal("0.3048"), "in": Decimal("0.0254"), "yd": Decimal("0.9144"),
}
_AREA = {
    "sqm": Decimal(1), "sqft": Decimal("0.09290304"), "sqyd": Decimal("0.83612736"),
    "acre": Decimal("4046.8564224"), "hectare": Decimal(10000),
}
_ALIASES = {
    "m": "m", "meter": "m", "meters": "m", "metre": "m", "metres": "m", "mtr": "m", "mtrs": "m",
    "cm": "cm", "mm": "mm", "ft": "ft", "feet": "ft", "foot": "ft", "inch": "in", "inches": "in",
    "in": "in", "yd": "yd", "yard": "yd", "yards": "yd",
    "sqm": "sqm", "m2": "sqm", "squaremeter": "sqm", "squaremetre": "sqm", "squaremeters": "sqm",
    "squaremetres": "sqm", "sqmtr": "sqm", "sqmt": "sqm", "sqmeter": "sqm", "sqmetre": "sqm",
    "sqft": "sqft", "ft2": "sqft", "squarefeet": "sqft", "squarefoot": "sqft",
    "sqyd": "sqyd", "sqyard": "sqyd", "squareyard": "sqyd", "squareyards": "sqyd",
    "acre": "acre", "acres": "acre", "hectare": "hectare", "hectares": "hectare", "ha": "hectare",
}


def canonical_unit(unit: str) -> tuple[str, str]:
    """Return (canonical_unit, dimension). Raises on unknown units."""
    if not isinstance(unit, str) or not unit.strip():
        raise CalculationError("MISSING_UNIT", "unit is required")
    key = re.sub(r"[\s._\-]", "", unit.lower()).replace("²", "2")
    key = _ALIASES.get(key, key)
    if key in _LENGTH:
        return key, "length"
    if key in _AREA:
        return key, "area"
    raise CalculationError("UNKNOWN_UNIT", f"unsupported unit {unit!r}")


def convert_value(value, from_unit: str, to_unit: str) -> Decimal:
    v = to_decimal(value)
    f, fd = canonical_unit(from_unit)
    t, td = canonical_unit(to_unit)
    if fd != td:
        raise CalculationError("INCOMPATIBLE_UNITS", f"cannot convert {fd} ({from_unit}) to {td} ({to_unit})")
    table = _LENGTH if fd == "length" else _AREA
    return v * table[f] / table[t]


def convert(value, from_unit: str, to_unit: str, places: int = 4) -> CalculationResult:
    base = {"inputs": {"value": {"value": str(value), "unit": str(from_unit)}}}
    try:
        raw = convert_value(value, from_unit, to_unit)
        out = quantize(raw, places)
    except CalculationError as e:
        return CalculationResult("unit_conversion", "unit_conversion.v1", "exact SI/imperial definitions",
                                 final_value=None, output_unit=None, validation_status="invalid",
                                 verification_status="not_applicable_general_arithmetic",
                                 warnings=[f"{e.code}: {e.message}"], **base)
    return CalculationResult(
        "unit_conversion", "unit_conversion.v1", "exact SI/imperial definitions",
        final_value=fmt(out), output_unit=canonical_unit(to_unit)[0], validation_status="valid",
        verification_status="not_applicable_general_arithmetic",
        intermediate={"unrounded": str(raw)}, **base,
    )
