# NirmaanSetu AI — Bhumi Vikas Sahayak

| Folder | What | Docs |
|---|---|---|
| `backend/` | FastAPI + SQLAlchemy/Alembic; evidence-first search over the MP Bhumi Vikas Rules, 2012 | [backend/README.md](backend/README.md) |
| `frontend/` | Vite + React + TypeScript UI (EN/HI) | [frontend/README.md](frontend/README.md) |
| `render.yaml` | Render Blueprint (backend + PostgreSQL); the frontend deploys to Vercel | below |

Not an official approval system: every answer is a pointer to cited rule text with an explicit status (all 106 rules are still `unverified`).

## Run everything locally (Windows PowerShell; needs Python 3.12 and Node 20+)

```powershell
# --- backend (terminal 1) ---
cd backend
py -3.12 -m venv .venv
.\.venv\Scripts\python -m pip install -r requirements-dev.txt
.\.venv\Scripts\python -m alembic upgrade head
.\.venv\Scripts\python -m scripts.ingest_jsonl --load-db
.\.venv\Scripts\python -m uvicorn app.main:app_factory --factory --port 8000      # http://localhost:8000/docs

# --- frontend (terminal 2) ---
cd frontend
copy .env.example .env.local        # VITE_API_BASE_URL=http://localhost:8000
npm ci
npm run dev                         # http://localhost:5173  (use localhost, not 127.0.0.1: CORS)
```

macOS/Linux: use `python3.12 -m venv .venv && . .venv/bin/activate` and `cp`. Local mode uses SQLite and no API key.

## Checks

```powershell
cd backend;  .\.venv\Scripts\python -m pytest -q; .\.venv\Scripts\ruff check app scripts tests
             .\.venv\Scripts\python -m scripts.validate_rules --db; .\.venv\Scripts\python -m scripts.evaluate_rag --db
cd frontend; npm run verify         # typecheck, lint, tests, build, bundle scan
             npm run test:contract  # needs the backend running on :8000
             $env:LIVE_API_URL="http://localhost:8000"; npm run test:live
```
`npm run verify` fails by design if a production build contains `localhost:8000`: build for production with the real `VITE_API_BASE_URL` set
(and remove any local `.env.local`).

## Deploy

1. **Render (backend + DB):** push, New > Blueprint, set `API_KEY_HASHES` and `CORS_ORIGINS` when prompted. Details and caveats: [backend/README.md](backend/README.md#deploying-to-render).
2. **Vercel (frontend):** root `frontend/`, env var `VITE_API_BASE_URL=https://<render-service>.onrender.com` (origin only, no `/api/v1`), then redeploy.
3. Put the Vercel origin into Render's `CORS_ORIGINS`.

Neither deployment has been performed or verified; see the "not verified" notes in the READMEs.
