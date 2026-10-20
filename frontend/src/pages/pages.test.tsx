import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { afterEach, describe, expect, it } from "vitest";
import { axe } from "vitest-axe";
import * as axeMatchers from "vitest-axe/matchers";
expect.extend(axeMatchers);
import i18n from "@/i18n";
import { keyStore } from "@/auth/keyStore";
import { BackendStatusBanner } from "@/components/layout/BackendStatusBanner";
import { EvidenceCard } from "@/components/evidence/EvidenceCard";
import { StatusBadge } from "@/components/evidence/StatusBadges";
import {
  askInsufficient,
  askNotEstablished,
  askPending,
  errBody,
  EV21,
  reportOut,
  rule25,
  ruleEmbedded,
  versions12,
} from "@/test/fixtures";
import { BASE } from "@/test/msw/handlers";
import { server } from "@/test/msw/server";
import { renderPage } from "@/test/utils";
import About from "./About";
import AccessKey from "./AccessKey";
import Ask from "./Ask";
import Calculator from "./Calculator";
import Feedback from "./Feedback";
import PlotCheck from "./PlotCheck";
import ProjectDetail from "./ProjectDetail";
import Projects from "./Projects";
import Report from "./Report";
import RuleDetail from "./RuleDetail";
import RuleSearch from "./RuleSearch";
import Sources from "./Sources";

afterEach(async () => {
  cleanup(); // unmount before switching language so no component re-renders outside act()
  keyStore.clear();
  await i18n.changeLanguage("en");
});

const ask = async (user: ReturnType<typeof userEvent.setup>, text: string) => {
  await user.type(screen.getByLabelText("Your question"), text);
  await user.click(screen.getByRole("button", { name: "Ask" }));
};

