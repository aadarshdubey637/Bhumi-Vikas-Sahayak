# Build status

M0–M10 implemented and verified with `npm run verify` (typecheck, lint, 72 tests, build, bundle scan).
Contract test and live smoke test pass against a locally running copy of the backend (see docs/BACKEND_GAPS.md).

Not done / limited: no Playwright browser run, no Lighthouse run, no 375/768/1280 px visual check (responsive behaviour is by Tailwind
classes only and untested in a real browser), Hindi strings were written by the assistant and need a native-speaker review.

## UI redesign pass (2026-10-14)

Verified by running it: `npm run verify` (typecheck, lint, 85 tests, build, bundle scan); Playwright-driven Edge against the real backend for ask, rule lookup/search,
calculator, plot check, project create, sources, feedback, the API-key login, the mobile/tablet drawer, sidebar collapse, Hindi switch + reload persistence,
toast, reduced motion; programmatic horizontal-overflow check of 14 pages at 375 / 768 / 1440 px (none). Fixed along the way: measurement fields overflowed on phones,
a dashboard-to-Ask hand-off dropped under React StrictMode, language reset on reload, missing favicon, dev server dead-ending without `.env.local`.

Still not done: no Lighthouse run, no automated in-browser accessibility audit (contrast was computed from tokens), no real-device test (desktop Edge with emulated viewports only),
Hindi strings need native-speaker review, the plot preview SVG was not redesigned (it is unchanged).

## UI redesign v2 (2026-10-14)

What changed: light collapsible sidebar and new NirmaanSetu logo (bridge over a building baseline; original artwork), global rule search in the top bar, navy hero
with an original blueprint illustration, voice dictation, differently sized feature tiles, a live plot sketch drawn from the typed inputs, an evidence side panel on
Ask (shown at >= 1280 px), a status-aware WhatsApp/Phone page, and a new Amendment Tracker. Backend: one new read-only endpoint, `GET /api/v1/amendments`
(stored register as recorded; effective dates are never inferred), with a test. The contract script now expects 29 operations.

Verified by running: backend 393 tests + ruff; frontend typecheck, lint, 93 tests, build, bundle scan, contract test against the restarted backend; headless-browser
screenshots of Home, Ask, Plot, Amendments and WhatsApp & Phone at 1440 px and Home at 390 px (looked at, no horizontal overflow seen).

