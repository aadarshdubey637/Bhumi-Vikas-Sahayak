import { cleanup, render, screen } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { afterEach, describe, expect, it } from "vitest";
import { axe } from "vitest-axe";
import * as axeMatchers from "vitest-axe/matchers";
expect.extend(axeMatchers);
import { emptyPlotForm } from "@/api/schemas";
import { VoiceButton } from "@/components/common/VoiceButton";
import { PlotSketch } from "@/components/plot/PlotSketch";
import { channelState } from "@/lib/channelStatus";
import { BASE } from "@/test/msw/handlers";
import { server } from "@/test/msw/server";
import { renderPage } from "@/test/utils";
import Amendments from "./Amendments";

afterEach(cleanup);

describe("Amendment tracker", () => {
  it("lists recorded amendments as needing manual verification, with unknown dates left unknown", async () => {
    renderPage(<Amendments />);
    expect(await screen.findByText("Test amendment to Rule 2")).toBeInTheDocument();
    expect(screen.getByText("Needs manual verification")).toBeInTheDocument();
    expect(screen.getByText("No amendment has been verified yet.")).toBeInTheDocument();
    expect(screen.getAllByText("Unknown — not inferred")).toHaveLength(2); // publication and effective date: never inferred
    expect(screen.getByRole("link", { name: /Rule 2/ })).toHaveAttribute("href", "/rules/2");
  });

  it("shows an empty state, not invented history, when the register is empty", async () => {
    server.use(http.get(`${BASE}/amendments`, () => HttpResponse.json({ items: [], note: "none" })));
    renderPage(<Amendments />);
    expect(await screen.findByText("No pending amendments are recorded.")).toBeInTheDocument();
    expect(screen.getByText("No amendment has been verified yet.")).toBeInTheDocument();
  });

  it("has no serious accessibility violations", async () => {
    const { container } = renderPage(<Amendments />);
    await screen.findByText("Test amendment to Rule 2");
    expect(await axe(container, { rules: { region: { enabled: false } } })).toHaveNoViolations();
  });
});

describe("Plot sketch", () => {
  it("draws only what was typed and says it is not a legal drawing", () => {
    const form = emptyPlotForm();
    form.measurements.plot_area = { value: "200", unit: "sqm" };
    form.measurements.road_width = { value: "9", unit: "m" };
    form.floors = "3";
    render(<PlotSketch form={form} />);
    const svg = screen.getByRole("img");
    expect(svg).toHaveAccessibleName(/200 sqm/);
    expect(svg).toHaveAccessibleName(/9 m/);
    expect(screen.getByText(/not a legal drawing/)).toBeInTheDocument();
    expect(screen.queryByText(/setback:/i)).toBeNull(); // no limits are ever drawn from the sketch
  });

  it("asks for dimensions when nothing is entered", () => {
    render(<PlotSketch form={emptyPlotForm()} />);
    expect(screen.getByRole("img")).toHaveAccessibleName(/enter dimensions/i);
  });

  it("ignores non-positive or non-numeric values instead of drawing them", () => {
    const form = emptyPlotForm();
    form.measurements.plot_length = { value: "-5", unit: "m" };
    form.measurements.plot_width = { value: "abc", unit: "m" };
    render(<PlotSketch form={form} />);
    expect(screen.getByRole("img")).toHaveAccessibleName(/enter dimensions/i);
  });
});

describe("Channel state", () => {
  it("never reports more than the server reported", () => {
    expect(channelState(undefined)).toBe("notConfigured");
    expect(channelState({ configured: false })).toBe("notConfigured");
    expect(channelState({ configured: true, connection: null })).toBe("configured");
    expect(channelState({ configured: true, connection: { ok: true } })).toBe("connectionOk");
    expect(channelState({ configured: true, connection: { ok: false } })).toBe("connectionFailed");
  });
});

describe("Voice input button", () => {
  it("renders nothing when the browser has no speech recognition", () => {
    const { container } = render(<VoiceButton onText={() => undefined} />);
    expect(container).toBeEmptyDOMElement();
  });
});
