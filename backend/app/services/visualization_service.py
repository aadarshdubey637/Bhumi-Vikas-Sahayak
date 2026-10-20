"""Structured plot geometry for a frontend to render. No image generation."""
from __future__ import annotations

from typing import Any

from app.rules.calculations.base import CalculationError
from app.rules.calculations.units import convert_value


def plot_preview(inputs: dict[str, Any], assessment: dict[str, Any] | None = None) -> dict[str, Any]:
    """Return a rectangle (metres, origin bottom-left, road along the bottom edge) plus
    annotations.  ``verified_constraints`` stays empty until a verified setback module exists;
    unevaluated requirements are listed as ``unresolved_constraints``."""
    warnings: list[str] = []
    geometry = None
    try:
        L, W = inputs.get("plot_length"), inputs.get("plot_width")
        if L and W:
            w = float(convert_value(W["value"], W["unit"], "m"))
            ln = float(convert_value(L["value"], L["unit"], "m"))
            if w <= 0 or ln <= 0:
                raise CalculationError("INVALID_DIMENSION", "dimensions must be positive")
            geometry = {
                "type": "polygon", "role": "proposed_plot", "unit": "m", "origin": "bottom_left",
                "points": [[0, 0], [w, 0], [w, ln], [0, ln]], "closed": True,
                "dimension_labels": [{"edge": 0, "text": f"{w:g} m"}, {"edge": 1, "text": f"{ln:g} m"}],
                "orientation_note": "Plot width is drawn along the road edge by convention; actual orientation not supplied.",
            }
    except (CalculationError, KeyError, TypeError) as e:
        warnings.append(f"geometry not drawn: {e}")
    if geometry is None and not warnings:
        warnings.append("plot_length and plot_width are required to draw geometry")
    annotations = []
    rw = inputs.get("road_width")
    if rw:
        annotations.append({"type": "road", "edge": 0, "label": f"Road width {rw['value']} {rw['unit']} (user provided)", "source": "user_provided"})
    unresolved = [
        {"constraint": c["check_id"], "description": c["description"], "status": c["status"]}
        for c in (assessment or {}).get("checks", []) if c["status"] in ("not_evaluated", "pending_verification")
    ] or [{"constraint": "regulatory.setbacks", "description": "Setbacks not evaluated: no verified module", "status": "not_evaluated"}]
    return {
        "geometry": geometry, "annotations": annotations,
        "verified_constraints": [],  # populated only from verified rule modules
        "unresolved_constraints": unresolved, "warnings": warnings,
        "legend": {"proposed_plot": "user-supplied geometry", "verified_constraints": "from verified rules", "unresolved_constraints": "not evaluated"},
    }
