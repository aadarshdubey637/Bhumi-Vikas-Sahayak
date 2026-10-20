from decimal import Decimal

import pytest

from app.rules.calculations import registry as calc_registry
from app.rules.calculations.base import (
    CalculationError,
    CalculationResult,
    fmt,
    positive,
    quantize,
    to_decimal,
)
from app.rules.calculations.geometry import area_difference_percent, plot_area_rectangle
from app.rules.calculations.units import canonical_unit, convert, convert_value


# ---- base helpers -----------------------------------------------------------------
def test_to_decimal_accepts_commas_and_rejects_junk():
    assert to_decimal("1,200.5") == Decimal("1200.5")
    for bad, code in [(None, "MISSING_VALUE"), (True, "MISSING_VALUE"), ("abc", "NOT_NUMERIC"), ("NaN", "NOT_FINITE"), ("Infinity", "NOT_FINITE")]:
        with pytest.raises(CalculationError) as e:
            to_decimal(bad)
        assert e.value.code == code


def test_positive_rejects_zero_and_negative():
    with pytest.raises(CalculationError) as e:
        positive(0, "x")
    assert e.value.code == "ZERO_VALUE"
    with pytest.raises(CalculationError) as e:
        positive("-1", "x")
    assert e.value.code == "NEGATIVE_VALUE"


def test_rounding_is_half_up_not_bankers():
    assert quantize(Decimal("2.5"), 0) == Decimal(3)
    assert quantize(Decimal("3.5"), 0) == Decimal(4)
    assert quantize(Decimal("-2.5"), 0) == Decimal(-3)
    assert quantize(Decimal("1.005"), 2) == Decimal("1.01")  # float would give 1.0
    with pytest.raises(CalculationError):
        quantize(Decimal(1), 13)


def test_fmt():
    assert fmt(Decimal("10000.0000")) == "10000"
    assert fmt(Decimal("464.5152")) == "464.5152"


# ---- units --------------------------------------------------------------------------
@pytest.mark.parametrize("unit,expected", [("sq m", "sqm"), ("Sq.Mtr", "sqm"), ("m²", "sqm"), ("feet", "ft"), ("Hectares", "hectare")])
def test_unit_aliases(unit, expected):
    assert canonical_unit(unit)[0] == expected


@pytest.mark.parametrize("bad,code", [("furlong", "UNKNOWN_UNIT"), ("", "MISSING_UNIT"), (None, "MISSING_UNIT")])
def test_unknown_or_missing_unit(bad, code):
    with pytest.raises(CalculationError) as e:
        canonical_unit(bad)
    assert e.value.code == code


def test_exact_conversions():
    assert convert_value(1, "ft", "m") == Decimal("0.3048")
    assert convert_value(1, "hectare", "sqm") == Decimal(10000)
    assert convert("1", "acre", "sqm").final_value == "4046.8564"
    assert convert("12", "in", "ft").final_value == "1"


def test_incompatible_units_are_invalid_not_exceptions():
    r = convert(1, "m", "sqm")
    assert r.validation_status == "invalid" and r.final_value is None
    assert "INCOMPATIBLE_UNITS" in r.warnings[0]


# ---- geometry ----------------------------------------------------------------------
def test_plot_area_metric():
    r = plot_area_rectangle(10, 20, "m")
    assert (r.final_value, r.output_unit, r.validation_status) == ("200", "sqm", "valid")
    assert r.verification_status == "not_applicable_general_arithmetic"
    assert any("not evidence of regulatory compliance" in w for w in r.warnings)
    assert r.inputs["length"] == {"value": "10", "unit": "m"}


def test_plot_area_feet_known_value():
    assert plot_area_rectangle(100, 50, "ft").final_value == "464.5152"  # 30.48 m x 15.24 m


def test_plot_area_output_unit_and_places():
    assert plot_area_rectangle(10, 20, "m", output_unit="sqft", places=2).final_value == "2152.78"


@pytest.mark.parametrize("length,w,u,code", [
    (0, 10, "m", "ZERO_VALUE"), (-5, 10, "m", "NEGATIVE_VALUE"), (None, 10, "m", "MISSING_VALUE"),
    ("x", 10, "m", "NOT_NUMERIC"), (10, 10, "sqm", "INCORRECT_UNIT"), (10, 10, "furlong", "UNKNOWN_UNIT"),
])
def test_plot_area_invalid_inputs(length, w, u, code):
    r = plot_area_rectangle(length, w, u)
    assert r.validation_status == "invalid" and r.final_value is None
    assert code in r.warnings[0]


def test_tiny_dimension_boundary():
    assert plot_area_rectangle("0.0001", 1, "m", places=4).final_value == "0.0001"
    assert plot_area_rectangle("0.00001", 1, "m", places=4).final_value == "0"


def test_area_difference_percent():
    assert area_difference_percent(200, 198) == Decimal(1)
    with pytest.raises(CalculationError):
        area_difference_percent(0, 5)


def test_result_has_unique_ids_and_serialises():
    a, b = plot_area_rectangle(1, 1), plot_area_rectangle(1, 1)
    assert a.calculation_id != b.calculation_id
    assert isinstance(a.to_dict(), dict) and isinstance(a, CalculationResult)


# ---- verified-formula registry -------------------------------------------------------
def test_registry_ships_empty_and_refuses_unknown():
    assert calc_registry.available() == []
    with pytest.raises(calc_registry.FormulaNotVerified):
        calc_registry.evaluate("setback.front", {})


def _formula(status):
    return calc_registry.RegulatoryFormula(
        "synthetic.test", "SYNTHETIC test formula, not a legal rule", ["0"], ["v0"], ["x"], status,
        lambda i: plot_area_rectangle(i["x"], i["x"]), category="setback")


def test_unverified_formula_is_refused():
    calc_registry.register(_formula("unverified"))
    assert calc_registry.available() == []
    with pytest.raises(calc_registry.FormulaNotVerified):
        calc_registry.evaluate("synthetic.test", {"x": 2})


def test_verified_formula_requires_inputs_then_runs():
    calc_registry.register(_formula("verified"))
    with pytest.raises(calc_registry.FormulaNotVerified, match="missing required inputs"):
        calc_registry.evaluate("synthetic.test", {})
    assert calc_registry.evaluate("synthetic.test", {"x": 3}).final_value == "9"
