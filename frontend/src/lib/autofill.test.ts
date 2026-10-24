import { describe, expect, it } from "vitest";
import type { ExtractedFact } from "@/api/types";
import { applyFacts, completeMetrics } from "./autofill";
import { emptyWbForm, parseWb } from "./workbench";

const fact = (name: string, value: string, unit: string | null, extra: Partial<ExtractedFact> = {}): ExtractedFact => ({
  name,
  value,
  unit,
  source: "user_provided",
  origin: "question_text",
  validation_status: "unverified",
  confidence: "medium",
  ...extra,
});

describe("applyFacts", () => {
  it("fills the form from '30 x 40 ft plot, 9 m road, 2 floors' (first number = width along the road)", () => {
    const note = "from 'L x W' pattern; order not confirmed";
    const { form, filled } = applyFacts(emptyWbForm("ft"), [
      fact("plot_length", "30", "ft", { note }),
      fact("plot_width", "40", "ft", { note }),
      fact("road_width", "9", "m"),
      fact("floors", "2", null),
      fact("building_use", "residential", null),
    ]);
    expect(form.cells.plot_width).toEqual({ value: "30", unit: "ft" });
    expect(form.cells.plot_length).toEqual({ value: "40", unit: "ft" });
    expect(form.cells.road_width).toEqual({ value: "9", unit: "m" });
    expect(form.floors).toBe("2");
    expect(form.building_use).toBe("residential");
    expect(filled).toContain("road_width");
    expect(parseWb(form).errors).toEqual({});
  });

  it("ignores invalid facts, non-user facts and values with the wrong kind of unit", () => {
    const { form, filled } = applyFacts(emptyWbForm("m"), [
      fact("road_width", "9", "m", { validation_status: "invalid" }),
      fact("plot_area", "100", "m"), // a length unit for an area field
      fact("floors", "3", null, { source: "system_calculated" }),
    ]);
    expect(filled).toEqual([]);
    expect(form.cells.road_width.value).toBe("");
    expect(form.floors).toBe("");
  });
});

describe("completeMetrics", () => {
  const metricsOf = (setup: (f: ReturnType<typeof emptyWbForm>) => void) => {
    const f = emptyWbForm("m");
    setup(f);
    return parseWb(f).metrics;
  };

  it("draws nothing when the plot size is unknown", () => {
    expect(completeMetrics(metricsOf(() => undefined))).toBeNull();
  });

  it("builds a whole house from the plot size alone and says what it assumed", () => {
    const c = completeMetrics(metricsOf((f) => {
      f.cells.plot_width = { value: "10", unit: "m" };
      f.cells.plot_length = { value: "20", unit: "m" };
    }));
    expect(c).not.toBeNull();
    const m = c!.metrics;
    expect(m.floors).toBe(2);
    expect(m.height).toBeGreaterThan(0);
    expect(m.bldgW! * m.bldgD!).toBeLessThanOrEqual(10 * 20 * 0.6 + 1e-6);
    expect(m.gapFront! + m.bldgD!).toBeLessThanOrEqual(20 + 1e-6);
    expect(c!.assumed).toEqual(expect.arrayContaining(["floors", "height", "footprint", "setbacks"]));
  });

  it("never replaces what the user stated, and derives floors from a stated height", () => {
    const c = completeMetrics(metricsOf((f) => {
      f.cells.plot_width = { value: "12", unit: "m" };
      f.cells.plot_length = { value: "18", unit: "m" };
      f.cells.building_height = { value: "9", unit: "m" };
      f.cells.building_width = { value: "8", unit: "m" };
      f.cells.building_length = { value: "10", unit: "m" };
    }))!;
    expect(c.metrics.height).toBe(9);
    expect(c.metrics.floors).toBe(3);
    expect(c.metrics.bldgW).toBe(8);
    expect(c.metrics.bldgD).toBe(10);
    expect(c.assumed).not.toContain("footprint");
  });

  it("derives a 3:4 plot from the area alone", () => {
    const c = completeMetrics(metricsOf((f) => {
      f.cells.plot_area = { value: "300", unit: "sqm" };
    }))!;
    expect(c.metrics.plotW! * c.metrics.plotD!).toBeCloseTo(300, 5);
    expect(c.assumed).toContain("plotShape");
  });
});
