// Pure geometry helpers for PlotPreviewSvg. Backend geometry is metres, origin bottom-left;
// edge i runs from point i to point i+1. SVG y grows downward, so Y is flipped here.
import type { PlotAnnotation, PlotGeometry } from "@/api/types";

export interface Pt {
  x: number;
  y: number;
}
export interface LabelPlacement {
  edge: number;
  text: string;
  x: number;
  y: number;
  anchor: "start" | "middle" | "end";
}
export interface RoadBand {
  edge: number;
  label: string;
  /** polygon corners in screen space */
  points: Pt[];
  labelAt: Pt;
}
export interface PlotLayout {
  scale: number;
  width: number;
  height: number;
  polygon: Pt[];
  labels: LabelPlacement[];
  roads: RoadBand[];
}

export interface LayoutOptions {
  width: number;
  height: number;
  /** padding in px for labels / road bands */
  pad: number;
  labelOffset: number;
  roadThickness: number;
}
export const DEFAULT_LAYOUT: LayoutOptions = {
  width: 480,
  height: 360,
  pad: 56,
  labelOffset: 16,
  roadThickness: 22,
};

export function computeLayout(
  geo: PlotGeometry,
  annotations: PlotAnnotation[],
  opts: LayoutOptions = DEFAULT_LAYOUT,
): PlotLayout | null {
  const pts = geo.points;
  if (pts.length < 3) return null;
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const w = maxX - minX;
  const h = maxY - minY;
  if (!(w > 0) || !(h > 0)) return null;

  const availW = opts.width - 2 * opts.pad;
  const availH = opts.height - 2 * opts.pad;
  const scale = Math.min(availW / w, availH / h); // uniform
  const offX = (opts.width - w * scale) / 2;
  const offY = (opts.height - h * scale) / 2;
  const toScreen = (p: [number, number]): Pt => ({
    x: offX + (p[0] - minX) * scale,
    y: offY + (maxY - p[1]) * scale, // flip Y
  });

  const polygon = pts.map(toScreen);
  const cx = polygon.reduce((a, p) => a + p.x, 0) / polygon.length;
  const cy = polygon.reduce((a, p) => a + p.y, 0) / polygon.length;

  const edgeInfo = (i: number) => {
    const a = polygon[i % polygon.length];
    const b = polygon[(i + 1) % polygon.length];
    if (!a || !b) return null;
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    let nx = dy / len;
    let ny = -dx / len;
    // choose the normal that points away from the centroid
    if (nx * (mid.x - cx) + ny * (mid.y - cy) < 0) {
      nx = -nx;
      ny = -ny;
    }
    return { a, b, mid, nx, ny };
  };

  const labels: LabelPlacement[] = [];
  for (const dl of geo.dimension_labels) {
    const e = edgeInfo(dl.edge);
    if (!e) continue;
    const x = e.mid.x + e.nx * opts.labelOffset;
    const y = e.mid.y + e.ny * opts.labelOffset + 4; // +4: optical baseline centring
    const anchor: LabelPlacement["anchor"] = e.nx > 0.5 ? "start" : e.nx < -0.5 ? "end" : "middle";
    labels.push({ edge: dl.edge, text: dl.text, x, y, anchor });
  }

  const roads: RoadBand[] = [];
  for (const an of annotations) {
    if (an.type !== "road") continue;
    const e = edgeInfo(an.edge);
    if (!e) continue;
    const t = opts.roadThickness;
    const o = 4; // gap between plot edge and road band
    const p1 = { x: e.a.x + e.nx * o, y: e.a.y + e.ny * o };
    const p2 = { x: e.b.x + e.nx * o, y: e.b.y + e.ny * o };
    const p3 = { x: e.b.x + e.nx * (o + t), y: e.b.y + e.ny * (o + t) };
    const p4 = { x: e.a.x + e.nx * (o + t), y: e.a.y + e.ny * (o + t) };
    roads.push({
      edge: an.edge,
      label: an.label,
      points: [p1, p2, p3, p4],
      labelAt: { x: e.mid.x + e.nx * (o + t / 2 + 4), y: e.mid.y + e.ny * (o + t / 2 + 4) },
    });
  }

  return { scale, width: opts.width, height: opts.height, polygon, labels, roads };
}

export const toPointsAttr = (pts: Pt[]): string =>
  pts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
