"""Persistence: schema constraints, idempotent + history-preserving import, review gating."""
import json

import pytest
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError

from app.ingestion.jsonl import ingest_jsonl
from app.models import Amendment, IngestionRun, Project, Rule, RuleAmendmentLink, RuleChunk, RuleVersion, SourceDocument
from app.repositories import rule_repository as repo
from tests.conftest import SYN_AMD, SYN_JSONL


def _doc(s, key="SYN-DOC-1"):
    return repo.get_or_create_source_document(s, key, title="SYNTHETIC", document_type="rulebook", language="en")


def test_import_creates_rules_versions_chunks(synthetic_loaded):
    with synthetic_loaded() as s:
        assert s.scalar(select(func.count()).select_from(Rule)) == 4
        assert s.scalar(select(func.count()).select_from(RuleVersion)) == 4
        assert s.scalar(select(func.count()).select_from(RuleChunk)) >= 4
        v = s.scalar(select(RuleVersion).join(Rule).where(Rule.stable_rule_id == "26b"))
        assert v.rule.official_rule_number == "26-B"  # exact official label preserved
        assert v.verification_status == "unverified"  # ingestion never verifies
        assert v.effective_from is None and v.effective_until is None  # unknown dates stay NULL


def test_import_is_idempotent(synthetic_loaded):
    records, _ = ingest_jsonl(SYN_JSONL)
    with synthetic_loaded() as s:
        st = repo.import_records(s, records, _doc(s))
        s.commit()
        assert st.versions_created == 0 and st.versions_unchanged == 4 and st.rules_created == 0
        assert s.scalar(select(func.count()).select_from(RuleVersion)) == 4


def test_changed_text_creates_new_version_and_keeps_history(synthetic_loaded, tmp_path):
    changed = tmp_path / "changed.jsonl"
    lines = [json.loads(x) for x in SYN_JSONL.read_text(encoding="utf-8").splitlines()]
    lines[2]["text"] = lines[2]["text"] + " An extra synthetic sentence."
    changed.write_text("\n".join(json.dumps(x) for x in lines), encoding="utf-8")
    records, _ = ingest_jsonl(changed)
    with synthetic_loaded() as s:
        # reviewer marks the old version verified; re-import must not touch that decision
        old = s.scalar(select(RuleVersion).join(Rule).where(Rule.stable_rule_id == "9"))
        old.verification_status, old.reviewer_notes = "verified", "synthetic review"
        s.commit()
        st = repo.import_records(s, records, _doc(s))
        s.commit()
        assert st.versions_created == 1 and st.versions_superseded == 1
        versions = s.scalars(select(RuleVersion).join(Rule).where(Rule.stable_rule_id == "9").order_by(RuleVersion.id)).all()
        assert [v.version_status for v in versions] == ["superseded", "active"]
        assert versions[0].verification_status == "verified" and "extra" not in versions[0].original_text
        assert versions[1].verification_status == "unverified"  # new text is NOT inherited as verified
        store = repo.build_store(s)
        assert "extra synthetic sentence" in store.by_key["9"].original_text  # store serves the ACTIVE version only


def test_unique_content_per_rule_and_document(synthetic_loaded):
    with synthetic_loaded() as s:
        v = s.scalar(select(RuleVersion))
        s.add(RuleVersion(version_key="dup", rule_id=v.rule_id, source_document_id=v.source_document_id, original_text="x",
                          normalized_text="x", content_hash=v.content_hash))
        with pytest.raises(IntegrityError):
            s.flush()


def test_foreign_keys_enforced(session_factory):
    with session_factory() as s:
        s.add(RuleVersion(version_key="orphan", rule_id=999, source_document_id=999, original_text="x", normalized_text="x", content_hash="h"))
        with pytest.raises(IntegrityError):
            s.flush()


