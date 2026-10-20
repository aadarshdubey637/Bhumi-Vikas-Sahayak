// Orthographic projection for the 3D view (no 3D library). World axes in metres: x along the road (plot width),
// y away from the road (plot depth, front edge at y = 0), z up. Pure functions, unit-tested.
export interface V3 {
  x: number;
  y: number;
  z: number;
}
export interface Cam {
  /** degrees, rotation about the vertical axis */
  yaw: number;
  /** degrees above the horizon: 90 = straight down */
  pitch: number;
  zoom: number;
}
export const DEFAULT_CAM: Cam = { yaw: -32, pitch: 38, zoom: 1 };
export const clampCam = (c: Cam): Cam => ({
  yaw: ((((c.yaw + 180) % 360) + 360) % 360) - 180,
  pitch: Math.min(85, Math.max(8, c.pitch)),
  zoom: Math.min(4, Math.max(0.4, c.zoom)),
});

const rad = (d: number): number => (d * Math.PI) / 180;

/** Screen-plane coordinates (before scaling; y grows upward) and the distance towards the viewer (larger = nearer). */
export function project(p: V3, c: V3, cam: Cam): { sx: number; sy: number; depth: number } {
  const t = rad(cam.yaw);
  const ph = rad(cam.pitch);
  const dx = p.x - c.x;
  const dy = p.y - c.y;
  const xr = dx * Math.cos(t) - dy * Math.sin(t);
  const yr = dx * Math.sin(t) + dy * Math.cos(t);
  return { sx: xr, sy: p.z * Math.cos(ph) + yr * Math.sin(ph), depth: -yr * Math.cos(ph) + p.z * Math.sin(ph) };
}

/** Does a face with this outward horizontal normal turn towards the viewer? */
export function wallFacesViewer(nx: number, ny: number, cam: Cam): boolean {
  const t = rad(cam.yaw);
  const nyr = nx * Math.sin(t) + ny * Math.cos(t);
  return -nyr * Math.cos(rad(cam.pitch)) > 1e-9;
}

export interface Box {
  x0: number;
  y0: number;
  w: number;
  d: number;
  h: number;
}
export interface Face {
  id: string;
  pts: V3[];
  /** 0..1 light factor for shading */
  light: number;
  kind: "wall" | "roof";
}

/** The visible faces of a box, far to near. Walls are listed counter-clockwise seen from outside. */
export function boxFaces(b: Box, cam: Cam): Face[] {
  const { x0, y0, w, d, h } = b;
  const x1 = x0 + w;
  const y1 = y0 + d;
  const v = (x: number, y: number, z: number): V3 => ({ x, y, z });
  const walls: Array<{ id: string; nx: number; ny: number; pts: V3[]; light: number }> = [
    { id: "front", nx: 0, ny: -1, pts: [v(x0, y0, 0), v(x1, y0, 0), v(x1, y0, h), v(x0, y0, h)], light: 0.82 },
    { id: "right", nx: 1, ny: 0, pts: [v(x1, y0, 0), v(x1, y1, 0), v(x1, y1, h), v(x1, y0, h)], light: 0.62 },
    { id: "back", nx: 0, ny: 1, pts: [v(x1, y1, 0), v(x0, y1, 0), v(x0, y1, h), v(x1, y1, h)], light: 0.7 },
    { id: "left", nx: -1, ny: 0, pts: [v(x0, y1, 0), v(x0, y0, 0), v(x0, y0, h), v(x0, y1, h)], light: 0.9 },
  ];
  const faces: Face[] = walls.filter((f) => wallFacesViewer(f.nx, f.ny, cam)).map((f) => ({ id: f.id, pts: f.pts, light: f.light, kind: "wall" as const }));
  faces.push({ id: "roof", pts: [v(x0, y0, h), v(x1, y0, h), v(x1, y1, h), v(x0, y1, h)], light: 1, kind: "roof" });
  const centre: V3 = { x: x0 + w / 2, y: y0 + d / 2, z: h / 2 };
  const depthOf = (f: Face): number => {
    const mid = f.pts.reduce((a, p) => ({ x: a.x + p.x / f.pts.length, y: a.y + p.y / f.pts.length, z: a.z + p.z / f.pts.length }), { x: 0, y: 0, z: 0 });
    return project(mid, centre, cam).depth;
  };
  return faces.sort((a, b2) => depthOf(a) - depthOf(b2));
}

/** Fit a set of projected points into a viewport: returns scale and offset so everything is visible with a margin. */
export function fit(points: Array<{ sx: number; sy: number }>, width: number, height: number, margin: number, zoom: number) {
  const xs = points.map((p) => p.sx);
  const ys = points.map((p) => p.sy);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const w = Math.max(maxX - minX, 1e-6);
  const h = Math.max(maxY - minY, 1e-6);
  const scale = (Math.min((width - 2 * margin) / w, (height - 2 * margin) / h)) * zoom;
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  return { scale, to: (p: { sx: number; sy: number }) => ({ x: width / 2 + (p.sx - cx) * scale, y: height / 2 - (p.sy - cy) * scale }) };
}
