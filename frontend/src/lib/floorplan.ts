// Illustrative room layout for one floor of the generated building. It exists so users can picture the inside of the footprint they
// typed; it is NOT an architectural design and room sizes are NOT checked against any rule. Coordinates in metres inside the
// footprint: x from the left wall, y from the front (road-side) wall.
import type { Archetype } from "./house";

export type RoomKind = "living" | "dining" | "kitchen" | "bedroom" | "toilet" | "stair" | "passage" | "lounge" | "shop" | "store" | "hall" | "office" | "workshop" | "classroom";
export interface Room {
  id: string;
  kind: RoomKind;
  x: number;
  y: number;
  w: number;
  d: number;
}

const r = (id: string, kind: RoomKind, x: number, y: number, w: number, d: number): Room => ({ id, kind, x, y, w, d });
const clamp = (n: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, n));
export const roomArea = (x: Room): number => x.w * x.d;

/** Bands front/middle/rear; each band is split into rooms across the width. */
export function layoutFloor(w: number, d: number, floor: number, floors: number, archetype: Archetype): Room[] {
  const multi = floors > 1;
  if (w < 3.6 || d < 4.8) return [r("room", archetype === "commercial" ? "shop" : "living", 0, 0, w, d)];
  const stairW = multi ? clamp(w * 0.26, 1.2, 2.6) : 0;

  if (archetype === "industrial") {
    const off = clamp(d * 0.2, 2.4, 4);
    return [r("workshop", "workshop", 0, 0, w, d - off), r("office", "office", 0, d - off, w * 0.6, off), r("toilet", "toilet", w * 0.6, d - off, w * 0.4, off)];
  }
  if (archetype === "institutional") {
    const corridor = 1.8;
    const rowD = (d - corridor) / 2;
    const n = Math.max(2, Math.round(w / 5.2));
    const cw = w / n;
    const out: Room[] = [];
    for (let i = 0; i < n; i++) out.push(r(`c-f${i}`, "classroom", i * cw, 0, cw, rowD));
    out.push(r("corridor", "passage", 0, rowD, w - stairW, corridor));
    if (multi) out.push(r("stair", "stair", w - stairW, rowD, stairW, corridor));
    for (let i = 0; i < n; i++) out.push(r(`c-r${i}`, i === n - 1 ? "toilet" : "classroom", i * cw, rowD + corridor, cw, rowD));
    return out;
  }
  if (archetype === "commercial") {
    const fd = d * 0.62;
    const rd = d - fd;
    const out: Room[] = [r("hall", floor === 0 ? "shop" : "hall", 0, 0, w, fd)];
    out.push(r("store", floor === 0 ? "store" : "office", 0, fd, w * 0.45, rd));
    out.push(r("toilet", "toilet", w * 0.45, fd, w * 0.2, rd));
    const sw = multi ? clamp(w * 0.3, 1.2, 2.6) : 0;
    const restW = w * 0.35 - sw;
    if (restW > 0.6) out.push(r("office", "office", w * 0.65, fd, restW, rd));
    if (multi) out.push(r("stair", "stair", w - sw, fd, sw, rd));
    else if (restW <= 0.6) out.push(r("office", "office", w * 0.65, fd, w * 0.35, rd));
    return out;
  }

  // residential house / flats
  const fd = clamp(d * 0.37, 2.6, d - 4);
  const md = clamp(d * 0.27, 1.8, d - fd - 1.8);
  const rd = d - fd - md;
  const out: Room[] = [];
  if (floor === 0) {
    out.push(r("living", "living", 0, 0, w * 0.6, fd), r("bed1", "bedroom", w * 0.6, 0, w * 0.4, fd));
  } else {
    out.push(r("bed1", "bedroom", 0, 0, w * 0.5, fd), r("lounge", "lounge", w * 0.5, 0, w * 0.5, fd));
  }
  if (multi) {
    out.push(r("dining", floor === 0 ? "dining" : "bedroom", 0, fd, w - stairW - Math.min(1.1, w * 0.15), md));
    out.push(r("passage", "passage", w - stairW - Math.min(1.1, w * 0.15), fd, Math.min(1.1, w * 0.15), md));
    out.push(r("stair", "stair", w - stairW, fd, stairW, md));
  } else {
    out.push(r("dining", "dining", 0, fd, w * 0.55, md), r("passage", "passage", w * 0.55, fd, w * 0.45, md));
  }
  out.push(r("kitchen", floor === 0 ? "kitchen" : "bedroom", 0, fd + md, w * 0.4, rd), r("toilet", "toilet", w * 0.4, fd + md, w * 0.18, rd), r("bed2", "bedroom", w * 0.58, fd + md, w * 0.42, rd));
  return out;
}
