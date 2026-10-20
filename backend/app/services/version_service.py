"""Version resolution + amendment linkage.

Never treats "newest document" as proof of applicability.  An amendment affects a rule
only through an explicit link (``affects``); unknown dates stay unknown.
"""
from __future__ import annotations

import json
from dataclasses import asdict, dataclass, field
from enum import Enum
from pathlib import Path
from typing import Any

from app.rules.normalization import RuleRef


class VersionStatus(str, Enum):
    verified_current = "verified_current"
    historical = "historical"
    pending_verification = "pending_verification"
    source_conflict = "source_conflict"
    unknown_effective_date = "unknown_effective_date"
    insufficient_information = "insufficient_information"


@dataclass
class Amendment:
    amendment_id: str
    title: str
    verification_status: str
    effective_date: str | None = None  # ISO date or None (unknown)
    publication_date: str | None = None
    stated_date: str | None = None
    source_url: str | None = None
    affects: list[dict[str, Any]] = field(default_factory=list)
    summary: str | None = None


@dataclass
class VersionResolution:
    rule_key: str
    status: VersionStatus
    version_ids: list[str]
    reasons: list[str]
    linked_amendments: list[dict[str, Any]] = field(default_factory=list)
    as_of: str | None = None
    corpus_consolidated_to: str | None = None

    def to_dict(self) -> dict[str, Any]:
        d = asdict(self)
        d["status"] = self.status.value
        return d


def load_amendments(path: Path) -> list[Amendment]:
    p = Path(path)
    if not p.exists():
        return []
    data = json.loads(p.read_text(encoding="utf-8"))
    out = []
    for a in data.get("amendments", []):
        out.append(Amendment(
            amendment_id=a["amendment_id"], title=a["title"],
            verification_status=a.get("verification_status", "pending_verification"),
            effective_date=a.get("effective_date"), publication_date=a.get("publication_date"),
            stated_date=a.get("stated_date"), source_url=a.get("source_url"),
            affects=a.get("affects", []), summary=a.get("summary"),
        ))
    return out


def _links(amendment: Amendment, ref: RuleRef) -> bool:
    for aff in amendment.affects:
        if aff.get("rule") != ref.base:
            continue
        a_path = tuple(aff.get("path") or ())
        # no clause named in the query -> the rule as a whole may be affected;
        # clause named -> only if it lies on the same path.
        if not ref.path or a_path[: len(ref.path)] == ref.path or ref.path[: len(a_path)] == a_path:
            return True
    return False


def resolve_version(
    ref: RuleRef,
    versions: list[dict[str, Any]],
    amendments: list[Amendment],
    as_of: str | None = None,
    consolidated_to: str | None = "2025-03-06",
) -> VersionResolution:
    """``versions``: dicts with version_id, verification_status, effective_from, effective_until."""
    if not versions:
        return VersionResolution(ref.key, VersionStatus.insufficient_information, [],
                                 ["rule not present in the ingested corpus"], as_of=as_of,
                                 corpus_consolidated_to=consolidated_to)
    vids = [v["version_id"] for v in versions]
    linked = [a for a in amendments if _links(a, ref)]
    linked_out = [{"amendment_id": a.amendment_id, "title": a.title,
                   "verification_status": a.verification_status, "effective_date": a.effective_date,
                   "stated_date": a.stated_date} for a in linked]
    reasons: list[str] = []

    verified = [v for v in versions if v.get("verification_status") == "verified"]
    if len(verified) > 1 and _overlap(verified):
        return VersionResolution(ref.key, VersionStatus.source_conflict, vids,
                                 ["multiple verified versions with overlapping validity"], linked_out, as_of, consolidated_to)

    for a in linked:
        if a.verification_status != "verified":
            reasons.append(f"amendment {a.amendment_id} is {a.verification_status}; its text and effect are not established")
            return VersionResolution(ref.key, VersionStatus.pending_verification, vids, reasons, linked_out, as_of, consolidated_to)
        if a.effective_date is None:
            reasons.append(f"amendment {a.amendment_id} has no established effective date")
            return VersionResolution(ref.key, VersionStatus.unknown_effective_date, vids, reasons, linked_out, as_of, consolidated_to)
        if as_of is None:
            reasons.append("no as-of date supplied; cannot decide whether the verified amendment applies")
            return VersionResolution(ref.key, VersionStatus.insufficient_information, vids, reasons, linked_out, as_of, consolidated_to)
        if a.effective_date <= as_of:
            reasons.append(f"amendment {a.amendment_id} took effect {a.effective_date}, on or before {as_of}; "
                           "corpus version is historical for the affected part and the amended text is not in the corpus")
            return VersionResolution(ref.key, VersionStatus.historical, vids, reasons, linked_out, as_of, consolidated_to)

    if not verified:
        reasons.append("rule text is ingested from the consolidated PDF but has not been human-reviewed (unverified)")
        if as_of and consolidated_to and as_of > consolidated_to:
            reasons.append(f"as-of date {as_of} is after the corpus consolidation date {consolidated_to}; later changes are not covered")
        return VersionResolution(ref.key, VersionStatus.pending_verification, vids, reasons, linked_out, as_of, consolidated_to)

    if as_of and consolidated_to and as_of > consolidated_to:
        reasons.append(f"as-of date {as_of} is after the corpus consolidation date {consolidated_to}; later changes are not covered")
        return VersionResolution(ref.key, VersionStatus.unknown_effective_date, vids, reasons, linked_out, as_of, consolidated_to)
    return VersionResolution(ref.key, VersionStatus.verified_current, vids,
                             ["verified version; no linked unresolved amendments"], linked_out, as_of, consolidated_to)


def _overlap(vs: list[dict[str, Any]]) -> bool:
    def span(v):
        return (v.get("effective_from") or "0000-00-00", v.get("effective_until") or "9999-12-31")
    spans = sorted(span(v) for v in vs)
    return any(spans[i][1] >= spans[i + 1][0] for i in range(len(spans) - 1))
