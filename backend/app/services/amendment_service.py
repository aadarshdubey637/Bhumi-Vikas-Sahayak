"""Amendment impact analysis (dependency-gated)."""
from __future__ import annotations

from typing import Any

from app.rules import registry
from app.services.version_service import Amendment


def impact(amendment: Amendment) -> dict[str, Any]:
    """Report what the amendment is *established* to affect.

    Direct rule links come from ``amendment.affects``.  Downstream calculation/conclusion
    impacts are reported only via verified dependencies; otherwise they are listed as
    unknown rather than guessed.
    """
    direct = [a["rule"] for a in amendment.affects]
    downstream = [
        {"rule": d.source_rule, "target": d.target, "type": d.dependency_type, "description": d.description}
        for rule in direct
        for d in registry.dependencies_for(rule)
    ]
    return {
        "amendment_id": amendment.amendment_id,
        "verification_status": amendment.verification_status,
        "directly_linked_rules": direct,
        "established_downstream_impacts": downstream,
        "downstream_impact_status": "established" if downstream else "not_established",
        "note": None if downstream else "No verified dependency links this amendment to any calculation or conclusion.",
    }
