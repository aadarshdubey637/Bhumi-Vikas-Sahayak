# Security

## Secrets and configuration
Environment only (`pydantic-settings`; `.env` is git-ignored; `.env.example` has names only). `ANTHROPIC_API_KEY` and `API_KEY_HASHES` are `SecretStr` (not in `repr`/`model_dump_json`); logs redact key-shaped strings. No secrets in Docker images (`.dockerignore` excludes `.env`, DBs, data).
Production (`APP_ENV=production`) refuses: wildcard CORS, SQLite, `AUTH_MODE=none`.

## Authentication and authorization
`AUTH_MODE=api_key`: clients send `X-API-Key`; the server keeps only SHA-256 digests mapped to an **owner id** it controls (`API_KEY_HASHES=alice:<digest>`), compared in constant time. The caller can never choose an owner id.
Projects, assessments, reports, feedback and conversations are owner-scoped; another user's resource returns **404** (existence is not revealed). Rows created while auth was off have no owner and are inaccessible once auth is on.
`/health` and `/ready` are open. Key issuance/rotation is out of scope (edit the env var); for SSO/JWT replace `core/security.authenticate`. There is no user database and no roles/admin API.

## Input and API hardening
Strict Pydantic models (`extra=forbid`), question length limit, request body limit (413, also for chunked bodies), strict numeric/unit/dimension validation, safe paths in scripts (no user-supplied paths in the API),
SQLAlchemy parameterised queries, restrictive CORS (explicit origins, no credentials), per-client rate limit (429), request timeout (504), generic 500 with request id, validation errors never echo submitted values.
Rate limit is in-process and ignores `X-Forwarded-For`; behind a proxy enforce limits there as well.

## LLM safety
Optional and off by default. Retrieved legal text is fenced as untrusted data; the model returns JSON validated by Pydantic; output is rejected if it cites unknown evidence ids, introduces numbers not in the evidence/facts/calculations,
mentions rules not in the evidence, or claims compliance/approval; size, token, timeout and retry limits apply; nothing the model returns is executed or written to the rule store. Provider failure never blocks lookup, search or calculations.

## Logging
JSON logs with request id, method-less path, status, duration. Bodies, headers, API keys and question text are not logged. Third-party HTTP client logs are set to WARNING.

## Deployment checklist
TLS at the proxy; `APP_ENV=production`; PostgreSQL with a non-default password; `AUTH_MODE=api_key`; explicit `CORS_ORIGINS`; gateway rate limits for multiple replicas; run migrations once (`alembic upgrade head`) before scaling out (`AUTO_MIGRATE` is for single-replica development);
mount `data/` read-only; back up the database (it holds review decisions and assessment history).

## Not done
Dependency vulnerability scanning, container image scanning, penetration testing, audit logging of reviewer actions, and secret rotation tooling.
