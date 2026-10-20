# Evaluation

`python -m scripts.evaluate_rag [--db] [--json-out file]` runs the 17 sample questions (`data/evaluation/sample_questions.md`: 13 EN, 2 HI, 2 out-of-rules) and reports only what the data supports.

## Metrics

| Metric | Definition | Last result (real corpus, unverified) |
|---|---|---|
| Citation validity | every cited evidence id resolves to a stored chunk with page metadata | 72/72 |
| Unsupported-answer handling | the two labelled out-of-rules questions (Q16, Q17) return `not_established` | PASS |
| Version-resolution invariants | never `supported` on unverified evidence; never `verified_current` with an amendment of unknown date | 0 violations |
| Calculation correctness | `data/evaluation/calc_cases.json` (expected values derived from the formulas / exact conversion factors; includes rejection cases) | 8/8 |
| Recall@k, answer correctness | require reviewed labels in `data/evaluation/labels.jsonl` (`{"id": 8, "expected_rules": ["21"]}`) | **not computed** - none supplied, none invented |

Status distribution on the sample: 14 `pending_verification`, 3 `not_established` (Q16, Q17 as intended; **Q4** - see below). No question can be `supported` until rules are human-verified.

## Known failure (found by inspection, not scored)

Q4 ("authority has not replied ... deadline") abstains: best-chunk term coverage 0.33 < 0.4 threshold, because the question's vocabulary ("replied", "miss the deadline") does not overlap the rules' ("deemed",
"communicated"). Queries using the rule's words retrieve Rules 23/27/28/31. I did **not** add a synonym list to fix this, because without reviewed labels that would be tuning to one sample question. Next step: create labels,
measure Recall@k for lexical vs. synonym expansion vs. semantic (`SEMANTIC_ENABLED`), and adopt whichever measurably wins.

## Test methodology

`python -m pytest -q`: 240+ tests, no network, no paid keys. Unit (normalisation, validation, version resolution, status policy, calculations, LLM output validation), integration (DB, migrations on SQLite and live PostgreSQL 16,
ingestion scripts, API with a **synthetic** corpus from `tests/fixtures`), retrieval (hybrid fusion with a fake ranker). Tests marked `real_corpus` use the supplied PDFs. Synthetic fixtures are never loaded outside tests.
Mutation spot-checks (rounding policy, conflict priority) were done on the inherited suite in an earlier session; not repeated for the new modules.

## Limitations

Small, unlabelled question set; abstention threshold (0.4) chosen by inspection, not tuned; Hindi questions are matched against English text only; the live LLM path and semantic embeddings were not exercised.
