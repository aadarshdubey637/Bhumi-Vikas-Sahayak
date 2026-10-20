# NirmaanSetu AI — Bhumi Vikas Sahayak (frontend)

Vite + React 18 + TypeScript (strict), Tailwind, TanStack Query, React Router, react-i18next (EN/HI).
Evidence-first UI for the Madhya Pradesh Bhumi Vikas Rules, 2012. Design tokens and layout rules: [docs/design-system.md](docs/design-system.md). It never shows more certainty than the backend returns:
answers are pointers to cited rule text with an explicit status, not compliance determinations.

## Run locally

```bash
npm ci
npm run dev                       # http://localhost:5173; talks to http://localhost:8000 by default
# optional: cp .env.example .env.local   to point dev at a different backend
```

Backend (`../backend`): see `backend/README.md`; its `CORS_ORIGINS` must include `http://localhost:5173` (the default). Use `localhost`, not
`127.0.0.1`, in the browser: those are different origins to CORS.

Node: developed on Node 22; also passes on Node 24 (the Vitest environment keeps Node's own `AbortSignal`, see `src/test/jsdom-native-abort.ts`).

## Workbench (home page, `/`)

One screen for the whole job: **project inputs** (left), **canvas + assistant** (centre), **regulation inspector** (right). Below 1280 px the same panes become tabs
(Inputs / Ask / Canvas / Results).

| Part | What it really does |
| --- | --- |
| Project inputs | Validated with the same zod schemas as the other forms. Sent to the backend: plot area/length/width, road width, building height/width/depth, built-up area, storeys, use, location. The two *gap* fields exist only in the browser (the backend has no such input) and drive the drawing and the setback comparison. If only plot length and width are given, plot area = length x width is sent and the UI says so. |
| Ask | `POST /ask` with the project inputs as `context`; the UI language is sent as `language` (Hindi UI = Hindi answer). The answer is shown as *In simple words* (the backend's own stated answer, never a paraphrase of rule text), *What to do next* (fixed wording from the i18n files plus the missing inputs as "go to field" buttons), the rule number and page as chips that open the cited text, and the exact quotes. `explain=true` (optional AI explanation) still needs `LLM_PROVIDER` on the server. |
| Compliance | `POST /calculations/assess` + `POST /ask` with a fixed setback/FAR question. The backend returns **structured limits** (`direct_answer.requirements`: front and rear minimum open space from Rule 56, maximum floor area from Rule 61) taken verbatim from the rule tables; `src/lib/compliance.ts` compares your numbers with them. Outcomes are per requirement: *possible violation*, *within the stated limit*, *needs input*, *not evaluated*. The best overall result is "no violation found in the checks that could be run" — never "compliant" — and every result says the rule text is not human-verified. Side open space, buildings above 12.5 m (Rule 42 tables), non-residential use, parking and fees are listed as not evaluated. |
| Canvas | Dependency-free SVG: 2D plan and a drag/scroll/keyboard-rotatable 3D view (own orthographic projection, `src/lib/projection.ts`). Always labelled "Illustrative preview · not a verified design"; rule limits are drawn as dashed amber zones only after an evaluation and are marked stale when inputs change; assumed building positions are dashed and labelled. |
| Voice | Speech input (Web Speech API: Chrome/Edge/Safari, the browser may send audio to its vendor) fills the question box; the mic stays visible and explains when unsupported or denied. Every answer has Listen / Pause / Resume / Stop (speech synthesis, chunked so long answers are not cut off); it warns when no voice for the answer language is installed. |
| History / reset | Answers and inputs are kept in `sessionStorage` (this tab only, gone when it closes) so a reload does not lose them; the History tab lists the questions; Reset clears inputs, conversation, results and stops speech. |

Tests: `src/lib/workbench.test.ts` (form model, compliance, answer view, projection), `src/pages/workbench.test.tsx` (page, MSW). The end-to-end run used for sign-off is described in `STATUS.md`.

## Scripts

| Script                  | What it does                                                                                                                             |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run verify`        | typecheck, lint, tests (129), production build, bundle scan (the gate)                                                                         |
| `npm test`              | Vitest + Testing Library + MSW (mocks live only in `src/test`)                                                                           |
| `npm run test:contract` | compares the client with a running backend's `/openapi.json` (`CONTRACT_API_URL`, default `http://localhost:8000`); skips if unreachable |
| `npm run test:live`     | optional smoke test; needs `LIVE_API_URL` (+ `LIVE_API_KEY` from the shell only)                                                         |

## Configuration

One variable: `VITE_API_BASE_URL` (no trailing slash, no `/api/v1`). It is inlined at build time and public: never put a key in it.
`npm run dev` falls back to `http://localhost:8000` when it is unset. **Production builds have no fallback**: they require an explicit `https://` URL
(localhost allowed only for local work); otherwise a configuration-error screen is shown. A leftover `.env.local` with a localhost URL makes `npm run verify`'s bundle scan fail on purpose.
`src/config/env.ts` is the only reader of `import.meta.env`; `src/api/client.ts` is the only caller of `fetch`.

## Deploy (Vercel + Render)

1. Vercel: framework Vite, root `frontend/`, build `npm run build`, output `dist`, Node 20+.
2. Vercel env var (Production): `VITE_API_BASE_URL=https://<your-render-service-origin>`; redeploy after changing it.
3. Backend (Render) must have: `APP_ENV=production`, `AUTH_MODE=api_key`, `API_KEY_HASHES=owner:sha256hex`, and
   `CORS_ORIGINS=https://<your-vercel-production-domain>` (exact origin, no trailing slash; `*` is rejected in production).
   Vercel preview URLs are blocked unless listed; the backend also accepts an anchored `CORS_ORIGIN_REGEX`
   (e.g. `^https://nirmaansetu-[a-z0-9-]+\.vercel\.app$`) for them.
4. The backend image bakes in the rule JSONL and loads it into an empty database on boot when `INGEST_ON_START=1`
   (set in the repo-root `render.yaml`). Check `/api/v1/ready` shows `rules_loaded: true` before testing the UI; if it is
   `false` this UI shows a blocking banner.

Not verified: the Vercel deployment and the Render Blueprint have not been run; only local builds and local servers were tested.

## Access key (auth mode A)

Users type their personal key at `/access-key`. It is kept in memory only (optional `sessionStorage` behind a checkbox, off by default),
never in `localStorage`, URLs or `VITE_*`. The app detects that a key is needed from the first `401` (the backend exposes no auth-mode flag).

## Known limitations (see `docs/BACKEND_GAPS.md`)

All 106 rules are unverified, so answers show as "pointer — not yet human-verified"; no regulatory calculation exists (setbacks, FAR, height,
parking, fees are "not evaluated"); no server-side PDF (print stylesheet + JSON download instead); conversation history is client-side only.

