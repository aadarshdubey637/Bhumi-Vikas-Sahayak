# Ingestion

## Where files go

| File | Path | Used by |
|---|---|---|
| Rules JSONL (`rule, title, part, page_start, page_end, text`) | `data/raw/bhumi_vikas_rules.jsonl` | `ingest_jsonl` |
| Full text by page | `data/raw/bhumi_vikas_rules_fulltext_by_page.txt` | page cross-check |
| English PDF | `data/raw/MP_Bhumi_Vikas_Rules_2012_upto_2025-03-06_EN.pdf` | `ingest_pdfs`, file hash |
| Hindi PDF | `data/raw/MP_Bhumi_Vikas_Rules_2012_upto_2025-03-06_HI.pdf` | `ingest_pdfs` |
| Sample questions | `data/evaluation/sample_questions.md` | `evaluate_rag` |
| Pending amendment register | `data/pending/amendments_pending.json` | `ingest_jsonl --load-db` |
| Rule review decisions | `data/verified/rule_reviews.jsonl` | `ingest_jsonl --load-db` |

A data dictionary was not supplied; field meanings are inferred from the files. If an input is missing the scripts exit 2 with instructions; nothing is fabricated.

## Commands (run from `backend/`)

```bash
python -m scripts.validate_rules                    # validation only (exit 1 on rejects); add --db to check stored data
python -m scripts.ingest_jsonl --dry-run            # full pipeline, writes nothing
python -m scripts.ingest_jsonl --load-db --migrate  # write corpus/report files and load the DB (idempotent)
python -m scripts.ingest_pdfs --load-db             # page-level PDF extraction + document registration
python -m scripts.build_index                       # verify/rebuild the search index, write manifest
```

## Validation performed (per record, nothing silently dropped)

Invalid JSON; missing/blank fields; invalid page range; page beyond the PDF; empty text; rule-number normalisation (`26-B`, `25(A)`, `17-a`, `42A`);
duplicates (rejected, reported with the first line number); text not starting with its rule number; running headers; amendment markers; table-like text (flagged `unverified`);
heading found on the stated pages of the full-text file (cross-check); inserted rules embedded in a parent record; guide-listed rules not found.
The report (`data/processed/ingestion_report.json`) lists processed/accepted/rejected counts, rejected records with reasons, duplicates, issue counts and notes.
**Ingestion never sets `verified`.**

## Actual result on the supplied data

106 processed / 106 accepted / 0 rejected / 0 duplicates; page cross-check 106/106. Flags: 55 running-header, 55 table-like, 9 amendment-marker, 1 page range beyond the PDF
(Rule 105 `page_end=109`, PDF has 108 pages). Embedded inserted rules found: `12 A`, `17-a`, `25(A)`, `42A`, `93(a)`, `93(b)`. Guide-listed `26-A` was **not found** and was not invented.
DB load: 106 rules + 6 child identities, 106 versions, 273 chunks; a second run changed nothing.

## PDFs

* English: 108/108 pages have a text layer. Its extraction differs from the supplied full-text file on 15 pages (similarity < 0.90) - all 15 are pages with detected tables (34 of 108 pages have tables), consistent with reading-order differences in tables. Not reviewed page by page.
* Hindi: all 108 pages use the legacy Kruti Dev font; the bytes are Latin look-alikes, not Unicode. Pages are stored with `extraction_status=legacy_font_encoding`, `searchable=false`. No font->Unicode conversion is attempted for legal text.
* Tables: `pymupdf find_tables` candidates are written to `data/processed/pdf_tables_candidates_*.jsonl` as `unverified`; they are not loaded into `rule_tables`.
* English-Hindi check is structural only (page count and running-header rule numbers: no mismatches among pages with readable headers; 35 pages have no readable header). Semantic discrepancy detection is impossible while the Hindi text is unreadable.

## Failure handling

A bad line is rejected with its line number and codes; the rest continue. `--strict` makes any rejection fail the run. DB load runs in one transaction. Re-running is idempotent; changed text creates a new version (see data_model.md).
