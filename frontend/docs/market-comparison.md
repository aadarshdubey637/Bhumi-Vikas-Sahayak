# How NirmaanSetu compares with what already exists, and what we do differently

Research done 2026-10-20 from public web pages. **What is confirmed and what is not is marked.** Nothing here was verified with the departments themselves.

## What exists

| System | What it is | Who uses it | Source / confidence |
| --- | --- | --- | --- |
| MP building permission portal (ABPAS, `mptownplan.gov.in`) | Online filing and tracking of building plan applications with the municipal body; empanelled architects file through their own login | Architects, applicants, municipal staff | Reported by a third-party guide (1acre.in). **Not confirmed**: the official site could not be opened from here (certificate error) |
| MP unified property portal (planned) | Single property ID linked to RERA, Town & Country Planning, building permissions, e-Nagarpalika and Sampada registry; pilots in Indore, Bhopal, Gwalior, then 413 ULBs | Citizens and departments | News reports, July 2026 (Drishti IAS, Free Press Journal). **Reported plan, not live** |
| AutoDCR (SoftTech) and similar | CAD-based scrutiny: the architect uploads layered drawings, the engine checks them against development control rules and reports pass/fail; used in Maharashtra municipal corporations, Himachal Pradesh and others | Architects and scrutiny officers | Vendor case studies. Performance claims are the vendor's own |
| Government of India web guidelines (GIGW 3.0) | The standard government sites are expected to meet: conforms to WCAG 2.1 Level AA, stronger focus on UI/UX and user-centred navigation. The guidelines portal itself ships an accessibility toolbar (high contrast, font size, text spacing, line height) | All government sites | guidelines.india.gov.in. Exact font-size and contrast clauses were **not** readable from the page; WCAG 2.1 AA (4.5:1 text, 3:1 large text) is the working benchmark |

## The gap

Every system above sits **at or after the application**: file the drawings, get them scrutinised, track the file. They assume the user already knows what the rules allow. We found **no** public tool in this search that does the step before: *"I own a 30 × 40 ft plot on a 20 ft road. What can I build, what must I leave open, what will it cost, and what should I ask my architect?"* in plain Hindi or English, citing the rule.

## Where NirmaanSetu fits

**Position: the citizen's pre-application companion.** It does not replace ABPAS or an architect. It helps someone understand the rules and prepare *before* they apply.

| | Filing portals (ABPAS) | CAD scrutiny (AutoDCR) | NirmaanSetu |
| --- | --- | --- | --- |
| Moment in the journey | Apply and track | Check submitted drawings | **Before applying** |
| Main user | Architect, clerk | Architect, scrutiny officer | **Plot owner, no technical background** |
| Input | Forms and drawings | CAD layers | **A question in ordinary words, or a few numbers** |
| Output | Application status, approval | Pass/fail report on a drawing | **A plain explanation with the rule, page and what to do next** |
| Language | Mostly forms in English/Hindi | English | **Hindi and English, spoken or typed** |
| Visual | None | Drawing checks | **Your plot and house in 3D, before you spend on drawings** |
| Evidence | Rule text in the checker | Rule codes in the report | **Every answer cites rule and page; exact text one tap away** |

## Content rules we follow (and why)

1. **Plain language first, citation second.** Answer, why, what to do, then where it comes from.
2. **Say what was understood.** Show the facts taken from the question so the user can correct them.
3. **Both units.** People think in feet and sq ft; the rules are in metres and sq m. Show both.
4. **Never approve, never guess.** Guidance only; "not covered" is a valid answer; unverified rule text is labelled.
5. **Same rules as the official text.** All numbers come from the rule tables in the backend, not from the interface.

## Design decisions taken from this

- **Light, high-contrast default** (government portals are light and read well in sunlight on phones), navy header with a thin saffron-white-green strip, dark mode optional.
- **Accessibility toolbar** (text size, contrast, theme), as on the national guidelines portal. Aims at WCAG 2.1 AA; automated checks run in the test suite, a manual audit by an accessibility specialist is still needed before an official launch.
- **Type scale:** 17 px body (up from 14-15), 20 px answer headline, Hindi at +6 % size and 1.75 line height, adjustable up to 125 %.
- **Structured answer:** *what I understood* → *answer* → *your plot at a glance* → *why* → *what to do next* → *where this comes from* → *details*.

## What still needs a decision from the department

- Whether rule text may be marked "verified" (all 106 rules are currently unverified; a reviewer must sign off).
- The 2026 amendment: its official text is not in the corpus, so it is flagged but not applied.
- Official branding (emblem, department name) and hosting under a `.gov.in` domain.
- Integration with ABPAS (link-outs only today).
