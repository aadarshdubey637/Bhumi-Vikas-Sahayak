from app.rules.normalization import RuleRef
from app.services.version_service import (
    Amendment,
    VersionStatus,
    load_amendments,
    resolve_version,
)

REF = RuleRef(base="2", path=("5", "c"))


def v(status="unverified", vid="v1", **kw):
    return {"version_id": vid, "verification_status": status, **kw}


def amd(status="pending_verification", eff=None, path=("5", "c"), rule="2"):
    return Amendment("A1", "t", status, effective_date=eff, affects=[{"rule": rule, "path": list(path)}])


def status(*a, **k):
    return resolve_version(*a, **k).status


def test_rule_missing_from_corpus():
    assert status(REF, [], []) == VersionStatus.insufficient_information


def test_unverified_text_is_pending():
    assert status(REF, [v()], []) == VersionStatus.pending_verification


def test_verified_without_amendments_is_current():
    assert status(REF, [v("verified")], [], "2025-01-01") == VersionStatus.verified_current


def test_pending_amendment_blocks_certainty():
    r = resolve_version(REF, [v("verified")], [amd()])
    assert r.status == VersionStatus.pending_verification
    assert r.linked_amendments[0]["effective_date"] is None  # unknown stays unknown


def test_verified_amendment_without_effective_date():
    assert status(REF, [v("verified")], [amd("verified")]) == VersionStatus.unknown_effective_date


def test_verified_amendment_needs_as_of_date():
    assert status(REF, [v("verified")], [amd("verified", "2026-08-28")]) == VersionStatus.insufficient_information


def test_verified_amendment_in_force_makes_corpus_historical():
    assert status(REF, [v("verified")], [amd("verified", "2026-08-28")], "2026-09-01") == VersionStatus.historical


def test_verified_amendment_not_yet_in_force_uses_corpus_if_within_consolidation():
    assert status(REF, [v("verified")], [amd("verified", "2026-08-28")], "2025-01-01") == VersionStatus.verified_current


def test_as_of_after_consolidation_is_not_current():
    assert status(REF, [v("verified")], [], "2026-01-01") == VersionStatus.unknown_effective_date


def test_overlapping_verified_versions_conflict():
    vs = [v("verified", "a", effective_from="2020-01-01"), v("verified", "b", effective_from="2022-01-01")]
    assert status(REF, vs, []) == VersionStatus.source_conflict


def test_disjoint_verified_versions_do_not_conflict():
    vs = [v("verified", "a", effective_from="2020-01-01", effective_until="2021-12-31"),
          v("verified", "b", effective_from="2022-01-01")]
    assert status(REF, vs, [], "2025-01-01") != VersionStatus.source_conflict


def test_amendment_links_only_to_its_rule_and_clause():
    assert status(RuleRef(base="56"), [v()], [amd()]) == VersionStatus.pending_verification
    assert resolve_version(RuleRef(base="56"), [v()], [amd()]).linked_amendments == []
    assert resolve_version(RuleRef(base="2", path=("3",)), [v()], [amd()]).linked_amendments == []
    assert len(resolve_version(RuleRef(base="2"), [v()], [amd()]).linked_amendments) == 1


def test_real_pending_amendment_register(amendments):
    assert len(amendments) == 1
    a = amendments[0]
    assert a.verification_status == "pending_verification"
    assert a.effective_date is None and a.publication_date is None  # never inferred from the stated date
    assert a.stated_date == "2026-08-28"


def test_load_amendments_missing_file(tmp_path):
    assert load_amendments(tmp_path / "nope.json") == []
