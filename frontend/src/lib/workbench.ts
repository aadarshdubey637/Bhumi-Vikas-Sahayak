// Workbench form model, unit conversion and geometry. Pure functions (no React) so they are unit-tested.
// Values that go to the server are validated with the same zod schemas as the other forms; the two "gap" fields
// exist only on the client (the backend has no such input), so they drive the drawing and the setback comparison only.
import { z } from "zod";
import { areaMeasurement, DECIMAL_RE, floorsSchema, lengthMeasurement, MAX_MEASUREMENT, textInputSchema } from "@/api/schemas";
import type { InputMap } from "@/api/types";

export interface Cell {
  value: string;
  unit: string;
}
export const SERVER_LENGTH_FIELDS = ["plot_length", "plot_width", "road_width", "building_height", "building_width", "building_length"] as const;
export const SERVER_AREA_FIELDS = ["plot_area", "built_up_area"] as const;
export const CLIENT_LENGTH_FIELDS = ["gap_front", "gap_left"] as const;
export const CELL_FIELDS = ["plot_area", "plot_length", "plot_width", "road_width", "building_height", "built_up_area", "building_width", "building_length", "gap_front", "gap_left"] as const;
export type CellField = (typeof CELL_FIELDS)[number];
export type FieldId = CellField | "floors" | "building_use" | "location";

export const fieldDomId = (f: FieldId): string => `wb-${f}`;

export interface WbForm {
  cells: Record<CellField, Cell>;
  floors: string;
  building_use: string;
  location: string;
}

const isArea = (f: string): boolean => (SERVER_AREA_FIELDS as readonly string[]).includes(f);

export type UnitSystem = "ft" | "m";
const unitFor = (field: string, sys: UnitSystem): string => (isArea(field) ? (sys === "ft" ? "sqft" : "sqm") : sys);

export function emptyWbForm(sys: UnitSystem = "m"): WbForm {
  const cells = {} as Record<CellField, Cell>;
  for (const f of CELL_FIELDS) cells[f] = { value: "", unit: unitFor(f, sys) };
  return { cells, floors: "", building_use: "", location: "" };
}

/** Which system the form is in, judged by the plot width's unit. */
export const unitSystemOf = (form: WbForm): UnitSystem => (form.cells.plot_width.unit === "ft" ? "ft" : "m");

/** Switch every length and area field to the other system, converting the numbers already typed. Empty or invalid entries only change unit. */
export function convertForm(form: WbForm, to: UnitSystem): WbForm {
  const cells = { ...form.cells };
  for (const f of CELL_FIELDS) {
    const c = form.cells[f];
    const target = unitFor(f, to);
    if (c.unit === target) continue;
    const factorFrom = isArea(f) ? AREA_TO_SQM[c.unit] : LEN_TO_M[c.unit];
    const factorTo = isArea(f) ? AREA_TO_SQM[target] : LEN_TO_M[target];
    const n = num(c.value, true);
    cells[f] = n === null || factorFrom === undefined || factorTo === undefined ? { value: c.value, unit: target } : { value: String(Number(((n * factorFrom) / factorTo).toFixed(2))), unit: target };
  }
  return { ...form, cells };
}

const EXAMPLES: Record<UnitSystem, Record<string, string>> = {
  m: { plot_length: "20", plot_width: "10", road_width: "9", building_height: "9", built_up_area: "150", building_width: "7", building_length: "12", gap_front: "3", gap_left: "1.5" },
  ft: { plot_length: "60", plot_width: "30", road_width: "30", building_height: "30", built_up_area: "1600", building_width: "22", building_length: "40", gap_front: "10", gap_left: "5" },
};
const EXAMPLES_3: Record<UnitSystem, Record<string, string>> = {
  m: { plot_width: "9.14", plot_length: "12.19", road_width: "9", building_height: "9.5", built_up_area: "126", building_width: "6", building_length: "7", gap_front: "3.2", gap_left: "1.5" },
  ft: { plot_width: "30", plot_length: "40", road_width: "30", building_height: "31", built_up_area: "1350", building_width: "20", building_length: "24", gap_front: "10.5", gap_left: "5" },
};
function fill(sys: UnitSystem, values: Record<string, string>, floors: string): WbForm {
  const f = emptyWbForm(sys);
  for (const [k, v] of Object.entries(values)) f.cells[k as CellField] = { ...f.cells[k as CellField], value: v };
  f.floors = floors;
  f.building_use = "residential";
  return f;
}
/** A small, clearly labelled sample so the page can be tried without typing. Not stored anywhere. */
export function exampleWbForm(sys: UnitSystem = "m"): WbForm {
  return fill(sys, EXAMPLES[sys], "2");
}
/** The question that motivated this tool: a three-storey house on a 30 x 40 ft plot. */
export function example30x40(sys: UnitSystem = "m"): WbForm {
  return fill(sys, EXAMPLES_3[sys], "3");
}

const LEN_TO_M: Record<string, number> = { m: 1, cm: 0.01, mm: 0.001, ft: 0.3048, in: 0.0254, yd: 0.9144 };
const AREA_TO_SQM: Record<string, number> = { sqm: 1, sqft: 0.09290304, sqyd: 0.83612736, acre: 4046.8564224, hectare: 10000 };

