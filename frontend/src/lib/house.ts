// Building model generated from the user's inputs: the single source for the 3D scene, the floor plans and the construction
// timeline. Pure (no three.js, no React) so it is unit-tested. Everything here is ILLUSTRATIVE architecture: dimensions that the user
// did not give are derived with the stated assumptions and returned in `assumptions`; nothing here is a design or a rule check.
// Coordinates (metres): x along the road from the left plot edge, z away from the road (front boundary at z = 0), y up.

export type Archetype = "house_pitched" | "house_flat" | "commercial" | "industrial" | "institutional";
export type Side = "front" | "rear" | "left" | "right";

export interface HouseParams {
  plotW: number;
  plotD: number;
  roadW?: number;
  /** footprint: x0 from the left edge, z0 from the front (road-side) boundary */
  x0: number;
  z0: number;
  w: number;
  d: number;
  floors?: number;
  /** total height to the top of the roof slab, from ground (m) */
  height?: number;
  use?: string;
}

export interface Msg {
  key: string;
  params?: Record<string, string | number>;
}
export interface Stage {
  id: string;
  label: Msg;
  start: number;
  end: number;
}
export interface Opening {
  id: string;
  floor: number;
  side: Side;
  /** centre along the facade (m): x for front/rear, z for left/right */
  at: number;
  w: number;
  h: number;
  sill: number;
  kind: "window" | "door" | "shop" | "rollup" | "balconyDoor";
}
export interface Balcony {
  id: string;
  floor: number;
  x: number;
  w: number;
  depth: number;
}
export interface HouseModel {
  floors: number;
  floorH: number;
  plinthH: number;
  slabT: number;
  /** y of the top of each floor's slab, index = floor */
  slabTop: number[];
  /** y of the base (finished floor level) of each floor */
  floorBase: number[];
  totalH: number;
  archetype: Archetype;
  fp: { x0: number; z0: number; w: number; d: number };
  wallT: number;
  openings: Opening[];
  balconies: Balcony[];
  roof: { type: "gable" | "flat" | "shed"; ridgeAlongX: boolean; rise: number; overhang: number };
  /** rooftop stair headroom and water tank (flat roofs only) */
  rooftop: boolean;
  assumptions: Msg[];
  stages: Stage[];
  stage: (id: string) => Stage;
  /** which stage is running at progress p (0..1) */
  stageAt: (p: number) => Stage;
}

export const PLINTH_H = 0.45;
export const SLAB_T = 0.15;
export const WALL_T = 0.23;
const DEFAULT_FLOOR_H = 3.0;

export function archetypeFor(use: string | undefined, floors: number): Archetype {
  const u = (use ?? "").toLowerCase();
  if (/commerc|shop|वाणिज्य|व्यावसायिक/.test(u)) return "commercial";
  if (/industr|औद्योगिक|factory/.test(u)) return "industrial";
  if (/institu|school|संस्था/.test(u)) return "institutional";
  if (/farm|फार्म/.test(u)) return "house_pitched";
  return floors <= 2 ? "house_pitched" : "house_flat";
}

const clamp = (n: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, n));

/** Slots along a facade of length L: evenly spaced window centres with a margin at each end. */
function slots(L: number, ww: number, gap: number): number[] {
  const n = Math.max(1, Math.floor((L - 0.8) / (ww + gap)));
  const pitch = L / n;
  return Array.from({ length: n }, (_, i) => pitch * (i + 0.5));
}

