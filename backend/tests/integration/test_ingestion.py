"""Ingestion behaviour. Records here are SYNTHETIC test fixtures and never enter the legal corpus."""
import json

from app.ingestion.jsonl import ingest_jsonl, load_corpus, write_corpus


def rec(rule="1", **kw):
    d = {"rule": rule, "title": "SYNTHETIC", "part": "P", "page_start": 1, "page_end": 1, "text": f"{rule}. synthetic text for testing."}
    d.update(kw)
    return d


def write(tmp_path, lines):
    p = tmp_path / "in.jsonl"
    p.write_text("\n".join(x if isinstance(x, str) else json.dumps(x) for x in lines) + "\n", encoding="utf-8")
    return p


def test_invalid_records_are_reported_never_dropped(tmp_path):
    p = write(tmp_path, [rec("1"), "{not json", rec("2", text=""), rec("3", page_start=9, page_end=2), rec("4")])
    records, rep = ingest_jsonl(p)
    assert rep.records_processed == 5 and rep.records_accepted == 2
    assert rep.records_accepted + rep.records_rejected == rep.records_processed
    assert {r["line_no"] for r in rep.rejected} == {2, 3, 4}
    assert [r.rule_key for r in records] == ["1", "4"]


def test_duplicates_rejected_and_listed(tmp_path):
    records, rep = ingest_jsonl(write(tmp_path, [rec("26-B"), rec("26-b")]))
    assert len(records) == 1 and rep.duplicates == ["26-b"]


def test_blank_lines_counted_not_processed(tmp_path):
    _, rep = ingest_jsonl(write(tmp_path, [rec("1"), "", rec("2")]))
    assert rep.blank_lines == 1 and rep.records_processed == 2


def test_nothing_is_marked_verified(tmp_path):
    records, _ = ingest_jsonl(write(tmp_path, [rec("1")]))
    assert records[0].verification_status == "unverified"


def test_exact_original_text_and_official_id_preserved(tmp_path):
    r = rec("26-B", text="26-B. exact   spacing\n  kept.")
    records, _ = ingest_jsonl(write(tmp_path, [r]))
    assert records[0].original_text == r["text"] and records[0].official_rule_id == "26-B"


def test_ingestion_is_idempotent(tmp_path):
    p = write(tmp_path, [rec("1"), rec("2")])
    a, _ = ingest_jsonl(p)
    b, _ = ingest_jsonl(p)
    assert [(x.version_id, x.content_hash) for x in a] == [(x.version_id, x.content_hash) for x in b]


def test_corpus_roundtrip(tmp_path):
    records, _ = ingest_jsonl(write(tmp_path, [rec("1"), rec("2")]))
    out = tmp_path / "corpus.jsonl"
    write_corpus(records, out)
    assert [r.to_dict() for r in load_corpus(out)] == [r.to_dict() for r in records]


def test_page_beyond_source_warns(tmp_path):
    _, rep = ingest_jsonl(write(tmp_path, [rec("1", page_end=50)]), total_pages=10)
    assert "PAGE_RANGE_EXCEEDS_SOURCE" in {i.code for i in rep.issues}


def test_missing_fulltext_is_noted_not_fatal(tmp_path):
    _, rep = ingest_jsonl(write(tmp_path, [rec("1")]), tmp_path / "absent.txt")
    assert any("not found" in n for n in rep.notes)


def test_real_dataset_matches_known_counts():
    from pathlib import Path
    raw = Path(__file__).resolve().parents[2] / "data/raw/bhumi_vikas_rules.jsonl"
    if not raw.exists():
        import pytest
        pytest.skip("raw dataset not present")
    records, rep = ingest_jsonl(raw, raw.parent / "bhumi_vikas_rules_fulltext_by_page.txt", dry_run=True)
    assert (rep.records_processed, rep.records_accepted, rep.records_rejected) == (106, 106, 0)
    assert rep.guide_listed_rules_not_found_as_records_or_embedded == ["26-A"]  # reported, never invented
    assert all(r.verification_status == "unverified" for r in records)
