import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import i18n from "@/i18n";
import type { AskResponse } from "@/api/types";
import { askNotEstablished, askPending } from "@/test/fixtures";
import { BASE } from "@/test/msw/handlers";
import { server } from "@/test/msw/server";
import { renderPage } from "@/test/utils";
import Workbench from "./Workbench";

const direct: AskResponse = {
  ...askPending,
  status: "conditional",
  intent: "setback",
  direct_answer: {
    kind: "multi",
    headline: "Answer: front 3.0 m",
    lines: ["Front open space: minimum 3.0 m (street 9 m wide; Rule 56(1)(a))."],
    rules: ["56"],
    quotes: [{ rule_number: "56", rule_title: "Residential Buildings", page_start: 78, page_end: 79, text: "1. Up to 9.0 meters 3.0", verified: true }],
    steps: [],
    caveats: [],
    missing: [],
    follow_up: null,
    assumed: false,
    amendment_flag: false,
    requirements: [
      { key: "front_open_space", limit: "min", value: "3.0", unit: "m", rule: "56(1)(a)", basis: "up to 9.0 m" },
      { key: "rear_open_space", limit: "min", value: "2.50", unit: "m", rule: "56(2)(a)", basis: "plot 200 sq m" },
    ],
  },
  evidence: [{ ...askPending.evidence[0]!, evidence_id: "EV-56-1", rule_number: "56", rule_title: "Residential Buildings", page_start: 78, page_end: 79 }],
};

afterEach(async () => {
  cleanup();
  window.sessionStorage.clear();
  await i18n.changeLanguage("en");
  vi.unstubAllGlobals();
});
beforeEach(() => window.sessionStorage.clear());

const type = async (user: ReturnType<typeof userEvent.setup>, label: string, value: string) => {
  const el = screen.getByLabelText(new RegExp(`^${label}`));
  await user.clear(el);
  await user.type(el, value);
};

