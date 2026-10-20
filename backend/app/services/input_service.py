"""Strict validation/normalisation of user-supplied inputs (names, units, dimensions, magnitudes).

Unknown input names are rejected (not silently ignored), so a typo can never produce a
'not evaluated because missing' result that looks like a rule outcome.
"""
from __future__ import annotations

import re
from collections.abc import Mapping
from decimal import Decimal
from typing import Any

from app.core.exceptions import ValidationFailed
from app.rules.calculations.base import CalculationError, positive
from app.rules.calculations.units import canonical_unit

INPUT_DIMENSIONS: dict[str, str] = {
    "plot_area": "area", "built_up_area": "area", "plot_length": "length", "plot_width": "length", "road_width": "length",
    "building_height": "length", "building_length": "length", "building_width": "length", "floors": "count",
}
TEXT_INPUTS = ("building_use", "location")
MAX_MAGNITUDE = Decimal("1e9")
_TEXT = re.compile(r"^[^\x00-\x1f<>]{1,64}$")


def normalize_inputs(raw: Mapping[str, Any]) -> dict[str, Any]:
    """name -> {"value": str, "unit": canonical_unit} (numbers) or str (text). Raises ValidationFailed."""
    out: dict[str, Any] = {}
    problems: list[dict[str, Any]] = []
    for name, v in raw.items():
        if name in TEXT_INPUTS:
            text = v if isinstance(v, str) else None
            if text is None or not _TEXT.match(text.strip()):
                problems.append({"input": name, "msg": "must be a short plain-text value (1-64 chars)"})
            else:
                out[name] = text.strip().lower() if name == "building_use" else text.strip()
            continue
        dim = INPUT_DIMENSIONS.get(name)
        if dim is None:
            problems.append({"input": name, "msg": f"unknown input; allowed: {sorted([*INPUT_DIMENSIONS, *TEXT_INPUTS])}"})
            continue
        if isinstance(v, str) or v is None:
            problems.append({"input": name, "msg": "must be an object {value, unit}"})
            continue
        value, unit = (v.get("value"), v.get("unit")) if isinstance(v, dict) else (v.value, v.unit)
        try:
            d = positive(value, name)
            if d > MAX_MAGNITUDE:
                raise CalculationError("OUT_OF_RANGE", f"{name} is implausibly large")
            if dim == "count":
                if unit != "count" or d != d.to_integral_value():
                    raise CalculationError("INCORRECT_UNIT", "floors must be a whole number with unit 'count'")
                canon = "count"
            else:
                canon, got = canonical_unit(unit)
                if got != dim:
                    raise CalculationError("INCORRECT_UNIT", f"{name} needs a {dim} unit, got {unit!r}")
            out[name] = {"value": str(value).strip(), "unit": canon}
        except CalculationError as e:
            problems.append({"input": name, "code": e.code, "msg": e.message})
    if problems:
        raise ValidationFailed("one or more inputs are invalid", problems)
    return out


def to_context(inputs: Mapping[str, Any]) -> dict[str, Any]:
    """Shape accepted by ``extract_facts(context=...)``."""
    return {k: (dict(v) if isinstance(v, dict) else v) for k, v in inputs.items()}
