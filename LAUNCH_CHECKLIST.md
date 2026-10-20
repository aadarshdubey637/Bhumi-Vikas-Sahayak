# Launch checklist

Honest status as of 2026-10-14. "Done" means run and observed; "Open" means it still needs a person or a real provider.

## Done (run and observed)
- Backend: 393 tests, lint clean; real HTTP checks; migrations on SQLite and PostgreSQL; read-only amendment endpoint.
- Frontend: typecheck, lint, 99 tests, production build, bundle scan (no secrets/URLs baked in beyond the API base), API contract test (29 operations).
- Real-browser run of the production build (Chromium, 18 checks): ask, plot check, calculator, projects, channel demos, amendments, search, Hindi, keyboard, 404, no overflow at 390/768/1440 px.
- Safety behaviour: every rule is "unverified", so answers are labelled "pointer to rule text, not verified"; off-topic questions abstain; WhatsApp/phone report only configuration, never "working".
- Error handling: error boundary, route error page, 429/504/network messages, friendly empty states.

## Open before real users (cannot be done by the code alone)
1. **Rule verification.** All 106 rules are unverified. A named reviewer must check the rule text against the official document and record it (backend/docs/rule_verification.md). Until then the product must be presented as a pointer tool.
2. **Real providers.** WhatsApp (Meta), phone (Twilio), speech-to-text have never been run with real credentials. Follow backend/docs/channels.md and the in-app Setup guide; do not announce them before step 5 passes.
3. **Deploy and verify.** Nothing has been deployed. After deploying: set `AUTH_MODE=api_key` + `API_KEY_HASHES`, `CORS_ORIGINS` to the exact frontend origin, `VITE_API_BASE_URL` (origin only) on Vercel, then rerun the browser checks against the live URLs. Tighten `connect-src` in frontend/vercel.json to the API origin.
4. **Database durability.** Render's free PostgreSQL is a trial tier: use a paid plan and backups before real case data is stored.
5. **Access.** There is no user login, only shared API keys. Decide who holds keys and how they are rotated; all clerks on one key share one rate limit (set to 240/min in render.yaml).
6. **Language review.** A native Hindi speaker should review every Hindi string (UI, voice prompts, WhatsApp replies).
7. **Accessibility and devices.** Test with a screen reader, Safari, Firefox and real phones; run Lighthouse. Only Chromium was driven here.
8. **Branding.** Using the municipal emblem/photo needs the corporation's permission; the Home hero photo slot is `frontend/public/brand/bmc-building.jpg` (not present yet).
9. **Privacy notice.** Browser voice input may send audio to the browser vendor; voice-note transcription sends audio to OpenAI if enabled. Decide whether that is acceptable and tell users.
10. **Monitoring.** Add uptime and error alerts (the API returns request ids; there is no alerting configured).