describe("Workbench", () => {
  it("shows an empty canvas message, then draws the plot from the typed inputs", async () => {
    const user = userEvent.setup();
    renderPage(<Workbench />);
    expect(screen.getAllByText("Enter the plot width and plot length to draw the plot.").length).toBeGreaterThan(0);
    await user.click(screen.getByRole("button", { name: "Example" }));
    const svg = await screen.findByRole("img", { name: /Plot 9\.14 m wide by 18\.29 m deep, road 9\.14 m at the front, building 6\.71 × 12\.19 m, height 9\.14 m/ });
    expect(svg).toBeInTheDocument();
    expect(screen.getAllByText("Illustrative preview · not a verified design").length).toBeGreaterThan(0);
    await user.click(screen.getByRole("button", { name: "2D plan" }));
    expect(screen.getByRole("button", { name: "2D plan" })).toHaveAttribute("aria-pressed", "true");
  });

  it("validates input and leaves invalid values out of the question", async () => {
    const user = userEvent.setup();
    let body: Record<string, unknown> | null = null;
    server.use(
      http.post(`${BASE}/ask`, async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json(direct);
      }),
    );
    renderPage(<Workbench />);
    await type(user, "Width of the road", "abc");
    await type(user, "Width of your plot", "10");
    expect(await screen.findByText("Enter a number such as 12 or 12.5.")).toBeInTheDocument();
    await user.type(screen.getByRole("textbox", { name: "Your question" }), "front open space");
    await user.click(screen.getByRole("button", { name: "Ask" }));
    await screen.findByRole("article", { name: "Answer" });
    expect(body).toMatchObject({ question: "front open space", context: { plot_width: { value: "10", unit: "ft" } } });
    expect(JSON.stringify(body)).not.toContain("road_width");
  });

  it("answers in plain language with rule and page as evidence, and offers read-aloud controls", async () => {
    const user = userEvent.setup();
    const spoken: string[] = [];
    const synth = { speak: (u: { text: string }) => spoken.push(u.text), cancel: vi.fn(), pause: vi.fn(), resume: vi.fn(), getVoices: () => [], addEventListener: vi.fn(), removeEventListener: vi.fn() };
    vi.stubGlobal("speechSynthesis", synth);
    vi.stubGlobal("SpeechSynthesisUtterance", function (this: { text: string }, t: string) { this.text = t; });
    window.speechSynthesis = synth as unknown as SpeechSynthesis;
    server.use(http.post(`${BASE}/ask`, () => HttpResponse.json(direct)));
    renderPage(<Workbench />);
    await user.type(screen.getByRole("textbox", { name: "Your question" }), "front open space");
    await user.click(screen.getByRole("button", { name: "Ask" }));
    const art = await screen.findByRole("article", { name: "Answer" });
    expect(within(art).getByText("From the rulebook, based on what you told me")).toBeInTheDocument();
    expect(within(art).getByText(/Keep 3 m \(about 10 ft\) open at the front, between the road and your house\. At the back, keep 2\.5 m \(about 8 ft\) open\./)).toBeInTheDocument();
    expect(within(art).getByText(/This is guidance to help you plan, not an approval/)).toBeInTheDocument();
    expect(within(art).getByRole("button", { name: "Rule 56 · p.78–79" })).toBeInTheDocument();
    await user.click(within(art).getByRole("button", { name: "Listen" }));
    expect(spoken.join(" ")).toContain("Keep 3 m (about 10 ft) open at the front");
    expect(spoken.join(" ")).toContain("Rule 56, page 78–79");
    await user.click(within(art).getByRole("button", { name: "Pause" }));
    expect(synth.pause).toHaveBeenCalled();
    await user.click(within(art).getByRole("button", { name: "Resume" }));
    expect(synth.resume).toHaveBeenCalled();
    await user.click(within(art).getByRole("button", { name: "Stop" }));
    expect(within(art).getByRole("button", { name: "Listen" })).toBeInTheDocument();
  });

  it("abstains when the rules do not answer, and gives no source chips", async () => {
    const user = userEvent.setup();
    server.use(http.post(`${BASE}/ask`, () => HttpResponse.json(askNotEstablished)));
    renderPage(<Workbench />);
    await user.type(screen.getByRole("textbox", { name: "Your question" }), "capital of France");
    await user.click(screen.getByRole("button", { name: "Ask" }));
    const art = await screen.findByRole("article", { name: "Answer" });
    expect(within(art).getByText(/so I won't guess/)).toBeInTheDocument();
    expect(within(art).queryByText("Source")).not.toBeInTheDocument();
  });

  it("evaluates compliance from the stated limits: possible violation, never 'compliant'", async () => {
    const user = userEvent.setup();
    server.use(http.post(`${BASE}/ask`, () => HttpResponse.json(direct)));
    renderPage(<Workbench />);
    await user.click(screen.getByRole("button", { name: "Metres" }));
    await user.click(screen.getByRole("button", { name: "Example" }));
    await type(user, "Space between the road side", "2");
    await user.click(screen.getByRole("button", { name: "Check my plot" }));
    const verdict = await screen.findByRole("region", { name: "Overall result" });
    await waitFor(() => expect(within(verdict).getByText("Something needs fixing")).toBeInTheDocument());
    expect(screen.getByText(/Your front gap 2 m \(7 ft\) is less than the stated minimum 3 m \(10 ft\)/)).toBeInTheDocument();
    expect(screen.getByText(/Move the building back by at least 1 m \(3 ft\)/)).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/\bcompliant\b/i);
  });

  it("keeps the conversation for the tab session and clears it on reset", async () => {
    const user = userEvent.setup();
    server.use(http.post(`${BASE}/ask`, () => HttpResponse.json(direct)));
    const first = renderPage(<Workbench />);
    await user.type(screen.getByRole("textbox", { name: "Your question" }), "front open space");
    await user.click(screen.getByRole("button", { name: "Ask" }));
    await screen.findByRole("article", { name: "Answer" });
    first.unmount();
    renderPage(<Workbench />);
    expect(await screen.findByRole("article", { name: "Answer" })).toBeInTheDocument();
    await user.click(screen.getAllByRole("button", { name: "Reset" })[0]!);
    await user.click(screen.getByRole("button", { name: "Yes, reset" }));
    await waitFor(() => expect(screen.queryByRole("article", { name: "Answer" })).not.toBeInTheDocument());
  });

  it("switches to Hindi and asks for a Hindi answer", async () => {
    const user = userEvent.setup();
    let lang: unknown;
    server.use(
      http.post(`${BASE}/ask`, async ({ request }) => {
        lang = ((await request.json()) as { language?: string }).language;
        return HttpResponse.json({ ...direct, language: "hi", direct_answer: { ...direct.direct_answer!, lines: ["सामने की खुली जगह: कम से कम 3.0 मीटर।"] } });
      }),
    );
    await i18n.changeLanguage("hi");
    renderPage(<Workbench />);
    expect(screen.getByText("आपकी जानकारी")).toBeInTheDocument();
    await user.type(screen.getByRole("textbox", { name: "आपका प्रश्न" }), "सामने की खुली जगह");
    await user.click(screen.getByRole("button", { name: "पूछें" }));
    const art = await screen.findByRole("article", { name: "उत्तर" });
    expect(art).toHaveAttribute("lang", "hi");
    expect(within(art).getByText(/सामने, सड़क और मकान के बीच/)).toBeInTheDocument();
    expect(lang).toBe("hi");
  });
});
