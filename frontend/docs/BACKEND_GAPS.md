# Backend gaps and limitations

The backend is read-only for this project. Each gap is handled in the frontend as noted. Proposed backend changes are listed at the end, in writing only.

## Verified against the backend code (M0 pre-check)

Checked statically against `backend/app/api/v1/*.py`, `app/schemas/api.py`, `app/main.py` and `.env.example`. The backend was not run.

- 23 operations across 8 routers match the plan. Base path is `/api/v1`. Entry point is `app.main:app_factory --factory`.
- Schemas, literal enums, `extra=forbid` and the `Measurement` value pattern match Section 3.
- CORS: methods GET, POST, PATCH, OPTIONS. Allowed request headers `Content-Type`, `X-API-Key`, `X-Request-ID`. Exposed `X-Request-ID`, `Retry-After`. Credentials off.
- **Correction to the plan:** `GET /ready` returns 200 with `status:"ready"` and `rules_loaded: 0` when no rules are loaded. It returns 503 only when the database or schema check fails. The "no rules" banner must key off `rules_loaded` and `checks.rules_loaded`, not the HTTP status.
- Not yet checked in code: the 413, 429, 504 and `llm_unavailable` error paths (middleware and ask orchestrator).

## Gap list

| ID  | Gap                                                                                       | Frontend handling                                                                             |
| --- | ----------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| G1  | Production DB may hold no rules (`data/` excluded from the image; index built at startup) | Blocking banner when `rules_loaded === 0`; never present empty results as a legal "no answer" |
| G2  | All 106 rules `unverified`; `supported` unreachable                                       | Unverified badge by default; amber styling; About page                                        |
| G3  | No regulatory calculations; `calculations` always `[]`; regulatory checks `not_evaluated` | "Not evaluated" UX; no invented values                                                        |
| G4  | No login, user or key-issuance endpoint; production forces API-key auth                   | `/access-key` page; key held in memory only                                                   |
| G5  | No auth-mode discovery flag                                                               | Lazy 401 detection                                                                            |
| G6  | No `GET /rules` list; Part filter needs exact strings and `query`                         | Search by number or text only; optional Part filter                                           |
| G7  | No PDF or page-image endpoint; `source_url` may be null                                   | Cite page numbers as text; link only if `source_url` is set                                   |
| G8  | No conversation history endpoint                                                          | In-memory thread; lost on reload (stated in UI)                                               |
| G9  | No DELETE; PATCH cannot remove inputs; no status filter on project list                   | Archive via status; client-side filter; upsert-only inputs                                    |
| G10 | `FeedbackOut` has no message; no resolve/update endpoint                                  | List without message; no edit UI                                                              |
| G11 | Report is JSON only                                                                       | Print stylesheet and client JSON download                                                     |
| G12 | No streaming for `/ask`                                                                   | Skeleton and 35 s timeout handling                                                            |
| G13 | No capabilities endpoint (cannot tell if `explain` is configured)                         | Experimental toggle with 503 fallback                                                         |
| G14 | Hindi PDF not searchable; excerpts English only                                           | "Not translated" note                                                                         |
| G15 | Retrieval is lexical and conservative; plausible questions can abstain                    | `not_established` is a normal, explained state                                                |
| G16 | Amendment 2(5)(c) unverified, effective date null                                         | "Effective date unknown" and pending notice                                                   |
| G17 | Rule 26-A absent; Rule 105 page range flag; flattened tables                              | Show flags and table warning; never infer missing rules                                       |
| G18 | Embedded rules (12A, 17A, 25A, 42A, 93A, 93B) have no own versions                        | Banner and link to parent rule                                                                |
| G19 | Rate limit per worker; `X-Forwarded-For` ignored; 2 workers                               | Handle 429; debounce; no polling under 60 s                                                   |
| G20 | CORS exact origins only; Vercel preview URLs blocked                                      | Document; show CORS hint on network failure                                                   |
| G21 | Semantic retrieval and live LLM path untested by the backend authors                      | Treat as best-effort; always show the deterministic answer                                    |
| G22 | 409 `conflict` and `forbidden` codes exist, no route raises 409                           | Generic error handler                                                                         |
| G23 | No numeric confidence anywhere                                                            | Categorical badges only                                                                       |
| G24 | `question` max is 1000 in schema but configurable via `MAX_QUESTION_CHARS`                | Use 1000 client-side; show server 422 message                                                 |

## Update after the integration pass (backend was then modified)

- **G1** is addressed: the image bakes in the rule JSONL and `INGEST_ON_START=1` loads it on boot (not yet verified inside a built image).
- **G19** is addressed in config: one worker by default, `FORWARDED_ALLOW_IPS` documented so the rate limiter can see client IPs behind a proxy.
- **G20** is addressed: optional anchored `CORS_ORIGIN_REGEX` for preview URLs; trailing slashes in `CORS_ORIGINS` are stripped.
- The backend now also serves `GET /` (service info) and rewrites Render-style `postgres://` database URLs.
- G2-G18, G21-G24 are unchanged.

## Proposed backend changes (not implemented)

A `GET /rules` list with Part grouping; an auth-mode and capabilities field on `/health`; a `message` field on `FeedbackOut`; an owner-level `GET /assessments` list; a PDF page-image endpoint.

## Verified against a running backend (2026-10-14)

Backend copy started read-only (SQLite, `alembic upgrade head`, `ingest_jsonl --load-db`: 106 rules / 273 chunks).

- `npm run test:contract`: 23 operations, 9 request models (all `additionalProperties:false`), 9 enums match the client exactly.
- `npm run test:live`: health, ready, plot-area (20 x 10 m = `"200"` sqm), rule search, ask, 422 on unknown field, 422 on `-1` all pass.
- Full flow checked by hand: assess (1 passed + 5 `not_evaluated`, overall `incomplete`), preview (points `[[0,0],[10,0],[10,20],[0,20]]`, road annotation on edge 0), project create/PATCH (upsert), assessment, report 404 -> POST 201 (`unevaluated_checks` = 5, `rule_versions_used` has `version_key`/`content_hash`/`verification_status`), assessment evidence (`page_reference` such as `"78-79"`), feedback 404 for unknown evidence id, `GET /rules/12A` (`embedded_in:"12"`, no versions), Rule 2 amendment `AMD-2026-08-28-R2-5-C` with `effective_date:null`, `explain:true` -> 503 `llm_unavailable`.
- CORS preflight from `http://localhost:5173` allows `GET, POST, PATCH, OPTIONS` and `Content-Type, X-API-Key, X-Request-ID`.

No new backend gaps were found. Part filter UI is intentionally not built (G6): the stored Part strings are truncated and the filter needs `query`.

## Update for the Workbench (2026-10-19)

- **G3 (partly addressed):** `direct_answer.requirements[]` now exposes numeric limits (front/rear open space, Rule 56; floor area, Rule 61) so the client can compare inputs. They are as unverified as the rule text, and `/calculations/assess` still reports every regulatory check as `not_evaluated`.
- **New gaps:** no structured limits for side open space (building-type dependent), Rule 42 Tables 4 and 5 (buildings above 12.5 m), parking or non-residential use; no `built_up_area` among the documented input names although the server accepts it; `steps` and `warnings` are not translated; no endpoint to record an evaluation without creating a conversation row (each `/ask` with context facts persists a conversation).
