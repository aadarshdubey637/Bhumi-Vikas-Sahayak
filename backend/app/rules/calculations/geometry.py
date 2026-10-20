"""General geometry arithmetic. NOT regulatory compliance checks."""
from __future__ import annotations

from decimal import Decimal

from app.rules.calculations.base import (
    CalculationError,
    CalculationResult,
    fmt,
    positive,
    quantize,
)
from app.rules.calculations.units import canonical_unit, convert_value

_SRC = "arithmetic (length x width); general geometry, not a regulatory formula"
_NOTE = "General arithmetic only; this is not evidence of regulatory compliance."


def plot_area_rectangle(length, width, unit: str = "m", output_unit: str = "sqm", places: int = 4) -> CalculationResult:
    inputs = {"length": {"value": str(length), "unit": unit}, "width": {"value": str(width), "unit": unit}}
    try:
        cu, dim = canonical_unit(unit)
        if dim != "length":
            raise CalculationError("INCORRECT_UNIT", f"length unit expected, got {unit!r}")
        l_m = convert_value(positive(length, "length"), cu, "m")
        w_m = convert_value(positive(width, "width"), cu, "m")
        area_sqm = l_m * w_m
        out = quantize(convert_value(area_sqm, "sqm", output_unit), places)
    except CalculationError as e:
        return CalculationResult("plot_area_rectangle", "plot_area_rectangle.v1", _SRC, inputs,
                                 None, None, "invalid", "not_applicable_general_arithmetic",
                                 warnings=[f"{e.code}: {e.message}"])
    return CalculationResult(
        "plot_area_rectangle", "plot_area_rectangle.v1", _SRC, inputs, fmt(out),
        canonical_unit(output_unit)[0], "valid", "not_applicable_general_arithmetic",
        intermediate={"length_m": str(l_m), "width_m": str(w_m), "area_sqm_unrounded": str(area_sqm)},
        warnings=[_NOTE],
    )


def area_difference_percent(stated_sqm, computed_sqm) -> Decimal:
    s, c = positive(stated_sqm, "stated area"), positive(computed_sqm, "computed area")
    return abs(s - c) / s * Decimal(100)