Not verified: the Ask evidence panel and the voice button were not exercised in a real browser (the panel needs a wide viewport and an answer; voice needs microphone
permission and a browser with the Web Speech API, where audio may go to the browser vendor's service). The plot sketch was only seen in its empty state. No Lighthouse run,
no automated accessibility audit of the new pages beyond the unit-test axe check on the Amendment page. Hindi strings are the assistant's and need native review.

Deliberately not built: "Document Checklist" (the backend has no checklist data; the dashboard shows a "Not available yet" tile instead of an invented list) and any
user profile (the backend has no user model; the top bar shows only the access-key state). WhatsApp/Voice status tiles report configuration only, never "working".

## UI v3: glass design system, guided forms, chat-style assistant (2026-10-14)

Changed: a shared glass/aurora design system (solid on phones and for users who ask for reduced transparency); every page header now has an icon and a one-line
purpose; forms are grouped (plot / road / building) with hints, examples, building-use chips and a floors stepper; the assistant is a chat with avatars, the answer first, the
follow-up question directly under it, the best two cited passages open and the rest behind "Show more", and supporting detail collapsed; Calculator and Projects have
proper empty states and result panels; WhatsApp & Phone has Status / Try WhatsApp / Try phone call / Setup guide tabs with phone-shaped simulations; the app has an error
boundary and route error page (no blank screens), a web manifest, meta tags, a Content-Security-Policy, and a Permissions-Policy that now allows the microphone (it blocked voice input before).

Found and fixed while testing: the API rate limit (60/min per key or IP) is easy to hit when pages are opened quickly; the client now keeps data fresh for 30 s and
`render.yaml` sets 240/min.

Verified by running: backend 393 tests + ruff; frontend typecheck, lint, 99 tests, build, bundle scan, contract test (29 operations). A scripted real-browser run (Playwright + Chromium) against the
PRODUCTION BUILD and a throwaway backend/database passed 18/18: hero question -> cited answer + evidence panel, off-topic question abstains, plot inputs drawn live and the check runs,
calculator 20 m x 10 m = 200, project creation, honest "Not configured" channel status, simulated WhatsApp and phone call answer with Rule 21, amendment tracker, global search, Hindi switch
persisting after reload, skip-link and main landmark, not-found page, and no horizontal overflow on 11 pages at 390, 768 and 1440 px. The only network noise was requests cancelled by navigating away.

Not verified: real WhatsApp/Twilio/speech-to-text providers; Safari/Firefox/real phones; screen-reader use; Lighthouse and load tests; the microphone button (needs a human and permission);
the photo slot in the Home hero (no photo file yet); Hindi wording (assistant-written, needs a native-speaker review). See LAUNCH_CHECKLIST.md.

## Workbench (2026-10-19)

New page `/workbench` (first entry in the sidebar): project inputs, ask-by-text-or-voice, plain-language answers with read-aloud, an interactive 2D/3D plot and building
canvas, and a regulation inspector with a requirement-by-requirement comparison. Description of each part: README, "Workbench".

Backend changes made for it (all covered by backend tests; 466 pass, ruff clean): `direct_answer.requirements[]` (structured front/rear open-space minimums from Rule 56 and the
Rule 61 floor-area cap, read from the same verbatim rule tables as the sentence), Hindi "फ्लोर / फ़्लोर एरिया" now reaches the floor-area answer, and a doubled "।" in merged Hindi headlines.

Verified by running it (throwaway backend on :8010 with the real 106-rule corpus, dev server on :5180, Playwright + Chromium; scripts are not committed):
example inputs -> evaluate -> "no violation found in the checks that could be run" with front 3 m / rear 5 m / floor area 150 sq m against the stated 3 m / 2.5 m / 250 sq m; a 2 m front gap and
18 m deep building -> two possible violations with computed fixes ("move back by 1 m", "reduce depth by 2.5 m"); a building taller than 12.5 m -> not evaluated (Rule 56(5) -> Rule 42);
bad numbers flagged and left out of the question; 3D drag / wheel / keyboard rotate + reset and the 2D plan; English and Hindi answers; Listen / Pause / Resume / Stop and speech
input driven through mocked browser speech APIs (the real engines and microphone were not exercised); backend failure shows an error state; history survives a reload and Reset clears it;
no horizontal overflow at 390 / 820 / 1280 / 1920 px; axe-core (WCAG 2.0/2.1 A and AA) found no violations on the Workbench in EN and HI at 1500 and 390 px after one fix to a shared
sidebar link label. `npm run verify`, backend tests, contract test (29 operations) pass.

Limits, stated plainly:
- **No compliance verdict is possible yet.** All 106 rules are still `unverified`, the pending 2026 amendment's text is not in the corpus, and only these requirements are compared:
  front and rear open space for residential buildings up to 12.5 m (Rule 56) and the maximum floor area (Rule 61, FAR 1.25). Side open space (depends on detached / semi-detached / row type),
  buildings above 12.5 m (Rule 42 tables), non-residential use, parking and fees are shown as "not evaluated". Covered-parking and other FAR exemptions are not applied.
  "Built-up area" is compared as the total of all floors.
- The rear gap assumes plot length is the depth and the front gap is measured from the road-side boundary; the drawing places the plot width along the road.
- "Plain language" means the backend's own stated answer plus fixed explanatory wording. Free-form rewriting of rule text needs the optional AI explanation (`LLM_PROVIDER` on the server, not configured here and not exercised).
  Backend warnings, calculation steps and the quoted rule text stay in English even in a Hindi answer (G14). Hindi UI strings are the assistant's and need native-speaker review.
- Hindi retrieval is keyword-based: some Hindi phrasings still end in "not established" (the answer says so and suggests rewording).
- Text-to-speech and speech input depend on the browser. A Hindi voice must be installed for Hindi read-aloud (the page warns when none is found); speech input is unavailable in Firefox.
- History is per browser tab (`sessionStorage`); the backend has no history endpoint (G8). Evaluations are not saved as assessments; use Plot Assessment / Projects for a stored, reportable assessment.
- The 3D view is a dependency-free orthographic SVG: faces are depth-sorted, there is no lighting, texture or terrain, and the building is always a box.
- Not tested: Safari / Firefox, real phones, screen readers, Lighthouse, load.

## Redesign + 3D Workbench (2026-10-20)

Why earlier passes looked unchanged: they only retuned tokens inside the same light layout (light sidebar, sky-line backdrop, a dashboard home) and the Workbench was an extra route. This pass changed the structure.

- **Look:** dark application header, dark navy sidebar, dark glass side panels around a light centre, a blueprint hero, amber accent. Colours are now CSS variables (`theme-dark` / `panel-dark`), so the whole app can switch palettes per panel. Aurora/skyline backdrop removed.
- **Navigation reduced to six:** Workbench (home), AI Rule Assistant, Plot Assessment, Calculator, Projects, Rulebook & sources. Sources and Amendments are reached from the Rulebook, Feedback from every answer's "Report a problem", WhatsApp/Phone and About from the sidebar footer. Dependencies were checked: nothing relied on a nav entry, only on routes, which all still exist. The old Dashboard page was deleted; `/` is now the Workbench (`/workbench` redirects).
- **Home = Workbench:** question box (EN/HI, mic), example questions, four quick starts, project inputs, 3D workbench, regulation inspector.
- **3D (Three.js via React Three Fiber + drei, lazy-loaded):** geometry is generated from the inputs by `src/lib/house.ts` (foundation, plinth, walls with real window/door openings, slabs, balconies, entrance steps, pitched or flat roof with parapet / stair room / tank, boundary wall, lawn, road, neighbours, trees, procedural textures, shadows). Changing width, depth, floors, height, gaps or use rebuilds it. Construction animation (Play / Pause / Replay / Reset / skip / scrubber / speed) runs the model's own timeline: site, foundation, plinth, each floor's walls and slab, roof, doors and windows, finishing, landscaping. Orbit, zoom, pan, six camera presets, floor-by-floor cut-away with an illustrative room layout, measurement labels, setback zones from the compliance result, 2D site plan and 2D floor plan. No WebGL or a render error falls back to the SVG preview.
- **Calculator:** new "Permissible construction" tab (FAR floor-area cap, per-floor area, front/rear open space, available building depth, all read from the rule tables through the backend) next to the plot-area calculator.
- **Assistant:** the backend now understands "three-storey", "G+2" and "तीन मंजिल", derives plot area from "30 x 40 ft", and answers floor questions with FAR arithmetic and a request for road width and height.

Verified by running: see the end of this section for the exact test results.

Limits: the building is a generated illustration (boxes with openings, a stylised room layout), not an architectural design; balconies and entrance steps project into the front open space and projections are not rule-checked; roof, parapet, stair room and tank rise above the entered height and are listed as assumptions; surroundings and neighbours are generic; software WebGL (headless) was used for testing, real GPUs, phones and Safari were not; the 3D chunk is large (three.js) and loads only when the page is opened; verified compliance still cannot be shown because all rules are unverified.

## Landing, accounts, onboarding (2026-10-21)

**Journey:** `/` landing (navbar, hero with live 3D preview, live answer card, four features, three steps, footer) -> `/signup` or `/login` when needed -> `/dashboard` -> `/workbench`. Visitors can use the workbench, assistant, calculator and rulebook without an account; saving projects, assessments and reports (`/projects`, `/dashboard`, assessments) needs one and sends the visitor to sign in, then back to the page they wanted.

**Real accounts (backend):** `users`, `user_sessions`, `password_resets` (migration 0003); `/api/v1/auth/{register,login,logout,me,forgot-password,reset-password,config}`. Passwords are salted scrypt hashes (standard library); the session is a random token stored only as a SHA-256 digest and sent in an HttpOnly, SameSite cookie (script cannot read it); sessions expire (14 days default) and are removed on logout and on password reset; 5 failed logins lock an account for 15 minutes; login errors and reset requests never reveal whether an e-mail exists; state-changing calls need `X-Requested-With` (CSRF guard); guests can never read or write owned data (`AUTH_MODE=accounts`). Password reset sends a one-time 30-minute link by SMTP (`SMTP_*`); with no SMTP in development the link is written to the server log and the UI says so; in production without SMTP the UI says e-mail is unavailable.

**Verified by running (real backend, Chromium, dev server):** landing content and live card, guest workbench and tour (shown once, skippable, reopenable; stored on the account for signed-in users), guest redirect to sign-in and return, signup validation (empty, bad e-mail, weak password, mismatch, show/hide password), registration, duplicate e-mail, HttpOnly cookie not readable by script, session survives reload and new tab, dashboard and workbench as a user, logout, wrong password, expired session redirect, forgot/reset password (token single-use, old password stops working), Hindi, and no horizontal overflow at 390 and 820 px: 15/15 steps. Backend 484 tests, frontend tests and `npm run verify` (see below).

**Limits:** e-mail addresses are not verified at sign-up; no "change password while signed in", no social login, no per-device session list; rate limiting is per process; the 3D hero preview was exercised in the workbench with software WebGL but the journey ran with WebGL off, so the landing's SVG fallback was what the journey saw; Safari, real phones and screen readers not tested; Hindi text needs native review; contact details are deliberately not invented in the footer (add yours); the three photographs on the landing page are the ones you supplied: confirm you may publish them.