describe("Ask", () => {
  it("pending_verification: amber badge, unverified evidence, pages, warnings, drawer resolves via GET /evidence", async () => {
    const user = userEvent.setup();
    const evidenceCalls: string[] = [];
    server.events.on("request:start", ({ request }) => {
      if (request.url.includes("/evidence/")) evidenceCalls.push(request.url);
    });
    renderPage(<Ask />);
    await ask(user, "fee for residential house");
    expect(await screen.findByText("Pointer to rule text — not yet human-verified")).toBeInTheDocument();
    expect(screen.getAllByText("Unverified source text").length).toBeGreaterThan(0);
    expect(screen.getAllByText(/35–36/).length).toBeGreaterThan(0);
    expect(screen.getByText(/Cited text contains flattened tables/)).toBeInTheDocument();
    expect(screen.getByText("Why no value was calculated")).toBeInTheDocument();
    await user.click(screen.getAllByRole("button", { name: "EV-21-002-f9a2941e" })[0]!);
    expect(await screen.findByText("Cited rule text", { selector: "h2" })).toBeInTheDocument();
    await waitFor(() => expect(evidenceCalls.length).toBeGreaterThan(0));
    server.events.removeAllListeners();
  });

  it("not_established: grey state, no evidence list", async () => {
    server.use(http.post(`${BASE}/ask`, () => HttpResponse.json(askNotEstablished)));
    const user = userEvent.setup();
    renderPage(<Ask />);
    await ask(user, "how do I pay property tax");
    expect(await screen.findByText("Not established in the rules")).toBeInTheDocument();
    expect(screen.getByText("No supporting rule text found.")).toBeInTheDocument();
    expect(screen.queryByRole("article", { name: /Rule \d/ })).toBeNull();
    expect(screen.getByText(/outside the scope/)).toBeInTheDocument();
  });

  it("insufficient_information: follow-up shown and conversation_id reused on turn 2", async () => {
    const bodies: Array<Record<string, unknown>> = [];
    server.use(
      http.post(`${BASE}/ask`, async ({ request }) => {
        bodies.push((await request.json()) as Record<string, unknown>);
        return HttpResponse.json(askInsufficient);
      }),
    );
    const user = userEvent.setup();
    renderPage(<Ask />);
    await ask(user, "150 sqm plot setback");
    expect(
      await screen.findByText("What is the width of the road in front of the plot?"),
    ).toBeInTheDocument();
    expect(screen.getByText("You provided")).toBeInTheDocument();
    await ask(user, "road is 10 m");
    await waitFor(() => expect(bodies).toHaveLength(2));
    expect(bodies[0]).not.toHaveProperty("conversation_id");
    expect(bodies[1]).toMatchObject({ conversation_id: "conv-abcdef123456" });
  });

  it.each([
    ["supported", "Answer quoted from the rule text"],
    ["conditional", "Applies under stated assumptions"],
    ["source_conflict", "Sources conflict"],
  ])("renders the %s badge", async (status, label) => {
    server.use(http.post(`${BASE}/ask`, () => HttpResponse.json({ ...askPending, status })));
    const user = userEvent.setup();
    renderPage(<Ask />);
    await ask(user, "q");
    expect(await screen.findAllByText(label)).not.toHaveLength(0);
  });

  it("explain: 503 llm_unavailable -> exactly one retry with explain=false, note shown, toggle hidden", async () => {
    const bodies: Array<Record<string, unknown>> = [];
    server.use(
      http.post(`${BASE}/ask`, async ({ request }) => {
        const b = (await request.json()) as Record<string, unknown>;
        bodies.push(b);
        return b.explain
          ? HttpResponse.json(errBody("llm_unavailable", "no llm"), { status: 503 })
          : HttpResponse.json(askPending);
      }),
    );
    const user = userEvent.setup();
    renderPage(<Ask />);
    await user.click(screen.getByLabelText("Add AI explanation (experimental)"));
    await ask(user, "fees");
    expect(await screen.findByText(/AI explanation isn't available/)).toBeInTheDocument();
    expect(bodies).toHaveLength(2);
    expect(bodies[1]).not.toHaveProperty("explain");
    expect(screen.queryByLabelText("Add AI explanation (experimental)")).toBeNull();
  });

  it("429 disables submit with a countdown from Retry-After", async () => {
    server.use(
      http.post(`${BASE}/ask`, () =>
        HttpResponse.json(errBody("rate_limited", "slow"), { status: 429, headers: { "Retry-After": "7" } }),
      ),
    );
    const user = userEvent.setup();
    renderPage(<Ask />);
    await ask(user, "fees");
    await user.type(screen.getByLabelText("Your question"), "again");
    const btn = await screen.findByRole("button", { name: /Wait 7 s/ });
    expect(btn).toBeDisabled();
  });

  it("never writes question text to browser storage", async () => {
    const user = userEvent.setup();
    renderPage(<Ask />);
    await ask(user, "secret question text");
    await screen.findByText("Pointer to rule text — not yet human-verified");
    expect(JSON.stringify({ ...localStorage })).not.toContain("secret");
    expect(JSON.stringify({ ...sessionStorage })).not.toContain("secret");
  });

  it("has no serious accessibility violations", async () => {
    const { container } = renderPage(<Ask />);
    expect(await axe(container, { rules: { region: { enabled: false } } })).toHaveNoViolations();
  });
});

describe("Rule search", () => {
  it("blocks an empty submit; shows server note; paginates with offset", async () => {
    const bodies: Array<Record<string, unknown>> = [];
    server.use(
      http.post(`${BASE}/rules/search`, async ({ request }) => {
        bodies.push((await request.json()) as Record<string, unknown>);
        return HttpResponse.json({
          items: [EV21],
          total: 25,
          limit: 10,
          offset: bodies.length > 1 ? 10 : 0,
          note: "Rule 99 was not found in the ingested corpus; no related text was substituted.",
        });
      }),
    );
    const user = userEvent.setup();
    renderPage(<RuleSearch />);
    expect(screen.getByRole("button", { name: "Search" })).toBeDisabled();
    await user.type(screen.getByLabelText("Rule number"), "99");
    await user.click(screen.getByRole("button", { name: "Search" }));
    expect(await screen.findByText(/was not found in the ingested corpus/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Next" }));
    await waitFor(() => expect(bodies).toHaveLength(2));
    expect(bodies[1]).toMatchObject({ rule_number: "99", offset: 10, limit: 10 });
  });

  it("highlights the 'no rules ingested' note as a blocking alert", async () => {
    server.use(
      http.post(`${BASE}/rules/search`, () =>
        HttpResponse.json({
          items: [],
          total: 0,
          limit: 10,
          offset: 0,
          note: "No rules have been ingested yet. Run the ingestion.",
        }),
      ),
    );
    const user = userEvent.setup();
    renderPage(<RuleSearch />);
    await user.type(screen.getByLabelText("Search text"), "fees");
    await user.click(screen.getByRole("button", { name: "Search" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/No rules have been ingested/);
  });
});

describe("Rule detail", () => {
  it("embedded rule shows banner with parent link", async () => {
    server.use(
      http.get(`${BASE}/rules/:id`, () => HttpResponse.json(ruleEmbedded)),
      http.get(`${BASE}/rules/:id/versions`, () => HttpResponse.json(versions12)),
    );
    renderPage(<RuleDetail />, { path: "/rules/:ruleId", route: "/rules/12A" });
    expect(await screen.findByText(/embedded in Rule 12/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open Rule 12" })).toHaveAttribute("href", "/rules/12");
  });

  it("amendment with null effective date reads 'Effective date unknown'", async () => {
    server.use(http.get(`${BASE}/rules/:id`, () => HttpResponse.json(rule25)));
    renderPage(<RuleDetail />, { path: "/rules/:ruleId", route: "/rules/2" });
    expect((await screen.findAllByText("Effective date unknown")).length).toBeGreaterThan(0);
    expect(screen.queryByText("N/A")).toBeNull();
  });

  it("re-fetches with ?as_of= and warns when after the consolidation date", async () => {
    const urls: string[] = [];
    server.use(
      http.get(`${BASE}/rules/:id`, ({ request }) => {
        urls.push(request.url);
        return HttpResponse.json(rule25);
      }),
    );
    const user = userEvent.setup();
    renderPage(<RuleDetail />, { path: "/rules/:ruleId", route: "/rules/2" });
    await screen.findByLabelText("As of date");
    await user.type(screen.getByLabelText("As of date"), "2026-01-01");
    await waitFor(() => expect(urls.some((u) => u.includes("as_of=2026-01-01"))).toBe(true));
    expect((await screen.findAllByText(/later changes are not covered/)).length).toBeGreaterThan(0);
  });

  it("404 shows a page-specific not-found", async () => {
    server.use(
      http.get(`${BASE}/rules/:id`, () => HttpResponse.json(errBody("not_found", "nope"), { status: 404 })),
    );
    renderPage(<RuleDetail />, { path: "/rules/:ruleId", route: "/rules/777" });
    expect(await screen.findByText("Rule not found in the ingested corpus.")).toBeInTheDocument();
  });
});

describe("Calculator", () => {
  it("shows the server trace (200 sqm) with the general-arithmetic chip", async () => {
    const user = userEvent.setup();
    renderPage(<Calculator />);
    await user.click(screen.getByRole("tab", { name: "Plot area" }));
    await user.type(screen.getByLabelText("Plot length"), "20");
    await user.type(screen.getByLabelText("Plot width"), "10");
    await user.click(screen.getByRole("button", { name: "Calculate" }));
    expect(await screen.findByText("General arithmetic — not a regulatory check")).toBeInTheDocument();
    expect(screen.getAllByText(/^200/).length).toBeGreaterThan(0);
    expect(screen.getByText("plot_area_rectangle.v1")).toBeInTheDocument();
  });

  it("maps a 422 to the right field", async () => {
    server.use(
      http.post(`${BASE}/calculations/plot-area`, () =>
        HttpResponse.json(
          errBody("validation_error", "bad", [
            { loc: ["body", "length", "value"], msg: "Length must be positive", type: "value_error" },
          ]),
          { status: 422 },
        ),
      ),
    );
    const user = userEvent.setup();
    renderPage(<Calculator />);
    await user.click(screen.getByRole("tab", { name: "Plot area" }));
    await user.type(screen.getByLabelText("Plot length"), "5");
    await user.type(screen.getByLabelText("Plot width"), "5");
    await user.click(screen.getByRole("button", { name: "Calculate" }));
    expect(await screen.findByText("Length must be positive")).toBeInTheDocument();
  });

  it("client-side validation blocks '1,5' with a dot hint and sends nothing", async () => {
    let called = false;
    server.use(
      http.post(`${BASE}/calculations/plot-area`, () => {
        called = true;
        return HttpResponse.json({});
      }),
    );
    const user = userEvent.setup();
    renderPage(<Calculator />);
    await user.click(screen.getByRole("tab", { name: "Plot area" }));
    await user.type(screen.getByLabelText("Plot length"), "1,5");
    await user.type(screen.getByLabelText("Plot width"), "2");
    await user.click(screen.getByRole("button", { name: "Calculate" }));
    expect(await screen.findByText("Use a dot for decimals.")).toBeInTheDocument();
    expect(called).toBe(false);
  });
});

describe("Plot check", () => {
  it("runs assess + preview; draws SVG; five regulatory checks not evaluated; overall incomplete; no compliance claims", async () => {
    const hit: string[] = [];
    server.events.on("request:start", ({ request }) => hit.push(new URL(request.url).pathname));
    const user = userEvent.setup();
    const { container } = renderPage(<PlotCheck />);
    await user.type(screen.getByLabelText("Plot length"), "20");
    await user.type(screen.getByLabelText("Plot width"), "10");
    await user.click(screen.getByRole("button", { name: "Run check" }));
    expect(await screen.findByTestId("plot-polygon")).toBeInTheDocument();
    expect(screen.getAllByText("Not evaluated — no verified rule logic")).toHaveLength(5);
    expect(screen.getByText("Incomplete — some requirements not evaluated")).toBeInTheDocument();
    expect(screen.getByText(/Not saved/)).toBeInTheDocument();
    expect(hit).toEqual(expect.arrayContaining(["/api/v1/calculations/assess", "/api/v1/plots/preview"]));
    expect(container.textContent ?? "").not.toMatch(/\b(compliant|approved)\b/i);
    const res = await axe(container, { rules: { region: { enabled: false } } });
    expect(res).toHaveNoViolations();
    server.events.removeAllListeners();
  });
});

describe("Projects", () => {
  it("lists projects and hides archived by default", async () => {
    const p = (id: string, name: string, status: string) => ({
      id,
      name,
      status,
      building_use: "residential",
      jurisdiction: "Madhya Pradesh",
      inputs: {},
      input_details: [],
      created_at: "2026-10-01T00:00:00Z",
      updated_at: "2026-10-02T00:00:00Z",
    });
    server.use(
      http.get(`${BASE}/projects`, () =>
        HttpResponse.json({
          items: [p("a1", "Live plot", "active"), p("b2", "Old plot", "archived")],
          total: 2,
          limit: 20,
          offset: 0,
        }),
      ),
    );
    const user = userEvent.setup();
    renderPage(<Projects />);
    expect(await screen.findByText("Live plot")).toBeInTheDocument();
    expect(screen.queryByText("Old plot")).toBeNull();
    await user.click(screen.getByLabelText("Show archived projects"));
    expect(screen.getByText("Old plot")).toBeInTheDocument();
  });

  it("a project owned by someone else (404) shows not-found", async () => {
    server.use(
      http.get(`${BASE}/projects/:id`, () => HttpResponse.json(errBody("not_found", "x"), { status: 404 })),
      http.get(`${BASE}/projects/:id/assessments`, () =>
        HttpResponse.json(errBody("not_found", "x"), { status: 404 }),
      ),
    );
    renderPage(<ProjectDetail />, { path: "/projects/:id", route: "/projects/foreign1" });
    expect(await screen.findByText("Project not found.")).toBeInTheDocument();
  });
});

describe("Report", () => {
  it("404 -> Generate report -> renders disclaimer, grouped unevaluated checks, rule versions", async () => {
    server.use(
      http.get(`${BASE}/assessments/:id/report`, () =>
        HttpResponse.json(errBody("not_found", "none"), { status: 404 }),
      ),
    );
    const user = userEvent.setup();
    renderPage(<Report />, { path: "/assessments/:id/report", route: "/assessments/asm-0001/report" });
    await user.click(await screen.findByRole("button", { name: "Generate report" }));
    expect((await screen.findAllByText(reportOut.disclaimer)).length).toBe(2);
    expect(screen.getByText("Not evaluated — requires verified rules")).toBeInTheDocument();
    expect(screen.getByText("abc123")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Print / Save as PDF" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Download JSON" })).toBeInTheDocument();
  });
});

describe("Feedback", () => {
  it("lists category/status without a message column; offers 6 categories", async () => {
    server.use(
      http.get(`${BASE}/feedback`, () =>
        HttpResponse.json({
          items: [
            {
              id: "f1",
              assessment_id: null,
              evidence_id: "EV-21-002-f9a2941e",
              category: "outdated_rule",
              resolution_status: "open",
              created_at: "2026-10-01T00:00:00Z",
            },
          ],
          total: 1,
          limit: 20,
          offset: 0,
        }),
      ),
    );
    renderPage(<Feedback />);
    expect(await screen.findByText("Open")).toBeInTheDocument();
    expect(screen.queryByRole("columnheader", { name: /message/i })).toBeNull();
    expect(within(screen.getByLabelText("Category")).getAllByRole("option")).toHaveLength(6);
  });

  it("404 on an unknown evidence id gives a friendly message", async () => {
    server.use(
      http.post(`${BASE}/feedback`, () =>
        HttpResponse.json(errBody("not_found", "evidence"), { status: 404 }),
      ),
    );
    const user = userEvent.setup();
    renderPage(<Feedback />);
    await user.type(await screen.findByLabelText("What is wrong?"), "wrong page");
    await user.type(screen.getByLabelText("Evidence ID (optional)"), "EV-0-0-zzzz");
    await user.click(screen.getByRole("button", { name: "Send feedback" }));
    expect(await screen.findByText(/could not find that evidence or assessment ID/)).toBeInTheDocument();
  });
});

describe("Access key", () => {
  it("401 shows an inline error; a valid key is accepted and never put in localStorage", async () => {
    server.use(
      http.get(`${BASE}/projects`, ({ request }) =>
        request.headers.get("x-api-key") === "good-key"
          ? HttpResponse.json({ items: [], total: 0, limit: 1, offset: 0 })
          : HttpResponse.json(errBody("unauthorized", "no"), { status: 401 }),
      ),
    );
    const user = userEvent.setup();
    renderPage(<AccessKey />);
    await user.type(screen.getByLabelText("Access key"), "bad");
    await user.click(screen.getByRole("button", { name: "Continue" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("That key was not accepted.");
    expect(keyStore.getKey()).toBeNull();
    await user.clear(screen.getByLabelText("Access key"));
    await user.type(screen.getByLabelText("Access key"), "good-key");
    await user.click(screen.getByRole("button", { name: "Continue" }));
    await waitFor(() => expect(keyStore.getKey()).toBe("good-key"));
    expect(Object.keys(localStorage)).toHaveLength(0);
    expect(Object.keys(sessionStorage)).toHaveLength(0);
  });
});

describe("Backend status banner", () => {
  const noop = () => undefined;
  it("rules_loaded=0 is a blocking alert", () => {
    renderPage(<BackendStatusBanner state="no_rules" ready={undefined} onRetry={noop} />);
    expect(screen.getByRole("alert")).toHaveTextContent(/no rules loaded/i);
  });
  it("not_ready lists the server notes", () => {
    renderPage(
      <BackendStatusBanner
        state="not_ready"
        ready={{ status: "not_ready", checks: {}, rules_loaded: 0, notes: ["database unreachable"] }}
        onRetry={noop}
      />,
    );
    expect(screen.getByText("database unreachable")).toBeInTheDocument();
  });
  it("unreachable and warming have distinct messages incl. CORS hint", () => {
    const { unmount } = renderPage(<BackendStatusBanner state="warming" ready={undefined} onRetry={noop} />);
    expect(screen.getByText(/Waking the server/)).toBeInTheDocument();
    unmount();
    renderPage(<BackendStatusBanner state="unreachable" ready={undefined} onRetry={noop} />);
    expect(screen.getByText(/CORS_ORIGINS/)).toBeInTheDocument();
  });
});

describe("Sources and About", () => {
  it("shows the Hindi-not-searchable note for a hi document and links only non-null source_url", async () => {
    const doc = (k: string, language: string, url: string | null) => ({
      document_key: k,
      title: k,
      document_type: "rules",
      language,
      jurisdiction: "MP",
      source_url: url,
      publication_date: null,
      effective_date: null,
      consolidation_date: "2025-03-06",
      document_version: null,
      file_hash: "deadbeef",
      page_count: 120,
      verification_status: "unverified",
      notes: null,
    });
    server.use(
      http.get(`${BASE}/documents`, () =>
        HttpResponse.json({
          items: [doc("EN-DOC", "en", null), doc("HI-DOC", "hi", "https://example.invalid/x.pdf")],
        }),
      ),
    );
    renderPage(<Sources />);
    expect(await screen.findByText(/not searchable/)).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: "Open source" })).toHaveLength(1);
  });
  it("About explains every status", () => {
    renderPage(<About />);
    expect(screen.getByText("Not evaluated — no verified rule logic")).toBeInTheDocument();
    expect(screen.getByText("Unverified source text")).toBeInTheDocument();
  });
});

describe("i18n rendering", () => {
  it("Hindi UI strings render; evidence text stays English with a 'not translated' note", async () => {
    await i18n.changeLanguage("hi");
    renderPage(
      <>
        <StatusBadge status="pending_verification" />
        <EvidenceCard evidence={EV21} />
      </>,
    );
    expect(screen.getByText("नियम-पाठ का संकेत — अभी मानव-सत्यापित नहीं")).toBeInTheDocument();
    expect(screen.getByText(/अंग्रेज़ी स्रोत-पाठ/)).toBeInTheDocument();
    expect(screen.getByText(/Every application shall be accompanied/)).toBeInTheDocument();
  });
  it("Devanagari question is sent unchanged", async () => {
    const bodies: Array<Record<string, unknown>> = [];
    server.use(
      http.post(`${BASE}/ask`, async ({ request }) => {
        bodies.push((await request.json()) as Record<string, unknown>);
        return HttpResponse.json(askPending);
      }),
    );
    const user = userEvent.setup();
    renderPage(<Ask />);
    await ask(user, "बिल्डिंग परमिशन की फीस कितनी है?");
    await waitFor(() => expect(bodies).toHaveLength(1));
    expect(bodies[0]).toEqual({ question: "बिल्डिंग परमिशन की फीस कितनी है?" });
  });
});
