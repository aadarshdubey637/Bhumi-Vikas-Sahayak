import json

import pymupdf
import pytest

from app.ingestion.pdf import compare_with_fulltext, english_hindi_structure_check, extract_pdf
from scripts import build_index, ingest_jsonl, ingest_pdfs, validate_rules
from tests.conftest import BACKEND, FIX, SYN_JSONL

RAW = BACKEND / "data/raw"


def _pdf(path, pages):
    d = pymupdf.open()
    for t in pages:
        pg = d.new_page()
        if t:
            pg.insert_text((72, 72), t)
    d.save(path)
    d.close()


def test_extract_pdf_pages_status_and_headers(tmp_path):
    p = tmp_path / "s.pdf"
    _pdf(p, ["Rule 12\nSYNTHETIC page body text that is long enough to count as text.", "", "Rule 13\nAnother synthetic page with enough characters here."])
    pages, _ = extract_pdf(p, "DOC", "en", with_tables=False)
    assert [x.page for x in pages] == [1, 2, 3]
    assert [x.extraction_status for x in pages] == ["ok", "empty_text_layer", "ok"]
    assert pages[0].header_rule == "12" and pages[1].searchable is False


def test_compare_with_fulltext_and_structure_check(tmp_path):
    p = tmp_path / "s.pdf"
    _pdf(p, ["Rule 1\nSYNTHETIC same text on page one for the comparison test."])
    pages, _ = extract_pdf(p, "D", "en", with_tables=False)
    same = compare_with_fulltext(pages, {1: pages[0].text})
    diff = compare_with_fulltext(pages, {1: "completely different content here"})
    assert same["pages_below_threshold"] == [] and len(diff["pages_below_threshold"]) == 1
    assert compare_with_fulltext(pages, {})["pages_missing_in_fulltext"] == [1]
    hi, _ = extract_pdf(p, "H", "en", with_tables=False)
    assert english_hindi_structure_check(pages, hi)["page_count_match"] is True


@pytest.mark.real_corpus
def test_real_pdfs_english_readable_hindi_flagged():
    en, hi = RAW / "MP_Bhumi_Vikas_Rules_2012_upto_2025-03-06_EN.pdf", RAW / "MP_Bhumi_Vikas_Rules_2012_upto_2025-03-06_HI.pdf"
    if not (en.exists() and hi.exists()):
        pytest.skip("official PDFs not present")
    pe, _ = extract_pdf(en, "EN", "en", with_tables=False)
    ph, _ = extract_pdf(hi, "HI", "hi", with_tables=False)
    assert len(pe) == len(ph) == 108 and all(p.searchable for p in pe)
    assert all(p.extraction_status == "legacy_font_encoding" and not p.searchable for p in ph)  # honest: not Unicode


# ---- scripts -------------------------------------------------------------------------------------------
def test_ingest_jsonl_dry_run_writes_nothing(tmp_path, capsys):
    rc = ingest_jsonl.main(["--input", str(SYN_JSONL), "--fulltext", str(tmp_path / "none.txt"), "--dry-run",
                            "--corpus-out", str(tmp_path / "c.jsonl"), "--report-out", str(tmp_path / "r.json")])
    assert rc == 0 and not (tmp_path / "c.jsonl").exists() and "accepted=4" in capsys.readouterr().out


def test_ingest_missing_input_gives_instructions(tmp_path, capsys):
    assert ingest_jsonl.main(["--input", str(tmp_path / "missing.jsonl")]) == 2
    assert "docs/ingestion.md" in capsys.readouterr().err


