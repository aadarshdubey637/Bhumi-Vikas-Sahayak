# NirmaanSetu — Bhumi Vikas Sahayak

A source-backed assistant for the **Madhya Pradesh Bhumi Vikas Rules, 2012**. Ask a question in English or Hindi, enter your plot, see the proposed house on it in 3D, and check it against the stated open-space and floor-area limits. Every answer points to its rule number and PDF page.

> Not an official approval system. Answers are preliminary pointers to cited rule text with an explicit verification status (all 106 rules are still `unverified`). The local permission office decides.

| Folder | What | Docs |
|---|---|---|
| `backend/` | FastAPI + SQLAlchemy/Alembic; evidence-first search over the rules, optional LLM explanations | [backend/README.md](backend/README.md) |
| `frontend/` | Vite + React + TypeScript UI (English / Hindi), React Three Fiber 3D scene | [frontend/README.md](frontend/README.md) |
| `render.yaml` | Render Blueprint (backend + PostgreSQL); the frontend deploys to Vercel | [Deploy](#deploy) |

## What the app does

- **Workbench** (`/workbench`): three panels on one screen.
  1. **Project inputs**: plot width and depth, road width, building use, height, floors, footprint and gaps, with a target requirement (all open spaces, front, rear or floor area ratio). *Evaluate Compliance* runs the check.
  2. **Rule-to-Geometry Canvas**: a question bar and a 3D / 2D / floor-plan view. The proposed building is a glass volume on the plot beside the street; setback strips are coloured blue (met), red (below the stated minimum) or amber (not judged) and labelled with their rule number. A Legend explains the colours.
  3. **Regulation inspector**: the statutory evaluation, each limit with its rule and page, answers to typed or spoken questions, evidence and history, *Explain with AI* and *Print / Export report*.
  Both side panels fold into slim rails and remember their state. On phones the three panels become Inputs / Canvas / Results tabs.
- **Rule Book** (`/rules`): search the rules and read the exact source text with its PDF page and verification status.
- **History**: the questions asked in this browser tab.
- **Voice guide** and microphone input, English and Hindi.
- **In-app guide**: questions about the app itself ("hi", "how do I build a home from scratch?") are answered locally without calling the rulebook.
- Accounts are optional: visitors use the public tools, signing in lets you save projects.

The tool never produces "compliant": the best outcome is "no violation found in the checks that could be evaluated".

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
# backend
cd backend
.\.venv\Scripts\python -m pytest -q
.\.venv\Scripts\ruff check app scripts tests
.\.venv\Scripts\python -m scripts.validate_rules --db
.\.venv\Scripts\python -m scripts.evaluate_rag --db

# frontend
cd frontend
npm run verify                      # typecheck, lint, tests, build, bundle scan
npm run test:contract               # needs the backend running on :8000
$env:LIVE_API_URL="http://localhost:8000"; npm run test:live
```

`npm run verify` fails by design if a production build contains `localhost:8000`: build for production with the real `VITE_API_BASE_URL` set (and remove any local `.env.local`).

## Deploy

Pushing to `main` redeploys both services when they are connected to this repository.

1. **Render (backend + DB):** `render.yaml` sets `autoDeployTrigger: commit`. First time: New > Blueprint, then set `API_KEY_HASHES`, `CORS_ORIGINS`, `FRONTEND_URL` and the `SMTP_*` values (they are not read from git). Details and caveats: [backend/README.md](backend/README.md#deploying-to-render).
2. **Vercel (frontend):** root `frontend/`, env var `VITE_API_BASE_URL=https://<render-service>.onrender.com` (origin only, no `/api/v1`). `frontend/vercel.json` sets the SPA rewrite and the security headers (CSP allows the microphone for voice input only).
3. Put the Vercel origin into Render's `CORS_ORIGINS`; otherwise the app shows "Cannot reach the server".

After a deploy, open the site, press *Example* then *Evaluate Compliance*, and confirm the result panel and 3D scene load.
