// Turns the backend's structured result into plain sentences a non-expert can follow. Every number comes from the backend's own
// rule-table lookup (direct_answer.requirements) or from what the user told us; this file only adds ordinary words around them.
import type { AskResponse } from "@/api/types";

export type NeedField = "road_width" | "plot_area" | "building_height" | "built_up_area" | "floors";
export const NEED_FIELDS: readonly NeedField[] = ["road_width", "plot_area", "building_height", "built_up_area", "floors"];

export interface Plain {
  /** the answer in one or two sentences */
  short: string;
  /** what applies, one sentence each */
  points: string[];
  /** the reasons, one sentence each */
  why: string[];
}
type Tr = (key: string, params?: Record<string, string | number>) => string;

const n2 = (n: number): string => String(Number(n.toFixed(2)));
const FT = 3.28084;
const SQFT = 10.7639;
/** "3 m (about 10 ft)": people think in feet, the rules are in metres, so show both. */
const lenText = (tr: Tr, m: number): string => `${n2(m)} ${tr("units.m")} (${tr("plain.about")} ${Math.round(m * FT)} ${tr("units.ft")})`;
/** Same figures as areaText without brackets, for use inside a sentence that is already in brackets. */
const areaPlain = (tr: Tr, m2: number): string => `${n2(m2)} ${tr("units.sqm")} · ${tr("plain.about")} ${Math.round(m2 * SQFT).toLocaleString("en-IN")} ${tr("units.sqft")}`;
const areaText = (tr: Tr, m2: number): string => `${n2(m2)} ${tr("units.sqm")} (${tr("plain.about")} ${Math.round(m2 * SQFT).toLocaleString("en-IN")} ${tr("units.sqft")})`;
const TO_M: Record<string, number> = { m: 1, cm: 0.01, mm: 0.001, ft: 0.3048, in: 0.0254, yd: 0.9144 };

function factNumber(r: AskResponse, name: string): number | null {
  const f = r.extracted_facts.find((x) => x.name === name && x.validation_status === "valid");
  const v = f ? Number(f.value) : NaN;
  return Number.isFinite(v) ? v : null;
}
/** the road width in the user's own unit, e.g. "20 ft" */
function roadAsTyped(r: AskResponse, tr: Tr): string | null {
  const f = r.extracted_facts.find((x) => x.name === "road_width" && x.validation_status === "valid");
  if (!f || !Number.isFinite(Number(f.value))) return null;
  return `${n2(Number(f.value))} ${tr(`units.${f.unit ?? "m"}`)}`;
}
function heightMetres(r: AskResponse): number | null {
  const f = r.extracted_facts.find((x) => x.name === "building_height" && x.validation_status === "valid");
  const v = f ? Number(f.value) * (TO_M[f.unit ?? "m"] ?? 1) : NaN;
  return Number.isFinite(v) ? v : null;
}

/** "30 × 40 ft (about 111.48 sq m)" from what the user said, or null. */
function plotText(r: AskResponse, tr: Tr): string | null {
  const get = (name: string) => r.extracted_facts.find((x) => x.name === name && x.source === "user_provided" && x.validation_status === "valid");
  const l = get("plot_length");
  const w = get("plot_width");
  if (l && w && l.unit === w.unit && l.unit) {
    const k = TO_M[l.unit] ?? 1;
    return `${n2(Number(l.value))} × ${n2(Number(w.value))} ${tr(`units.${l.unit}`)} · ${areaPlain(tr, Number(l.value) * Number(w.value) * k * k)}`;
  }
  const a = get("plot_area");
  if (a) {
    const f = a.unit === "sqft" ? 0.09290304 : a.unit === "sqyd" ? 0.83612736 : 1;
    return areaPlain(tr, Number(a.value) * f);
  }
  return null;
}

/** null when there is nothing structured to explain (the caller then shows the backend's own wording). */
export function composePlain(r: AskResponse, tr: Tr): Plain | null {
  const da = r.direct_answer;
  if (!da || r.status === "not_established") return null;
  const reqs = da.requirements ?? [];
  const front = reqs.find((x) => x.key === "front_open_space");
  const rear = reqs.find((x) => x.key === "rear_open_space");
  const far = reqs.find((x) => x.key === "max_floor_area");
  const stop = tr("plain.stop");

  const height = heightMetres(r);
  if (!front && !rear && !far && height !== null && height > 12.5 && (da.kind === "setback" || da.kind === "multi")) {
    return { short: tr("plain.tall", { h: lenText(tr, height) }), points: [], why: [] };
  }
  if (!front && !rear && !far) return null;

  const points: string[] = [];
  const why: string[] = [];
  const lead: string[] = [];

  if (front) {
    const v = lenText(tr, Number(front.value));
    lead.push(tr("plain.s.front", { v }));
    const road = roadAsTyped(r, tr);
    why.push(road !== null ? tr("plain.whyFront", { road }) : tr("plain.whyFrontGeneric"));
  }
  if (rear) {
    const v = Number(rear.value);
    const area = /([\d.]+)/.exec(rear.basis)?.[1];
    lead.push(v === 0 ? tr("plain.s.rearNil") : tr("plain.s.rear", { v: lenText(tr, v) }));
    if (area) why.push(tr("plain.whyRear", { area: areaText(tr, Number(area)) }));
  }
  const sentences: string[] = [];
  const plot = plotText(r, tr);
  if (plot) sentences.push(tr("plain.s.forPlot", { plot }));
  // a missing road width means the front figure cannot be given yet: say so rather than start mid-sentence
  if (!front && neededFields(r).includes("road_width")) sentences.push(tr("plain.s.frontUnknown") + stop);
  for (const l of lead) sentences.push(l + stop);

  if (far) {
    const cap = Number(far.value);
    sentences.push(tr("plain.s.far", { v: areaText(tr, cap) }) + stop);
    why.push(tr("plain.whyFar", { area: areaText(tr, cap / 1.25), v: areaText(tr, cap) }));
    const floors = factNumber(r, "floors");
    if (floors && floors >= 1) points.push(tr("plain.perFloor", { n: n2(floors), per: areaText(tr, cap / floors) }));
  }
  if (da.lines.some((l) => /side open space|बगल की खुली/i.test(l))) points.push(tr("plain.side"));
  return { short: sentences.join(" "), points, why };
}

