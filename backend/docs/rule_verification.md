# Rule verification and amendments

## States

`unverified` (ingested, not reviewed) -> `pending_verification` (under review) -> `verified` | `rejected`. Ingestion only ever produces `unverified`.

## How a rule version becomes `verified`

1. A reviewer compares the stored `original_text` (and any table) with the official PDF page(s) and records a decision in `data/verified/rule_reviews.jsonl`:
   `{"version_id": "56@MP-BVR-2012-EN-CONSOL-2025-03-06", "verification_status": "verified", "reviewer_notes": "checked vs PDF pp.62-63 by <name> <date>"}`
2. `python -m scripts.ingest_jsonl --load-db` applies reviews (only `verified|rejected|pending_verification` are accepted). `validate_rules --db` flags any `verified` version without reviewer notes.
3. Restart the API so the in-memory index picks up the status.
Changed text in a later import becomes a *new* unverified version; the earlier decision stays on the old version.

## Making a regulatory calculation available

Register a `RegulatoryFormula` (`app/rules/calculations/registry.py`) with `verification_status="verified"`, its rule references and source version ids, required inputs, units and
conditions - only after the rule version *and* any table values are verified. The registry ships empty. Once a module exists, `detect_missing` derives the required inputs from it and the
assessment check can move from `not_evaluated`. Never add a default for a missing rule.

## Amendments

* The register (`data/pending/amendments_pending.json`) holds the 28 Aug 2026 amendment of Rule 2(5)(c) **exactly as far as the guide establishes it**: `pending_verification`, `effective_date = null`, `publication_date = null`, `original_text = null`.
  The guide's date is kept in `stated_date` and is never promoted. The only source named is a secondary compliance-news article; the official gazette was not located.
* Linking: `RuleAmendmentLink(amendment, rule, clause_path "5/c")`. A query about Rule 2, or 2(5)(c), sees the amendment; 2(1) does not.
* Effect on answers: a linked unverified amendment makes the rule's version status `pending_verification`; a verified amendment without an effective date -> `unknown_effective_date`; a verified amendment needs `as_of`
  to decide `historical`. Rules never become `verified_current` while a linked amendment is unresolved.
* Downstream impact (to a calculation/conclusion) is reported only through `RuleDependency` entries; with none, impact is reported as `not_established`.
* To incorporate it: obtain the official notification -> store it as a `SourceDocument` (`document_type=amendment`) -> fill `publication_date`, `effective_date`, `original_text` from the notification -> review -> set `verified`.
  Then add a new `RuleVersion` for the amended text with `effective_from`.

Sample question 11 (300 sq m plot, "changed in August 2026") therefore returns `pending_verification`, never a definitive answer.
