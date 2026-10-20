"""Thin facade over the deterministic calculation engine."""
from __future__ import annotations

from typing import Any

from app.rules.calculations import registry as formulas
from app.rules.calculations.base import CalculationResult
from app.rules.calculations.geometry import plot_area_rectangle
from app.rules.calculations.units import convert


def plot_area(length, width, unit="m", output_unit="sqm", places=4) -> CalculationResult:
    return plot_area_rectangle(length, width, unit, output_unit, places)


def unit_conversion(value, from_unit, to_unit, places=4) -> CalculationResult:
    return convert(value, from_unit, to_unit, places)


def regulatory(formula_id: str, inputs: dict[str, Any]) -> CalculationResult:
    return formulas.evaluate(formula_id, inputs)  # raises FormulaNotVerified