def test_invalid_records_are_reported_not_dropped(tmp_path, capsys):
    bad = tmp_path / "bad.jsonl"
    good = SYN_JSONL.read_text(encoding="utf-8").splitlines()
    bad.write_text("\n".join([good[0], "{not json", json.dumps({"rule": "", "title": "t", "part": "p", "page_start": 1, "page_end": 1, "text": "x"}),
                              json.dumps({"rule": "3", "title": "t", "part": "p", "page_start": 5, "page_end": 2, "text": "3. Text"}), good[0]]), encoding="utf-8")
    rc = validate_rules.main(["--input", str(bad), "--fulltext", str(tmp_path / "x")])
    out = capsys.readouterr().out
    assert rc == 1 and "accepted=1" in out and "rejected=4" in out and "REJECTED line 2" in out and "DUPLICATE_RULE" in out


def test_load_db_then_validate_and_build_index(tmp_path, capsys, monkeypatch):
    url = f"sqlite:///{tmp_path / 'x.db'}"
    monkeypatch.setenv("DATABASE_URL", url)
    assert ingest_jsonl.main(["--input", str(SYN_JSONL), "--fulltext", str(tmp_path / "n"), "--load-db", "--migrate",
                              "--corpus-out", str(tmp_path / "c.jsonl"), "--report-out", str(tmp_path / "r.json"),
                              "--pdf-en", str(tmp_path / "no.pdf"), "--amendments", str(FIX / "synthetic_amendments.json"),
                              "--reviews", str(tmp_path / "none.jsonl")]) == 0
    assert "versions_created\": 4" in capsys.readouterr().out
    assert validate_rules.main(["--input", str(SYN_JSONL), "--fulltext", str(tmp_path / "n"), "--db"]) == 0
    assert build_index.main(["--manifest", str(tmp_path / "m.json")]) == 0
    m = json.loads((tmp_path / "m.json").read_text())
    assert m["rules"] == 4 and m["problems"] == []


def test_build_index_without_data_explains(tmp_path, capsys, monkeypatch):
    monkeypatch.setenv("DATABASE_URL", f"sqlite:///{tmp_path / 'e.db'}")
    from app.db.migrate import upgrade_to_head
    upgrade_to_head(f"sqlite:///{tmp_path / 'e.db'}")
    assert build_index.main(["--manifest", str(tmp_path / "m.json")]) == 2
    assert "ingest_jsonl" in capsys.readouterr().err


def test_validate_db_detects_verified_without_notes(tmp_path, monkeypatch):
    from sqlalchemy import select

    from app.db.session import make_engine, make_session_factory
    from app.models import RuleVersion
    url = f"sqlite:///{tmp_path / 'v.db'}"
    monkeypatch.setenv("DATABASE_URL", url)
    ingest_jsonl.main(["--input", str(SYN_JSONL), "--fulltext", str(tmp_path / "n"), "--load-db", "--migrate", "--corpus-out", str(tmp_path / "c"),
                       "--report-out", str(tmp_path / "r"), "--pdf-en", str(tmp_path / "x.pdf"), "--amendments", str(tmp_path / "a"), "--reviews", str(tmp_path / "b")])
    with make_session_factory(make_engine(url))() as s:
        s.scalar(select(RuleVersion)).verification_status = "verified"
        s.commit()
    assert any("without reviewer notes" in p for p in validate_rules.check_db(url))


def test_ingest_pdfs_without_english_pdf(tmp_path, capsys):
    assert ingest_pdfs.main(["--en", str(tmp_path / "no.pdf"), "--out-dir", str(tmp_path)]) == 2
    d = tmp_path / "e.pdf"
    _pdf(d, ["Rule 1\nSYNTHETIC enough text on the page to be considered readable."])
    assert ingest_pdfs.main(["--en", str(d), "--hi", str(tmp_path / "no_hi.pdf"), "--fulltext", str(tmp_path / "nf"), "--out-dir", str(tmp_path / "o"), "--no-tables"]) == 0
    rep = json.loads((tmp_path / "o/pdf_ingestion_report.json").read_text())
    assert rep["inputs"]["en"]["pages"] == 1 and "hi" not in rep["inputs"] and rep["missing_inputs"]


