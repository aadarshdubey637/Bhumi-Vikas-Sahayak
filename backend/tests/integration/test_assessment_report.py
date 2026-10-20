import pytest

from app.services.assessment_service import geometry_check, run_assessment
from app.services.feedback_service import FEEDBACK_CATEGORIES, validate_category
from app.services.report_service import DISCLAIMER, build_report
from app.services.visualization_service import plot_preview


def q(v, u="m"):
    return {"value": str(v), "unit": u}


def test_geometry_consistent_area_passes_with_disclaimer():
    c = geometry_check({"plot_length": q(10), "plot_width": q(20), "plot_area": q(200, "sqm")})
    assert c.status == "passed" and any("not a regulatory" in w for w in c.warnings)


def test_geometry_inconsistent_area_fails():
    assert geometry_check({"plot_length": q(10), "plot_width": q(20), "plot_area": q(150, "sqm")}).status == "failed"


def test_geometry_mixed_units():
    assert geometry_check({"plot_length": q(30.48), "plot_width": q(50, "ft"), "plot_area": q(464.5152, "sqm")}).status == "passed"


def test_geometry_missing_inputs_not_evaluated():
    c = geometry_check({})
    assert c.status == "not_evaluated" and c.missing_information == ["plot_length", "plot_width"]


def test_geometry_invalid_dimension_fails():
    assert geometry_check({"plot_length": q(-1), "plot_width": q(20)}).status == "failed"


def test_assessment_never_claims_compliance_without_verified_modules(store, amendments):
    out = run_assessment(store, {"plot_length": q(10), "plot_width": q(20), "plot_area": q(200, "sqm"), "road_width": q(9)}, amendments)
    statuses = {c["check_id"]: c["status"] for c in out["checks"]}
    assert statuses["geometry.plot_area_consistency"] == "passed"
    regulatory = [s for k, s in statuses.items() if k.startswith("regulatory.")]
    assert regulatory and set(regulatory) == {"not_evaluated"}
    assert out["overall_status"] == "incomplete"
    assert any("Rule 2(5)(c)" in w for w in out["warnings"])
    assert all(c["calculation_result"] is None for c in out["checks"] if c["check_id"].startswith("regulatory."))


def test_assessment_works_without_corpus():
    out = run_assessment(None, {})
    assert out["overall_status"] == "incomplete"


def test_failed_check_surfaces():
    out = run_assessment(None, {"plot_length": q(10), "plot_width": q(20), "plot_area": q(1, "sqm")})
    assert out["overall_status"] == "failed_checks_present"


def test_plot_preview_geometry_and_unresolved_constraints():
    p = plot_preview({"plot_length": q(20), "plot_width": q(10), "road_width": q(9)})
    assert p["geometry"]["points"] == [[0, 0], [10.0, 0], [10.0, 20.0], [0, 20.0]]
    assert p["verified_constraints"] == []
    assert p["unresolved_constraints"] and p["annotations"][0]["source"] == "user_provided"


def test_plot_preview_without_dimensions_warns():
    p = plot_preview({})
    assert p["geometry"] is None and p["warnings"]


def test_report_is_built_from_snapshot_only():
    snap = {"id": "a1", "created_at": "2026-10-13T00:00:00+00:00", "status": "incomplete", "input_snapshot": {"x": 1},
            "calculation_results": {"checks": [{"check_id": "c1", "status": "not_evaluated"}, {"check_id": "c2", "status": "passed"}]}}
    r = build_report(snap)
    assert r["unevaluated_checks"] == ["c1"] and r["input_snapshot"] == {"x": 1} and r["disclaimer"] == DISCLAIMER


def test_feedback_categories():
    for c in FEEDBACK_CATEGORIES:
        assert validate_category(c) == c
    with pytest.raises(ValueError):
        validate_category("rude")
