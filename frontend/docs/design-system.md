# Design system

Single source of truth: `tailwind.config.js` (tokens) + `src/lib/ui.ts` (shared class strings). Restyle by changing tokens, not pages.

## Palette (semantic, used identically everywhere)

| Role | Token | Use |
|---|---|---|
| Ink / navy | `ink`, `nav` | text, sidebar |
| Interactive | `brand` (blue) | links, primary buttons, focus ring, active states |
| Verified | `verified` (teal-green) | only for human-verified results (none exist yet) |
| Pending / unverified | `pending` (amber) | the *normal* state today; never red |
| Error / conflict | `danger` | failures, `source_conflict` |
| Info / conditional | `info` | conditional answers, notes |
| Not established / not evaluated | `muted` | abstentions, unevaluated checks |

Status → colour/icon maps live in `src/lib/status.ts` (`Record<Union, …>`: a new backend status is a compile error). Evaluated checks that pass are
deliberately **not** green overall ("not a compliance determination"). Every badge is icon + text, never colour alone.

Contrast: the text/background pairs used for copy were computed against WCAG 2.x AA (>= 4.5:1); lowest is `ink-faint` on page (5.0:1).
This was a calculation, not an automated audit of the rendered pages (no Lighthouse/axe-in-browser run).

## Layout

- Desktop (>= 1024 px): sticky navy sidebar, collapsible to an icon rail (state kept in memory only).
- Below 1024 px (tablet and phone): hamburger + slide-in drawer (Radix Dialog: focus trap, Escape, focus return).
- Top bar: breadcrumb (from the URL only), backend status pill, language switch (EN / हिं), sign-out when a key is held.
- The disclaimer banner is always present (collapsible). Pages fade in; all motion is `motion-safe:` and off under `prefers-reduced-motion`.
- Text wraps (`overflow-wrap: break-word`) so long citations, rule ids and Devanagari never overflow. Verified with a script: 14 pages x 375 / 768 / 1440 px, no horizontal overflow.

## Navigation shows only what works

Home, AI Rule Assistant, Plot Assessment, Area calculator, Projects, Rules and Regulations, Sources, Feedback, About.
There is deliberately **no "Reports" or "Settings" entry**: reports exist per assessment (`/assessments/:id/report`) but the backend has no list endpoint,
and there are no settings to change. See `BACKEND_GAPS.md`.

## Not used, on purpose

- shadcn/ui, Motion, Recharts: no new dependencies. Radix primitives (already installed) cover dialogs/tabs/tooltips; CSS covers the motion;
  there is no real time-series or aggregate data from the backend worth charting (no invented statistics).
- The Home dashboard shows only live API values: readiness checks, rules loaded, project total, feedback total, recent projects.

## Browser storage

Only the UI language preference (`ns.ui-language`) is stored. Questions, answers, projects and the access key are never written to storage.

## Colour system (October 2026 redesign)

Every colour means one thing everywhere in the product (answers, results, forms, badges). All values are CSS variables in `src/index.css`; light is the default, dark and high contrast are options in the Aa menu. `npm run check:contrast` verifies every pair below against WCAG 2.1 AA and runs as part of `npm run verify`.

| Colour | Meaning | Where you see it | Token |
| --- | --- | --- | --- |
| **Navy** `#0B2A5B` (dark theme: deep navy slate) | Structure and trust | Header, sidebar, the thin saffron-white-green strip | `--nav-bg`, `--top-bg` |
| **Brand blue** | Something you can act on | Every primary button (send, "Check my plot", "Get my exact answer"), links, selected tabs, the one highlighted word in the headline | `brand` |
| **Saffron / amber** | A detail is needed, or the answer depends on it. Never a button colour | The thin strip at the top, the details form, "it depends on your road" tables, pending notes | `accent`, `pending` |
| **Blue** (tint) | Found in the rulebook, within the stated limit, or an explanation | Ticks in "Your plot at a glance", "Looks fine" results, "Based on what you told me" | `info` |
| **Red** | Needs fixing: a figure goes beyond a stated limit | "Needs fixing" results, the building outline in 3D | `danger` |
| **Green** | Reserved: checked by a person. No result carries it yet | (none today) | `verified` |
| **Grey** | Not covered, not checked, or a hint | "Not covered by the rules", "Could not check", helper text | `muted`, `ink-faint` |

Rules: one brand colour only (no gradients, no per-item icon colours); a colour is never the only signal (every state also has an icon and words); amber text on light surfaces uses the darker `accent-text` token; red is never used for "not yet verified" (that is amber, an expected state, not an error); green is never used for anything a person has not verified, so a passing figure is blue, not green.

Contrast results (light theme): body text 17.9:1, secondary text 10.4:1, hints 6.2:1, links 7.8:1, every status pair 5.4:1 or better, input borders 3.9:1.

## Type scale

| Use | Size |
| --- | --- |
| Body | 17 px (1.0625 rem), line height 1.65 |
| Answer headline | 20 px, medium weight |
| Secondary and form text | 15 px |
| Small labels | 13 px minimum |
| Hindi | +6 % size automatically (Devanagari reads smaller at the same size) |
| User control | Aa menu: 100 %, 112.5 %, 125 % for everything |
