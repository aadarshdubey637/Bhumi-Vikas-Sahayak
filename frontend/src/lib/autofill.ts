// Turns a sentence like "30 x 40 ft plot, 9 m road, 2 floors" into workbench values, and fills whatever is still missing with
// clearly labelled assumptions so a building can be drawn straight away. Pure functions (no React) so they are unit-tested.
//
// The assumptions only drive the 3D sketch. The compliance check and the questions sent to the server use the real values only,
// so an assumed setback or footprint can never make a plan look compliant.
import type { ExtractedFact } from "@/api/types";
import { CELL_FIELDS, fmtNum, type CellField, type Metrics, type WbForm } from "./workbench";

const LENGTH_UNITS = new Set(["m", "cm", "mm", "ft", "in", "yd"]);
const AREA_UNITS = new Set(["sqm", "sqft", "sqyd", "acre", "hectare"]);
const AREA_FIELDS = new Set<string>(["plot_area", "built_up_area"]);
const isCell = (n: string): n is CellField => (CELL_FIELDS as readonly string[]).includes(n);

export interface Applied {
  form: WbForm;
  /** names of the form fields that were filled from the text */
  filled: string[];
}

/** Copies the valid, user-stated facts of an answer into the form. Nothing the user stated is ever replaced by an assumption. */
export function applyFacts(form: WbForm, facts: ExtractedFact[]): Applied {
  const next: WbForm = { ...form, cells: { ...form.cells } };
  const filled: string[] = [];
  const usable = facts.filter((f) => f.source === "user_provided" && f.validation_status !== "invalid");
  // "30 x 40 ft": the first number is the width along the road, the second the depth (the order the examples use)
  const pair = usable.filter((f) => (f.name === "plot_length" || f.name === "plot_width") && /L x W/i.test(f.note ?? ""));
  const swapped = new Map<string, string>();
  if (pair.length === 2) {
    const len = pair.find((f) => f.name === "plot_length");
    const wid = pair.find((f) => f.name === "plot_width");
    if (len && wid) {
      swapped.set("plot_width", len.value);
      swapped.set("plot_length", wid.value);
    }
  }
  for (const f of usable) {
    const value = swapped.get(f.name) ?? f.value;
    if (isCell(f.name)) {
      const unit = f.unit ?? "";
      const ok = AREA_FIELDS.has(f.name) ? AREA_UNITS.has(unit) : LENGTH_UNITS.has(unit);
      if (!ok) continue;
      next.cells[f.name] = { value, unit };
      filled.push(f.name);
    } else if (f.name === "floors") {
      next.floors = value;
      filled.push("floors");
    } else if (f.name === "building_use") {
      next.building_use = value;
      filled.push("building_use");
    }
  }
  return { form: next, filled };
}

export type AssumedKey = "plotShape" | "floors" | "height" | "setbacks" | "footprint";

export interface Completed {
  metrics: Metrics;
  assumed: AssumedKey[];
}

const FRONT_GAP = 3; // metres; used when the rules' front open space is not known yet
const SIDE_GAP = 1.5;
const MAX_COVER = 0.6; // share of the plot a drawn footprint may take
const STOREY = 3; // metres per floor

/** The real values plus assumptions for everything the 3D sketch needs and the user did not give. Null when there is nothing to draw. */
export function completeMetrics(real: Metrics, frontMin?: number): Completed | null {
  const m: Metrics = { ...real };
  const assumed = new Set<AssumedKey>();

  // plot shape
  if ((m.plotW === undefined || m.plotD === undefined) && m.plotAreaSqm !== undefined) {
    if (m.plotW !== undefined) m.plotD = m.plotAreaSqm / m.plotW;
    else if (m.plotD !== undefined) m.plotW = m.plotAreaSqm / m.plotD;
    else {
      m.plotW = Math.sqrt(m.plotAreaSqm * 0.75); // 3 : 4 plot
      m.plotD = m.plotAreaSqm / m.plotW;
      assumed.add("plotShape");
    }
  }
  if (m.plotW === undefined || m.plotD === undefined) return null;
  const plotArea = m.plotW * m.plotD;

  // floors and height
  if (m.floors === undefined && m.height !== undefined) m.floors = Math.max(1, Math.round(m.height / STOREY));
  if (m.floors === undefined) {
    m.floors = 2;
    assumed.add("floors");
  }
  if (m.height === undefined) {
    m.height = m.floors * STOREY + 0.5;
    assumed.add("height");
  }

  // footprint and gaps
  if (m.bldgW === undefined || m.bldgD === undefined) {
    const front = m.gapFront ?? Math.min(frontMin ?? FRONT_GAP, m.plotD * 0.25);
    const side = m.gapLeft ?? Math.min(SIDE_GAP, m.plotW * 0.12);
    const rear = Math.min(SIDE_GAP, m.plotD * 0.12);
    let w = m.bldgW ?? Math.max(1, m.plotW - 2 * side);
    let d = m.bldgD ?? Math.max(1, m.plotD - front - rear);
    if (m.builtUpSqm !== undefined && m.bldgW === undefined && m.bldgD === undefined) {
      const ground = m.builtUpSqm / m.floors; // built-up area is spread over the floors
      const k = Math.sqrt(ground / (w * d));
      if (Number.isFinite(k) && k > 0) {
        w *= Math.min(k, 1);
        d *= Math.min(k, 1);
      }
    }
    const cover = (w * d) / plotArea;
    if (cover > MAX_COVER) {
      const k = Math.sqrt(MAX_COVER / cover);
      w *= k;
      d *= k;
    }
    m.bldgW = m.bldgW ?? w;
    m.bldgD = m.bldgD ?? d;
    assumed.add("footprint");
  }
  if (m.gapFront === undefined || m.gapLeft === undefined) {
    // centre the footprint sideways; at the front, keep the rule minimum (or the default) when it fits
    if (m.gapLeft === undefined) m.gapLeft = Math.max(0, (m.plotW - m.bldgW) / 2);
    if (m.gapFront === undefined) m.gapFront = Math.max(0, Math.min(frontMin ?? FRONT_GAP, m.plotD - m.bldgD));
    assumed.add("setbacks");
  }
  return { metrics: m, assumed: [...assumed] };
}

/** "Plot 9.14 x 12.19 m": the one-line summary of what was understood. */
export const sizeLabel = (w?: number, d?: number): string | null => (w !== undefined && d !== undefined ? `${fmtNum(w, 1)} × ${fmtNum(d, 1)} m` : null);