/** Parses a decimal string; null for blank or invalid. `allowZero` is for gaps (a building may touch the boundary). */
const num = (s: string, allowZero = false): number | null => {
  const v = s.replace(/\s+/g, "");
  if (v === "" || v.includes(",") || !DECIMAL_RE.test(v)) return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0 || (!allowZero && n === 0) || n > MAX_MEASUREMENT) return null;
  return n;
};
export const cellMetres = (c: Cell, allowZero = false): number | null => {
  const n = num(c.value, allowZero);
  const k = LEN_TO_M[c.unit];
  return n === null || k === undefined ? null : n * k;
};
export const cellSqm = (c: Cell): number | null => {
  const n = num(c.value);
  const k = AREA_TO_SQM[c.unit];
  return n === null || k === undefined ? null : n * k;
};

/** 12 -> "12", 12.5 -> "12.5", 3.456 -> "3.46". */
export const fmtNum = (n: number, places = 2): string => String(Number(n.toFixed(places)));

export interface Metrics {
  /** all in metres / square metres; only valid values are present */
  plotW?: number;
  plotD?: number;
  plotAreaSqm?: number;
  plotAreaDerived: boolean;
  roadW?: number;
  height?: number;
  floors?: number;
  builtUpSqm?: number;
  bldgW?: number;
  bldgD?: number;
  gapFront?: number;
  gapLeft?: number;
  use?: string;
}

export interface ParsedWb {
  /** the valid, server-bound inputs (invalid fields are left out and reported in `errors`) */
  inputs: InputMap;
  /** field id -> i18n key */
  errors: Partial<Record<FieldId, string>>;
  metrics: Metrics;
}

const issue = (r: { error: z.ZodError }): string => r.error.issues[0]?.message ?? "validation.decimal";

export function parseWb(form: WbForm): ParsedWb {
  const inputs: InputMap = {};
  const errors: ParsedWb["errors"] = {};
  const m: Metrics = { plotAreaDerived: false };

  for (const f of CELL_FIELDS) {
    const cell = form.cells[f];
    if (cell.value.trim() === "") continue;
    if ((CLIENT_LENGTH_FIELDS as readonly string[]).includes(f)) {
      if (cellMetres(cell, true) === null) errors[f] = "validation.nonNegative";
      continue;
    }
    const r = (isArea(f) ? areaMeasurement : lengthMeasurement).safeParse(cell);
    if (r.success) inputs[f] = { value: r.data.value, unit: r.data.unit };
    else errors[f] = issue(r);
  }
  if (form.floors.trim() !== "") {
    const r = floorsSchema.safeParse(form.floors);
    if (r.success) inputs.floors = { value: r.data, unit: "count" };
    else errors.floors = issue(r);
  }
  for (const f of ["building_use", "location"] as const) {
    if (form[f].trim() === "") continue;
    const r = textInputSchema.safeParse(form[f]);
    if (r.success) inputs[f] = r.data;
    else errors[f] = issue(r);
  }

  const ok = (f: CellField): boolean => !errors[f] && form.cells[f].value.trim() !== "";
  const len = (f: CellField, zero = false) => (ok(f) ? (cellMetres(form.cells[f], zero) ?? undefined) : undefined);
  m.plotW = len("plot_width");
  m.plotD = len("plot_length");
  m.roadW = len("road_width");
  m.height = len("building_height");
  m.bldgW = len("building_width");
  m.bldgD = len("building_length");
  m.gapFront = len("gap_front", true);
  m.gapLeft = len("gap_left", true);
  m.builtUpSqm = "built_up_area" in inputs ? (cellSqm(form.cells.built_up_area) ?? undefined) : undefined;
  m.plotAreaSqm = "plot_area" in inputs ? (cellSqm(form.cells.plot_area) ?? undefined) : undefined;
  if (m.plotAreaSqm === undefined && m.plotW !== undefined && m.plotD !== undefined && !errors.plot_area) {
    // Derived from length x width and sent as plot_area so the rule lookup can use it; the UI says so.
    m.plotAreaSqm = m.plotW * m.plotD;
    m.plotAreaDerived = true;
    inputs.plot_area = { value: fmtNum(m.plotAreaSqm, 4), unit: "sqm" };
  }
  if ("floors" in inputs) m.floors = Number((inputs.floors as { value: string }).value);
  if (typeof inputs.building_use === "string") m.use = inputs.building_use;
  return { inputs, errors, metrics: m };
}

export interface Placement {
  /** metres from the left plot edge / from the front (road side) edge */
  x0: number;
  y0: number;
  w: number;
  d: number;
  assumedX: boolean;
  assumedY: boolean;
  outside: boolean;
  rightGap: number;
  rearGap: number;
}
const EPS = 1e-9;

/** Where the footprint sits on the plot. Missing gaps are assumed (front: at the rule minimum if known, else centred) and flagged. */
export function placeBuilding(m: Metrics, frontMin?: number): Placement | null {
  if (m.plotW === undefined || m.plotD === undefined || m.bldgW === undefined || m.bldgD === undefined) return null;
  const assumedX = m.gapLeft === undefined;
  const assumedY = m.gapFront === undefined;
  const x0 = m.gapLeft ?? (m.plotW - m.bldgW) / 2;
  const y0 = m.gapFront ?? frontMin ?? (m.plotD - m.bldgD) / 2;
  const rightGap = m.plotW - x0 - m.bldgW;
  const rearGap = m.plotD - y0 - m.bldgD;
  const outside = x0 < -EPS || y0 < -EPS || rightGap < -EPS || rearGap < -EPS;
  return { x0, y0, w: m.bldgW, d: m.bldgD, assumedX, assumedY, outside, rightGap, rearGap };
}

export const sameInputs = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);