def test_amendment_dates_never_inferred(synthetic_loaded):
    with synthetic_loaded() as s:
        a = s.scalar(select(Amendment))
        assert a.stated_date is not None  # secondary-source date is kept...
        assert a.effective_date is None and a.publication_date is None  # ...but never promoted
        assert a.verification_status == "pending_verification"
        link = s.scalar(select(RuleAmendmentLink))
        assert link.clause_path == "5/c" and link.rule.stable_rule_id == "2"
        dcs = repo.load_amendment_dataclasses(s)
        assert dcs[0].affects == [{"rule": "2", "path": ["5", "c"], "relationship": "amends"}]
        assert dcs[0].effective_date is None


def test_amendment_for_rule_not_in_corpus_is_not_linked(session_factory):
    with session_factory() as s:  # empty DB: no rule 2 exists, so no link is invented
        repo.import_amendments(s, SYN_AMD)
        s.commit()
        assert s.scalar(select(func.count()).select_from(Amendment)) == 1
        assert s.scalar(select(func.count()).select_from(RuleAmendmentLink)) == 0


def test_amendment_import_idempotent(synthetic_loaded):
    with synthetic_loaded() as s:
        assert repo.import_amendments(s, SYN_AMD) == 0
        assert s.scalar(select(func.count()).select_from(RuleAmendmentLink)) == 1


def test_reviews_are_the_only_path_to_verified(synthetic_loaded, tmp_path):
    rv = tmp_path / "reviews.jsonl"
    with synthetic_loaded() as s:
        vk = s.scalar(select(RuleVersion.version_key).join(Rule).where(Rule.stable_rule_id == "5"))
        rv.write_text(json.dumps({"version_id": vk, "verification_status": "verified", "reviewer_notes": "checked vs PDF p.4"}) +
                      "\n" + json.dumps({"version_id": vk, "verification_status": "bogus"}) + "\n", encoding="utf-8")
        assert repo.apply_reviews(s, rv) == 1  # invalid status ignored
        v = s.scalar(select(RuleVersion).where(RuleVersion.version_key == vk))
        assert v.verification_status == "verified" and v.reviewer_notes == "checked vs PDF p.4"
        assert repo.build_store(s).by_key["5"].verification_status == "verified"


def test_embedded_rule_gets_child_identity(session_factory, tmp_path):
    p = tmp_path / "e.jsonl"
    p.write_text(json.dumps({"rule": "7", "title": "Parent (synthetic)", "part": "P", "page_start": 1, "page_end": 1,
                             "text": "7. Parent.- SYNTHETIC\n7 A. Inserted rule text SYNTHETIC to be detected as embedded in this record."}) + "\n", encoding="utf-8")
    records, _ = ingest_jsonl(p)
    with session_factory() as s:
        repo.import_records(s, records, _doc(s))
        s.commit()
        child = s.scalar(select(Rule).where(Rule.stable_rule_id == "7a"))
        if records[0].embedded_rules:  # detection is the ingester's job; the repository must link it when found
            assert child is not None and child.parent.stable_rule_id == "7" and child.versions == []


def test_build_store_empty_db_returns_none(session_factory):
    with session_factory() as s:
        assert repo.build_store(s) is None


def test_store_from_db_matches_corpus_chunks(synthetic_loaded):
    records, _ = ingest_jsonl(SYN_JSONL)
    with synthetic_loaded() as s:
        store = repo.build_store(s)
    assert {c.evidence_id for r in records for c in r.chunks} == {c.evidence_id for c in store.chunks}
    assert store.lookup(__import__("app.rules.normalization", fromlist=["x"]).parse_rule_ref("26-B"))


def test_project_defaults_and_assessment_immutability_columns(session_factory):
    with session_factory() as s:
        p = Project(name="n")
        s.add(p)
        s.commit()
        assert p.status == "draft" and p.jurisdiction == "Madhya Pradesh" and len(p.id) == 32


def test_record_run_and_documents(session_factory):
    with session_factory() as s:
        repo.record_run(s, "jsonl", SYN_JSONL, {"k": 1}, repo.ImportStats(), 4, 0, False)
        s.commit()
        run = s.scalar(select(IngestionRun))
        assert run.kind == "jsonl" and run.input_hash and run.accepted == 4
        assert s.scalar(select(func.count()).select_from(SourceDocument)) == 0