/** Which of the details the answer is waiting for (so the screen can ask for them in the same place). */
export function neededFields(r: AskResponse): NeedField[] {
  const mi = r.missing_information as { missing_facts?: string[] };
  const names = [...(r.direct_answer?.missing ?? []), ...(mi.missing_facts ?? [])];
  return [...new Set(names.filter((n): n is NeedField => (NEED_FIELDS as readonly string[]).includes(n)))];
}

// ---- structured pieces shown above and beside the sentences ------------------------------------------------------
export interface Understood {
  key: string;
  label: string;
  value: string;
}
const UNDERSTOOD_NAMES = ["plot_length", "plot_width", "plot_area", "road_width", "building_height", "built_up_area", "floors"] as const;

/** The facts taken from the question, so the user can see (and correct) what was understood. */
export function understoodFacts(r: AskResponse, tr: Tr): Understood[] {
  const out: Understood[] = [];
  for (const name of UNDERSTOOD_NAMES) {
    const f = r.extracted_facts.find((x) => x.name === name && x.source === "user_provided" && x.validation_status === "valid");
    if (!f) continue;
    const unit = f.unit && f.unit !== "count" ? ` ${tr(`units.${f.unit}`)}` : "";
    out.push({ key: name, label: tr(`plain.d.${name}`), value: `${n2(Number(f.value))}${unit}` });
  }
  const use = r.extracted_facts.find((x) => x.name === "building_use");
  if (use) out.push({ key: "building_use", label: tr("plain.d.building_use"), value: use.value });
  return out;
}

export interface SnapRow {
  key: "front" | "rear" | "far" | "height";
  label: string;
  value: string;
  /** known: a figure from the rules; needed: waiting for a detail from the user; warn: not a simple figure */
  state: "known" | "needed" | "warn";
}

/** "Your plot at a glance": the four things everyone asks about, each either answered or clearly waiting for a detail. */
export function snapshotRows(r: AskResponse, tr: Tr): SnapRow[] | null {
  const da = r.direct_answer;
  if (!da || r.status === "not_established" || !["setback", "far", "multi"].includes(da.kind)) return null;
  const reqs = da.requirements ?? [];
  const front = reqs.find((x) => x.key === "front_open_space");
  const rear = reqs.find((x) => x.key === "rear_open_space");
  const far = reqs.find((x) => x.key === "max_floor_area");
  const h = heightMetres(r);
  const tall = h !== null && h > 12.5;
  const rows: SnapRow[] = [];
  const row = (key: SnapRow["key"], value: string, state: SnapRow["state"]) => rows.push({ key, label: tr(`plain.snap.${key}`), value, state });
  row("front", front ? lenText(tr, Number(front.value)) : tall ? tr("plain.snap.rule42") : tr("plain.snap.needRoad"), front ? "known" : tall ? "warn" : "needed");
  row("rear", rear ? (Number(rear.value) === 0 ? tr("plain.snap.none") : lenText(tr, Number(rear.value))) : tall ? tr("plain.snap.rule42") : tr("plain.snap.needPlot"), rear ? "known" : tall ? "warn" : "needed");
  row("far", far ? areaText(tr, Number(far.value)) : tr("plain.snap.needPlot"), far ? "known" : "needed");
  row("height", h === null ? tr("plain.snap.needHeight") : tall ? tr("plain.snap.heightTall") : tr("plain.snap.heightOk", { h: lenText(tr, h) }), h === null ? "needed" : tall ? "warn" : "known");
  return rows;
}

export interface ScenarioTable {
  key: string;
  title: string;
  rows: Array<{ when: string; value: string }>;
}

/** "It depends on your road": every outcome from the rule table, shown when the deciding detail is not known yet. */
export function scenarioTables(r: AskResponse, tr: Tr): ScenarioTable[] {
  const all = r.direct_answer?.scenarios ?? [];
  const out: ScenarioTable[] = [];
  for (const key of ["front_open_space", "rear_open_space"]) {
    const rows = all.filter((x) => x.key === key);
    if (!rows.length) continue;
    const road = key === "front_open_space";
    const fmt = (v: string) => (road ? lenText(tr, Number(v)) : areaText(tr, Number(v)));
    out.push({
      key,
      title: tr(road ? "plain.sc.front" : "plain.sc.rear"),
      rows: rows.map((x) => ({
        when: x.lo === null ? tr("plain.sc.upTo", { hi: fmt(x.hi!) }) : x.hi === null ? tr("plain.sc.above", { lo: fmt(x.lo) }) : tr("plain.sc.between", { lo: fmt(x.lo), hi: fmt(x.hi) }),
        value: Number(x.value) === 0 ? tr("plain.snap.none") : lenText(tr, Number(x.value)),
      })),
    });
  }
  return out;
}
