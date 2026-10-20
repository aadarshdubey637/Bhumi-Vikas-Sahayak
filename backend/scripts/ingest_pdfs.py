"""Page-level PDF ingestion (PyMuPDF) for the official English and Hindi rulebooks.

    python -m scripts.ingest_pdfs                       # extract both, write data/processed/pdf_*.jsonl + report
    python -m scripts.ingest_pdfs --load-db --migrate   # also register the SourceDocuments in the database

No rule text is created or changed by this command; it records page text, extraction status,
unverified table candidates and cross-checks. Pages that cannot be read as Unicode are flagged.
"""
from __future__ import annotations

import argparse
import json
import sys
from collections import Counter
from pathlib import Path

from app.core.config import Settings
from app.ingestion.fulltext import load_pages
from app.ingestion.pdf import compare_with_fulltext, english_hindi_structure_check, extract_pdf
from app.repositories.rule_repository import EN_DOC_KEY, file_sha256

HI_DOC_KEY = "MP-BVR-2012-HI-CONSOL-2025-03-06"


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--en", type=Path, default=Path("data/raw/MP_Bhumi_Vikas_Rules_2012_upto_2025-03-06_EN.pdf"))
    ap.add_argument("--hi", type=Path, default=Path("data/raw/MP_Bhumi_Vikas_Rules_2012_upto_2025-03-06_HI.pdf"))
    ap.add_argument("--fulltext", type=Path, default=Path("data/raw/bhumi_vikas_rules_fulltext_by_page.txt"))
    ap.add_argument("--out-dir", type=Path, default=Path("data/processed"))
    ap.add_argument("--no-tables", action="store_true")
    ap.add_argument("--load-db", action="store_true")
    ap.add_argument("--migrate", action="store_true")
    ap.add_argument("--database-url", default=None)
    a = ap.parse_args(argv)

    missing = [str(p) for p in (a.en, a.hi) if not p.exists()]
    if not a.en.exists():
        print(f"ERROR: English PDF not found: {a.en}. Place the official PDF there (docs/ingestion.md).", file=sys.stderr)
        return 2
    a.out_dir.mkdir(parents=True, exist_ok=True)
    report: dict = {"inputs": {}, "notes": [], "missing_inputs": [m for m in missing if m != str(a.en)]}
    extracted = {}
    for lang, path, key in (("en", a.en, EN_DOC_KEY), ("hi", a.hi, HI_DOC_KEY)):
        if not path.exists():
            continue
        pages, tables = extract_pdf(path, key, lang, with_tables=not a.no_tables)
        extracted[lang] = pages
        (a.out_dir / f"pdf_pages_{lang}.jsonl").write_text(
            "\n".join(json.dumps(p.to_dict(), ensure_ascii=False) for p in pages) + "\n", encoding="utf-8")
        if tables:
            (a.out_dir / f"pdf_tables_candidates_{lang}.jsonl").write_text(
                "\n".join(json.dumps(t, ensure_ascii=False) for t in tables) + "\n", encoding="utf-8")
        report["inputs"][lang] = {
            "path": str(path), "sha256": file_sha256(path), "pages": len(pages), "document_key": key,
            "status_counts": dict(Counter(p.extraction_status for p in pages)),
            "searchable_pages": sum(p.searchable for p in pages), "table_candidates": len(tables),
            "pages_with_legacy_fonts": sum(bool(p.legacy_fonts) for p in pages),
        }
    if a.fulltext.exists() and "en" in extracted:
        report["en_vs_supplied_fulltext"] = compare_with_fulltext(extracted["en"], load_pages(a.fulltext))
    if "en" in extracted and "hi" in extracted:
        report["en_vs_hi_structure"] = english_hindi_structure_check(extracted["en"], extracted["hi"])
    if "hi" in extracted and not any(p.searchable for p in extracted["hi"]):
        report["notes"].append("Hindi PDF text layer is legacy-font encoded (not Unicode); Hindi pages are stored but NOT searchable.")
    (a.out_dir / "pdf_ingestion_report.json").write_text(json.dumps(report, indent=2, ensure_ascii=False), encoding="utf-8")
    print(json.dumps({k: v for k, v in report.items() if k != "en_vs_supplied_fulltext"}, indent=2, ensure_ascii=False)[:3500])
    if "en_vs_supplied_fulltext" in report:
        r = report["en_vs_supplied_fulltext"]
        print(f"en_vs_fulltext: compared={r['pages_compared']} below_threshold={len(r['pages_below_threshold'])}")

    if a.load_db:
        from datetime import date

        from app.db.migrate import upgrade_to_head
        from app.db.session import make_engine, make_session_factory, session_scope
        from app.repositories import rule_repository as repo

        url = a.database_url or Settings().database_url
        if a.migrate:
            upgrade_to_head(url)
        with session_scope(make_session_factory(make_engine(url))) as s:
            for lang, key, title in (("en", EN_DOC_KEY, repo.EN_DOC_TITLE), ("hi", HI_DOC_KEY, repo.EN_DOC_TITLE.replace("English", "Hindi"))):
                if lang not in report["inputs"]:
                    continue
                info = report["inputs"][lang]
                doc = repo.get_or_create_source_document(
                    s, key, title=title, document_type="rulebook", language=lang, consolidation_date=date(2025, 3, 6),
                    document_version="consolidated-2025-03-06", verification_status="unverified")
                doc.file_hash, doc.page_count, doc.local_path = info["sha256"], info["pages"], info["path"]
                if lang == "hi":
                    doc.notes = "Text layer uses a legacy (Kruti Dev) font; not machine-readable as Unicode. Not indexed."
            repo.record_run(s, "pdf", a.en, report, None, len(extracted.get("en", [])), 0, False)
        print("source documents registered in database")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
