"""Structured JSON report built strictly from a saved assessment snapshot."""
from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

DISCLAIMER = ("Preliminary information only. Not an official approval, not legal advice, and not a compliance "
              "determination. Source text is from the MP Bhumi Vikas Rules 2012 consolidated to 6 March 2025 and may be superseded.")


def build_report(assessment: dict[str, Any]) -> dict[str, Any]:
    checks = assessment.get("calculation_results", {}).get("checks", [])
    return {
        "report_version": "1",
        "generated_at": datetime.now(UTC).isoformat(),
        "assessment_id": assessment["id"],
        "assessment_created_at": assessment["created_at"],
        "status": assessment["status"],
        "summary": assessment.get("summary"),
        "input_snapshot": assessment.get("input_snapshot"),
        "checks": checks,
        "evidence": assessment.get("evidence", []),
        "rule_versions_used": assessment.get("rule_version_snapshot", []),
        "assumptions": assessment.get("assumptions", []),
        "missing_information": assessment.get("missing_information", []),
        "warnings": assessment.get("warnings", []),
        "unevaluated_checks": [c["check_id"] for c in checks if c.get("status") in ("not_evaluated", "pending_verification")],
        "disclaimer": DISCLAIMER,
    }
