# NirmaanSetu AI - backend

Bilingual (EN/HI), **evidence-first** building-regulation intelligence for the *Madhya Pradesh Bhumi Vikas Rules, 2012*
(consolidated to 6 March 2025). Primary user: building-permission clerks at the Bhopal Municipal Corporation (Track 1, Bhumi Vikas Sahayak).

> **Not an official approval system.** Responses point to cited rule text with an explicit status. Nothing here is a compliance
> determination, and no regulatory value is computed unless its formula has been human-verified (none are yet).

## What is implemented (and verified by running it)

| Area | State |
|---|---|
| **Direct answers** (`app/services/direct_answer.py`): states the answer in the question's language (EN / HI; Hinglish is answered in Hindi) with rule number, PDF page and the verbatim rule lines it came from. Table solvers: Rule 56 front/rear/side open space, Rule 21 fees (residence, shop, shop-cum-residence, high-rise), Rule 61 FAR; answer cards for farm house, validity, deemed approval, electric lines, who signs, documents, changing a plan, Rule 103, lifts, development permission | working; **21/21 golden answers match** (`data/evaluation/golden_answers.json`, values read from the rule text, **awaiting human review**) |
| Ingestion of the supplied 106-rule JSONL (+ page cross-check, report, dry-run, idempotent DB load) | working, run on the real data |
| PDF ingestion (PyMuPDF): EN 108/108 pages readable; HI 108/108 flagged *legacy-font encoded* (not searchable) | working, run on the real PDFs |
| SQLAlchemy models (15 tables) + Alembic migration; SQLite and PostgreSQL 16 | tested on both (live PostgreSQL via `pgserver`) |
| Exact rule-number lookup (`26-B`, `26 B`, `Rule 26(B)`, `2(5)(c)`) + BM25 + filters + pagination | working |
| Optional semantic retrieval + hybrid fusion (RRF) | fusion logic tested with a fake ranker; **real embeddings not tested** |
| Version/amendment resolution (6 statuses), unknown dates stay NULL | working |
| 6 answer statuses, abstention, citation validation | working |
| Deterministic calculations (units, rectangle area, traces) | working; **no regulatory formula is registered** |
| Projects, immutable assessments, evidence, JSON reports, feedback, plot-preview geometry | working |
| Optional LLM explanation (Anthropic) with output validation | validated with a fake provider; **never run against the live API** |
| API-key auth + per-owner isolation, rate limit, body limit, timeout, CORS | tested |
| Boot sequence `docker-entrypoint.sh` (migrate -> ingest -> uvicorn on `$PORT`) | run natively under bash against live PostgreSQL 16 with a Render-style `postgres://` URL, production settings and API-key auth |
| Frontend (`../frontend`) against this API in a real browser (Edge), incl. API-key login | ask, rule lookup/search, calculator, plot check, project create, sources, key flow - all exercised; see root README |
| Dockerfile / docker-compose / `render.yaml` | written; **the image has never been built and the Blueprint never deployed** (Docker daemon was not running where this was reviewed; no Render account used) |

See [Known limitations](#known-limitations) before relying on any output.

## Architecture (short)

`app/api` (FastAPI routers) -> `app/services` (ask workflow, retrieval, version resolution, assessment) -> `app/rules` (normalisation,
calculations) and `app/rag` (chunking, BM25) -> `app/repositories` + `app/models` (SQLAlchemy). The retrieval index is built in memory from
the database at start-up. Details: [docs/architecture.md](docs/architecture.md).

## Requirements

Python **3.12** (the only version the pins were installed and tested on; the Docker image also uses 3.12 - Python 3.14 was not tried).
`pip install -r requirements-dev.txt` (dev/tests) or `requirements.txt` (runtime only). PostgreSQL 16 for production (SQLite for local/tests).
No LLM key is needed for anything except `explain=true`.

## Quick start (local, SQLite)

```bash
cd backend
python3.12 -m venv .venv && source .venv/bin/activate
pip install -r requirements-dev.txt
cp .env.example .env                      # defaults are safe for local use

# place the official files under data/raw/ (see docs/ingestion.md), then:
alembic upgrade head
python -m scripts.ingest_jsonl --load-db  # rules + amendment register -> DB (also writes data/processed/*)
python -m scripts.ingest_pdfs --load-db   # registers EN/HI PDFs, extraction report
python -m scripts.build_index             # verifies the index, writes data/processed/index_manifest.json
uvicorn app.main:app_factory --factory --reload --port 8000
```

Open <http://localhost:8000/docs> (OpenAPI) - health at `/api/v1/health`, readiness at `/api/v1/ready`.
Without data the server still starts; search returns an explicit "no data" note.

## Other commands

```bash
python -m scripts.validate_rules [--db]   # validation only; exit 1 on rejected records / DB problems
python -m scripts.evaluate_rag [--db]     # evaluation on data/evaluation/sample_questions.md
python -m pytest -q                       # full suite (no paid keys; 256 tests, about 40-60 s, mostly the live-PostgreSQL test)
python -m pytest -q -m "not postgres"     # skip the live-PostgreSQL test
ruff check app scripts tests
```

## PostgreSQL / Docker

```bash
cp .env.example .env    # set POSTGRES_PASSWORD
docker compose up --build -d
docker compose --profile tools run --rm ingest     # migrate + ingest + index (data/ is mounted)
```
The backend container runs `alembic upgrade head` on start. **This compose file has not been executed**; the same steps were run
natively against PostgreSQL 16 and SQLite. Production needs `APP_ENV=production`, `AUTH_MODE=accounts` (user accounts with HttpOnly session cookies; see `COOKIE_SAMESITE`, `FRONTEND_URL`, `SMTP_*` for password-reset e-mail) or `AUTH_MODE=api_key` with `API_KEY_HASHES`, and an explicit `CORS_ORIGINS`.

## Deploying to Render

`../render.yaml` (repo root, next to `backend/` and `frontend/`) defines one Docker web service plus one PostgreSQL database
(if your repo root is the backend folder itself, move the file there and delete its `rootDir` line). Steps:

1. Push the repo, then in Render: **New > Blueprint**, pick the repo.
2. Set the two secrets that are deliberately not in the file:
   - `API_KEY_HASHES` = `owner:sha256hex`. Generate with
     `python -c "import secrets,hashlib;k=secrets.token_urlsafe(32);print(k, hashlib.sha256(k.encode()).hexdigest())"`; keep the key, give Render only `owner:<hash>`.
   - `CORS_ORIGINS` = your Vercel origin, e.g. `https://app.example.com` (scheme + host, no path).
3. On boot the entrypoint runs `alembic upgrade head`; with `INGEST_ON_START=1` it then loads the baked-in `data/raw/*.jsonl` and the amendment register into the
   database (idempotent), then starts uvicorn on Render's `$PORT`. Health check `/api/v1/health`; readiness `/api/v1/ready` (`rules_loaded` must be `true`).

Verified: a Render-style `postgres://` `DATABASE_URL` is rewritten to the psycopg 3 driver (unit tests + live PostgreSQL 16); the entrypoint sequence ran against live
PostgreSQL in production mode. **Not verified:** the Docker image build and the Render Blueprint itself - expect small fixes on first deploy.
`plan: free` for the database is a trial tier; check Render's current terms before storing real data. `WEB_CONCURRENCY=1` is intentional (per-process rate limit and index);
`FORWARDED_ALLOW_IPS=*` lets the rate limiter see real client IPs behind Render's proxy. The PDFs are not in the image (`.dockerignore`); `scripts.ingest_pdfs` is a local step.

## Connecting the frontend

The frontend needs exactly one setting, `VITE_API_BASE_URL` = the backend **origin** (no trailing slash, **no `/api/v1`** - the client appends it):
`http://localhost:8000` locally, `https://<service>.onrender.com` in Vercel. Put the frontend's origin in `CORS_ORIGINS` (use `localhost`, not `127.0.0.1`;
`CORS_ORIGIN_REGEX`, anchored, for preview URLs). Allowed: `GET/POST/PATCH/OPTIONS`; headers `Content-Type`, `X-API-Key`, `X-Request-ID`; no credentials.

