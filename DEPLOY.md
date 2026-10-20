# Deploying NirmaanSetu: backend on Render, frontend on Vercel

Both services deploy from one Git repository (the folder that holds `backend/`, `frontend/` and `render.yaml`).

## 1. Push to GitHub
Create an empty repository on GitHub, then from this folder:
    git remote add origin https://github.com/<you>/<repo>.git
    git push -u origin main

## 2. Backend on Render
1. Render dashboard > New > Blueprint > pick the repository. It reads `render.yaml` and creates the API (Docker) and the PostgreSQL database.
2. When asked for the values marked "sync: false", enter:
   - `CORS_ORIGINS` and `FRONTEND_URL`: the Vercel address from step 3, with https and no trailing slash. If you do not have it yet, put a placeholder, deploy, then edit it after step 3 (the service restarts).
   - `SMTP_HOST`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM`: any SMTP provider. Without them password reset reports "e-mail unavailable". Sign-up and login still work.
3. Wait for the deploy, then open `https://<service>.onrender.com/api/v1/health`. It should answer ok. The first start migrates the database and loads the 106 rules.

Already set by the blueprint: `AUTH_MODE=accounts`, `COOKIE_SAMESITE=none` (sessions are HttpOnly, Secure cookies), `INGEST_ON_START=1`, `WEB_CONCURRENCY=1`.

## 3. Frontend on Vercel
1. Vercel > Add New > Project > import the same repository.
2. Set **Root Directory** to `frontend`. Framework preset: Vite (build `npm run build`, output `dist`; `vercel.json` already adds the SPA rewrite and security headers).
3. Environment variable: `VITE_API_BASE_URL` = `https://<service>.onrender.com` (origin only, no `/api/v1`, no trailing slash). It is baked in at build time, so changing it needs a redeploy.
4. Deploy, then put the Vercel address into Render's `CORS_ORIGINS` and `FRONTEND_URL` (step 2.2).

## 4. Check it works
Open the Vercel address, create an account, sign in, ask a question, refresh (you should stay signed in), sign out.

## Things to know
- **Free tiers.** Render's free web service sleeps when idle (the first request after a pause takes about a minute) and its free PostgreSQL expires after a limited period. Use paid plans before real users.
- **Cookies across two sites.** The app (vercel.app) and the API (onrender.com) are different sites, so the session cookie is a third-party cookie. Safari and some privacy settings block those, which breaks sign-in. The lasting fix is to serve both under one domain you own (for example `app.example.gov.in` and `api.example.gov.in`) and then set `COOKIE_SAMESITE=lax`.
- **Rules are still unverified**, and answers say so. See `LAUNCH_CHECKLIST.md`.
