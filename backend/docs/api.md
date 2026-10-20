# API reference

Interactive: `/docs` (Swagger UI), `/redoc`, `/openapi.json`. Base path `/api/v1`. All bodies are Pydantic models; unknown request fields are rejected (422);
timestamps are ISO 8601; measurements are `{"value": "20", "unit": "m"}` (value is a decimal *string*).
With `AUTH_MODE=api_key` send `X-API-Key` on every endpoint except `/health` and `/ready`.

## Error envelope (all errors)

```json
{"code": "validation_error", "message": "invalid dimensions", "request_id": "a8817d47...", "details": [{"msg": "NEGATIVE_VALUE: length must not be negative"}]}
```
Codes: `validation_error` 422 · `unauthorized` 401 · `not_found` 404 (also used for other users' resources) · `payload_too_large` 413 · `rate_limited` 429 (+`Retry-After`) ·
`llm_unavailable` 503 · `timeout` 504 · `internal_error` 500. Every response carries `X-Request-ID`. Submitted values are never echoed in errors.

## Endpoints

| Method & path | Purpose |
|---|---|
| GET `/health`, `/ready` | liveness; readiness (DB reachable, schema at head, rules loaded - booleans only) |
| POST `/ask` | evidence-first question answering |
| POST `/rules/search` | exact rule number and/or BM25; filters `rule_number`, `language`, `part`, `document_key`, `verification_status`; `limit` 1-50, `offset` |
| GET `/rules/{rule_id}` | stable identity, versions, linked amendments, version resolution (`?as_of=YYYY-MM-DD`). `rule_id` accepts `56`, `26-B`, `12 A` |
| GET `/rules/{rule_id}/versions` | version history with full `original_text` and source-document metadata |
| GET `/evidence/{evidence_id}` | resolve any citation to the stored record |
| GET `/documents` | registered source documents (hash, page count, verification) |
| POST/GET `/projects`, GET/PATCH `/projects/{id}`, GET `/projects/{id}/assessments` | projects (PATCH upserts supplied inputs by name) |
| POST `/assessments`, GET `/assessments/{id}`, GET `/assessments/{id}/evidence` | immutable assessments with stored evidence |
| POST/GET `/assessments/{id}/report` | JSON report from the saved snapshot (POST regenerates) |
| POST `/calculations/plot-area` | general rectangle area (arithmetic only) |
| POST `/calculations/assess` | implemented checks only; not persisted |
| POST `/plots/preview` | structured geometry for a renderer (no image) |
| POST/GET `/feedback` | `incorrect_answer`, `incorrect_citation`, `outdated_rule`, `incorrect_calculation`, `missing_information`, `other` |

Allowed input names: `plot_area` (area unit), `plot_length`, `plot_width`, `road_width`, `building_height`, `building_length`, `building_width` (length units),
`floors` (whole number, unit `count`), `building_use`, `location` (text). Units: m, cm, mm, ft, in, yd; sqm, sqft, sqyd, acre, hectare (common aliases accepted).

## POST /ask

Request: `{"question": "...", "language": "en|hi|hi-en" (optional), "conversation_id": "8-64 chars" (optional), "project_id": (optional), "context": {"plot_area": {"value":"150","unit":"sqm"}}, "as_of": "2025-06-01", "explain": false}`

Real response (abridged) for *"What is the fee for building permission for a residential house?"* on the unverified corpus:

```json
{
 "answer": "Most relevant provisions found (text below is quoted from the source, untranslated):\n- Rule 21 (Fees), PDF page 35-36 [EV-21-002-f9a2941e]\n...These provisions have not been human-verified, so this is a pointer to the rule, not a confirmed answer. The clerk decides.",
 "status": "pending_verification", "language": "en", "intent": "fees",
 "evidence": [{"evidence_id": "EV-21-002-f9a2941e", "rule_number": "21", "page_start": 35, "page_end": 36,
               "page_precision": "located_in_page_text", "verification_status": "unverified", "retrieval_method": "bm25", "excerpt": "..."}],
 "missing_information": {"prerequisites_established": false, "reason": "No verified calculation module exists for this question type yet ... No values were assumed."},
 "calculations": [], "assumptions": [],
 "warnings": ["Preliminary pointer ...", "No verified calculation module exists for this category; no regulatory value was computed. ...",
              "Cited text contains flattened tables; check any figure against the official PDF page before use.",
              "Source text is ingested ... but has not been human-verified."],
 "follow_up_question": null, "conversation_id": "e106ff9e...", "explanation": null, "explanation_citations": []
}
```
`direct_answer` (null when the rules give none) states the answer for setback, fee and floor-area questions with verbatim `quotes` (rule number, PDF pages, `verified` = slice found in the stored text), `lines`, `steps`, `caveats`, `missing` inputs and `follow_up`.
Its `requirements[]` carry the numeric limits behind the sentence so a client can compare a value without parsing prose: `{key: front_open_space|rear_open_space|max_floor_area, limit: min|max, value: "3.0", unit: m|sqm, rule: "56(1)(a)", basis: "up to 9.0 m"}`.
They are empty unless the needed inputs were given (road width for front, plot area for rear and floor area), for buildings above 12.5 m (Rule 56(5) sends those to Rule 42, which is not machine-checked) and for non-residential use. A requirement is a comparison aid, never a compliance verdict, and is as unverified as the rule text it was read from.
Statuses: `supported`, `conditional`, `insufficient_information`, `not_established`, `source_conflict`, `pending_verification`. `version_status[]` carries per-rule version resolution
and linked amendments (`effective_date: null` = unknown). When facts are stated, a `conversation_id` is returned; send it back to re-evaluate with those facts.
`explain=true` needs `LLM_PROVIDER` configured (else 503 `llm_unavailable`); a failed or invalid model output is dropped with a warning and the deterministic answer is still returned.

## POST /calculations/plot-area

`{"length": {"value": "20", "unit": "m"}, "width": {"value": "10", "unit": "m"}, "output_unit": "sqm", "places": 4}` ->

```json
{"calculation_id": "calc-3a80db0342db", "calculation_type": "plot_area_rectangle", "formula_id": "plot_area_rectangle.v1",
 "formula_source": "arithmetic (length x width); general geometry, not a regulatory formula",
 "inputs": {"length": {"value": "20", "unit": "m"}, "width": {"value": "10", "unit": "m"}},
 "final_value": "200", "output_unit": "sqm", "validation_status": "valid", "verification_status": "not_applicable_general_arithmetic",
 "rule_reference": null, "intermediate": {"length_m": "20", "width_m": "10", "area_sqm_unrounded": "200"},
 "warnings": ["General arithmetic only; this is not evidence of regulatory compliance."], "assumptions": [], "rounding_policy": "ROUND_HALF_UP"}
```
Zero, negative, non-numeric, wrong-dimension or unknown-unit input -> 422.

## Assessments

`POST /assessments {"project_id": "...", "inputs": {...}, "as_of": "..."}` (inputs override the project's). Result: `overall_status` one of
`failed_checks_present`, `incomplete`, `evaluated_checks_passed`; `checks[]` each with `status` (`passed|failed|conditional|not_evaluated|pending_verification`), inputs, rule references,
calculation, explanation, missing information, warnings. Today the only evaluated check is `geometry.plot_area_consistency` (an input-sanity check); the five regulatory checks
(`setbacks`, `floor_area_ratio_coverage`, `height`, `parking`, `permission_fees`) are always `not_evaluated`, and the summary says "Not a compliance determination".
Evidence is stored with the assessment as `related_context` (search hits for the reviewer, *not* applied rules).

## Pagination

List endpoints return `{items, total, limit, offset}`; `limit` 1-100, `offset` 0-100000.