**Security caveat:** in production every endpoint needs `X-API-Key`. The frontend asks each user to type the key (memory only, never `VITE_*`), which is sound; but a key
*shared* among many users is only as secret as the people holding it. There is no per-user login. For real per-user access replace `core/security.authenticate` with a JWT/OIDC verifier.

## Configuration

All via environment variables - see [.env.example](.env.example). Secrets are read only from the environment; the server stores only SHA-256
digests of API keys. Production refuses wildcard CORS, SQLite and `AUTH_MODE=none`.

## Documentation

[architecture](docs/architecture.md) · [api](docs/api.md) · [data model](docs/data_model.md) · [ingestion](docs/ingestion.md) ·
[rule verification](docs/rule_verification.md) · [evaluation](docs/evaluation.md) · [security](docs/security.md)

## Known limitations

1. **No rule has been human-reviewed.** A direct answer is `supported` when every number comes from quote lines that were matched back to the stored rule text (otherwise no direct answer is shown). That is a check against the official English text, not a legal review; the clerk decides. Answers that assume an input (plot type, height band) are `conditional`; ones that need an input are `insufficient_information`.
2. **Calculations are limited to what is implemented:** open space (Rule 56, buildings up to 12.5 m; taller buildings are pointed to Rule 42), fees (Rule 21 non-cinema), FAR 1.25 residential. Parking, ground coverage, Rule 42 tables, cinema fees and non-residential setbacks are pointers only. The rules fix no number of floors for an ordinary house; the answer says so instead of inventing one.
3. **Amendment of 28 Aug 2026 (Rule 2(5)(c))** has no official text or effective date in the supplied material (a web search found none either). It is never applied: answers state they come from the text consolidated to 6 March 2025; any answer about a plot up to 500 sq m carries a version note, and the development-permission question (sample Q11) is `pending_verification`.
4. **Hindi**: the Hindi PDF is legacy-font encoded, so only the English text is searchable. Hindi *questions* are normalised and matched against English rules.
5. **Retrieval is lexical and conservative.** Romanised Hindi ("Hinglish") is detected and mapped to the rules' English vocabulary through small reviewable glossaries in `app/rag/query.py` (the rule text never says "setback": it says "set back"/"open space"), and off-topic questions still abstain; ranking quality is still BM25-level (e.g. for the sample Hinglish setback question Rule 56 ranks third), which only semantic retrieval could improve and which is untested here. Example: sample Q4 (authority fails to reply) abstains because the user's words don't overlap the rule's vocabulary ("deemed", "communicated"). No reviewed labels exist, so Recall@k is **not computed**.
6. Rule 26-A is named in the guide but absent from the supplied JSONL; it is not invented. Rule 105 lists `page_end=109` on a 108-page PDF (flagged).
7. Rate limiting is per process; use a gateway for multi-replica deployments. Timeout cannot kill a running sync handler thread.
8. Semantic retrieval and the live Anthropic path are untested against real models/APIs. PDF reports are not implemented (JSON only).
9. Assessment evidence is stored as `related_context` (search hits for the reviewer); no rule is ever recorded as "applied" because no verified rule logic exists.