export function buildHouse(p: HouseParams): HouseModel {
  const assumptions: Msg[] = [];
  // ---- floors and heights: use what was given, derive the rest, and say so --------------------------------------
  let floors = p.floors && p.floors >= 1 ? Math.round(p.floors) : 0;
  let floorH: number;
  let totalH: number;
  if (floors && p.height) {
    floorH = clamp((p.height - PLINTH_H) / floors, 2.4, 4.6);
    totalH = PLINTH_H + floorH * floors;
    if (Math.abs(totalH - p.height) > 0.05) assumptions.push({ key: "wb.h.heightAdjusted", params: { h: round1(p.height), shown: round1(totalH) } });
    else if (Math.abs(floorH - (p.height - PLINTH_H) / floors) < 1e-9) assumptions.push({ key: "wb.h.floorHeightDerived", params: { fh: round2(floorH) } });
  } else if (floors) {
    floorH = DEFAULT_FLOOR_H;
    totalH = PLINTH_H + floorH * floors;
    assumptions.push({ key: "wb.h.floorHeightAssumed", params: { fh: DEFAULT_FLOOR_H, h: round1(totalH) } });
  } else if (p.height) {
    floors = Math.max(1, Math.round((p.height - PLINTH_H) / DEFAULT_FLOOR_H));
    floorH = clamp((p.height - PLINTH_H) / floors, 2.4, 4.6);
    totalH = PLINTH_H + floorH * floors;
    assumptions.push({ key: "wb.h.floorsAssumed", params: { n: floors, fh: DEFAULT_FLOOR_H } });
  } else {
    floors = 1;
    floorH = DEFAULT_FLOOR_H;
    totalH = PLINTH_H + floorH;
    assumptions.push({ key: "wb.h.oneFloorAssumed" });
  }
  const archetype = archetypeFor(p.use, floors);
  const slabTop: number[] = [];
  const floorBase: number[] = [];
  for (let i = 0; i < floors; i++) {
    floorBase.push(PLINTH_H + i * floorH);
    slabTop.push(PLINTH_H + (i + 1) * floorH);
  }

  // ---- openings -------------------------------------------------------------------------------------------------
  const openings: Opening[] = [];
  const winW = archetype === "commercial" ? 2.0 : 1.2;
  const winH = Math.min(1.2, floorH - 1.2);
  const sill = Math.max(0.6, Math.min(0.9, floorH - winH - 0.5));
  const doorH = Math.min(2.1, floorH - 0.4);
  const frontSlots = slots(p.w, winW, 0.9);
  const rearSlots = slots(p.w, winW, 0.9);
  const sideSlots = slots(p.d, winW, 0.9);
  const doorSlot = frontSlots.length > 2 ? 0 : frontSlots.length - 1;
  const doorAt = frontSlots[doorSlot] ?? p.w / 2;
  const balcony: Balcony[] = [];
  for (let f = 0; f < floors; f++) {
    // front
    if (f === 0) {
      if (archetype === "commercial") {
        const glassW = Math.max(1.5, p.w - 2.4);
        openings.push({ id: `front-${f}-shop`, floor: f, side: "front", at: doorAt === p.w / 2 ? p.w * 0.35 : glassW / 2 + 0.6, w: Math.min(glassW, p.w * 0.6), h: Math.min(2.4, floorH - 0.5), sill: 0.3, kind: "shop" });
        openings.push({ id: `front-${f}-door`, floor: f, side: "front", at: p.w - 1.2, w: 1.1, h: doorH, sill: 0, kind: "door" });
      } else if (archetype === "industrial") {
        const rw = Math.min(4, p.w * 0.5);
        openings.push({ id: `front-${f}-roll`, floor: f, side: "front", at: p.w / 2, w: rw, h: Math.min(3.6, floorH - 0.3), sill: 0, kind: "rollup" });
      } else {
        frontSlots.forEach((c, i) => {
          if (i === doorSlot) openings.push({ id: `front-${f}-door`, floor: f, side: "front", at: c, w: 1.05, h: doorH, sill: 0, kind: "door" });
          else openings.push({ id: `front-${f}-w${i}`, floor: f, side: "front", at: c, w: winW, h: winH, sill, kind: "window" });
        });
      }
    } else {
      const mid = Math.floor(frontSlots.length / 2);
      const hasBalcony = archetype !== "industrial" && p.w >= 4 && p.z0 >= 0.7;
      frontSlots.forEach((c, i) => {
        if (hasBalcony && i === mid) openings.push({ id: `front-${f}-bd`, floor: f, side: "front", at: c, w: 1.0, h: doorH, sill: 0, kind: "balconyDoor" });
        else openings.push({ id: `front-${f}-w${i}`, floor: f, side: "front", at: c, w: winW, h: winH, sill, kind: "window" });
      });
      if (hasBalcony) {
        const depth = clamp(Math.min(1.2, p.z0 - 0.05), 0.6, 1.2);
        const bw = Math.min(3.2, Math.max(1.8, p.w * 0.45));
        balcony.push({ id: `balcony-${f}`, floor: f, x: frontSlots[mid] ?? p.w / 2, w: bw, depth });
      }
    }
    // rear and sides: windows (industrial: a high band instead)
    const wH = archetype === "industrial" ? 0.9 : winH;
    const wSill = archetype === "industrial" ? Math.max(2.4, floorH - 1.2) : sill;
    rearSlots.forEach((c, i) => openings.push({ id: `rear-${f}-w${i}`, floor: f, side: "rear", at: c, w: winW, h: wH, sill: wSill, kind: "window" }));
    sideSlots.forEach((c, i) => {
      openings.push({ id: `left-${f}-w${i}`, floor: f, side: "left", at: c, w: winW, h: wH, sill: wSill, kind: "window" });
      openings.push({ id: `right-${f}-w${i}`, floor: f, side: "right", at: c, w: winW, h: wH, sill: wSill, kind: "window" });
    });
  }
  if (balcony.length) assumptions.push({ key: "wb.h.balconyProjection", params: { d: round2(balcony[0]!.depth) } });

  // ---- roof -------------------------------------------------------------------------------------------------------
  const pitched = archetype === "house_pitched";
  const shed = archetype === "industrial";
  const span = Math.min(p.w, p.d);
  const roof = {
    type: (pitched ? "gable" : shed ? "shed" : "flat") as "gable" | "flat" | "shed",
    ridgeAlongX: p.w >= p.d,
    rise: pitched ? Math.min(2.4, (span / 2) * Math.tan((28 * Math.PI) / 180)) : shed ? Math.min(1.4, span * 0.08) : 0,
    overhang: pitched || shed ? 0.45 : 0,
  };
  if (roof.rise > 0) assumptions.push({ key: "wb.h.roofNotCounted" });
  const rooftop = roof.type === "flat" && (archetype === "house_flat" || archetype === "institutional" || archetype === "commercial");
  if (rooftop) assumptions.push({ key: "wb.h.rooftopNotCounted" });

  // ---- construction timeline (shares sum to 1) ------------------------------------------------------------------
  const stages: Stage[] = [];
  let cursor = 0;
  const add = (id: string, label: Msg, share: number) => {
    stages.push({ id, label, start: cursor, end: cursor + share });
    cursor += share;
  };
  add("site", { key: "wb.stage.site" }, 0.05);
  add("foundation", { key: "wb.stage.foundation" }, 0.1);
  add("plinth", { key: "wb.stage.plinth" }, 0.05);
  const floorShare = 0.52 / floors;
  for (let f = 0; f < floors; f++) {
    add(`walls-${f}`, { key: "wb.stage.walls", params: { n: f + 1 } }, floorShare * 0.7);
    add(`slab-${f}`, { key: "wb.stage.slab", params: { n: f + 1 } }, floorShare * 0.3);
  }
  add("roof", { key: "wb.stage.roof" }, 0.1);
  add("openings", { key: "wb.stage.openings" }, 0.08);
  add("finish", { key: "wb.stage.finish" }, 0.06);
  add("landscape", { key: "wb.stage.landscape" }, 0.04);
  stages[stages.length - 1]!.end = 1; // absorb float drift
  const byId = new Map(stages.map((s) => [s.id, s]));

  return {
    floors,
    floorH,
    plinthH: PLINTH_H,
    slabT: SLAB_T,
    slabTop,
    floorBase,
    totalH,
    archetype,
    fp: { x0: p.x0, z0: p.z0, w: p.w, d: p.d },
    wallT: WALL_T,
    openings,
    balconies: balcony,
    roof,
    rooftop,
    assumptions,
    stages,
    stage: (id) => byId.get(id) ?? stages[0]!,
    stageAt: (pr) => stages.find((s) => pr < s.end) ?? stages[stages.length - 1]!,
  };
}

/** 0 before `start`, 1 after `end`, linear in between (eased). */
export function phase(progress: number, start: number, end: number): number {
  if (end <= start) return progress >= end ? 1 : 0;
  const t = clamp((progress - start) / (end - start), 0, 1);
  return t * t * (3 - 2 * t);
}

const round1 = (n: number): number => Math.round(n * 10) / 10;
const round2 = (n: number): number => Math.round(n * 100) / 100;
