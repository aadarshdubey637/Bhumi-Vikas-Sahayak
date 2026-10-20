import { Box, Info, LayoutGrid, Minus, Plus, RotateCcw, RotateCw } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { useTranslation } from "react-i18next";
import { boxFaces, clampCam, DEFAULT_CAM, fit, project, type Cam, type V3 } from "@/lib/projection";
import { fmtNum, placeBuilding, type Metrics } from "@/lib/workbench";

export interface CanvasFlags {
  front: boolean;
  rear: boolean;
  outside: boolean;
}
const W = 720;
const H = 460;
const m = (n: number): string => `${fmtNum(n)} m`;
const pts = (a: Array<{ x: number; y: number }>): string => a.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
const BLUE: [number, number, number] = [52, 101, 220];
const RED: [number, number, number] = [196, 66, 66];
const shade = (base: [number, number, number], light: number): string =>
  `rgb(${base.map((c) => Math.round(c * light + 255 * (1 - light) * 0.12)).join(",")})`;

/** Text with a white halo so labels stay readable over lines and fills. */
function Label({ x, y, children, anchor = "middle", size = 14, color = "#0F1B2D", weight = 600, rotate }: { x: number; y: number; children: React.ReactNode; anchor?: "start" | "middle" | "end"; size?: number; color?: string; weight?: number; rotate?: number }) {
  return (
    <text x={x} y={y} textAnchor={anchor} fontSize={size} fontWeight={weight} fill={color} stroke="#fff" strokeWidth={3.5} paintOrder="stroke" strokeLinejoin="round" transform={rotate ? `rotate(${rotate} ${x} ${y})` : undefined} style={{ fontFamily: "inherit" }}>
      {children}
    </text>
  );
}

/** A dimension line with end ticks and a centred label. */
function Dim({ a, b, text, color = "#3B4A5E", offset = 0, minPx = 0 }: { a: { x: number; y: number }; b: { x: number; y: number }; text: string; color?: string; offset?: number; minPx?: number }) {
  const len = Math.hypot(b.x - a.x, b.y - a.y);
  if (len < minPx) return null;
  const nx = -(b.y - a.y) / (len || 1);
  const ny = (b.x - a.x) / (len || 1);
  const p = (q: { x: number; y: number }) => ({ x: q.x + nx * offset, y: q.y + ny * offset });
  const A = p(a);
  const B = p(b);
  const tick = 4;
  const ang = (Math.atan2(B.y - A.y, B.x - A.x) * 180) / Math.PI;
  const flip = ang > 90 || ang < -90;
  return (
    <g stroke={color} strokeWidth={1.2} fill="none">
      <line x1={A.x} y1={A.y} x2={B.x} y2={B.y} />
      <line x1={A.x + nx * tick} y1={A.y + ny * tick} x2={A.x - nx * tick} y2={A.y - ny * tick} />
      <line x1={B.x + nx * tick} y1={B.y + ny * tick} x2={B.x - nx * tick} y2={B.y - ny * tick} />
      <Label x={(A.x + B.x) / 2} y={(A.y + B.y) / 2 - 5} rotate={flip ? ang + 180 : ang} size={13} color={color}>
        {text}
      </Label>
    </g>
  );
}

function Plan({ x, frontMin, rearMin, flags }: { x: Metrics; frontMin?: number; rearMin?: number; flags: CanvasFlags }) {
  const { t } = useTranslation();
  const pw = x.plotW!;
  const pd = x.plotD!;
  const roadDraw = x.roadW ?? Math.max(pd * 0.14, 3);
  const ml = 60;
  const mr = 176; // room on the right for the rule-limit labels
  const mt = 42;
  const mb = 16;
  const top = pd + Math.max(pd * 0.02, 0.3);
  const s = Math.min((W - ml - mr) / pw, (H - mt - mb) / (top + roadDraw));
  const ox = ml + (W - ml - mr - pw * s) / 2;
  const oy = mt + (H - mt - mb - (top + roadDraw) * s) / 2;
  const X = (wx: number) => ox + wx * s;
  const Y = (wy: number) => oy + (top - wy) * s;
  const roadX0 = X(0) - 34;
  const roadX1 = X(pw) + 34;
  const P = (wx: number, wy: number) => ({ x: X(wx), y: Y(wy) });
  const place = placeBuilding(x, frontMin);
  const bad = flags.outside || flags.front || flags.rear;
  const stroke = bad ? "#A12626" : "#1D4ED8";
  return (
    <g>
      {/* road */}
      <rect x={roadX0} y={Y(0)} width={roadX1 - roadX0} height={roadDraw * s} fill="#C9D0DA" />
      <line x1={roadX0} y1={Y(-roadDraw / 2)} x2={roadX1} y2={Y(-roadDraw / 2)} stroke="#fff" strokeWidth={2} strokeDasharray="10 8" />
      <Label x={roadX1 + 8} y={Y(-roadDraw / 2) + 4} anchor="start" size={13}>
        {x.roadW !== undefined ? t("wb.cv.road", { w: m(x.roadW) }) : t("wb.cv.roadUnknown")}
      </Label>
      {/* plot */}
      <polygon points={pts([P(0, 0), P(pw, 0), P(pw, pd), P(0, pd)])} fill="#EEF3E6" stroke="#0A2342" strokeWidth={2.2} />
      {frontMin !== undefined && frontMin > 0 ? (
        <g>
          <rect x={X(0)} y={Y(frontMin)} width={pw * s} height={frontMin * s} fill="#E8A317" fillOpacity={0.2} stroke="#8F5300" strokeDasharray="6 4" />
          <Label x={X(pw) + 10} y={Y(frontMin / 2) + 4} anchor="start" size={12} color="#8F5300">
            {t("wb.cv.frontMin", { v: m(frontMin) })}
          </Label>
        </g>
      ) : null}
      {rearMin !== undefined && rearMin > 0 ? (
        <g>
          <rect x={X(0)} y={Y(pd)} width={pw * s} height={rearMin * s} fill="#E8A317" fillOpacity={0.2} stroke="#8F5300" strokeDasharray="6 4" />
          <Label x={X(pw) + 10} y={Y(pd - rearMin / 2) + 4} anchor="start" size={12} color="#8F5300">
            {t("wb.cv.rearMin", { v: m(rearMin) })}
          </Label>
        </g>
      ) : null}
      {/* building */}
      {place ? (
        <g>
          <rect x={X(place.x0)} y={Y(place.y0 + place.d)} width={place.w * s} height={place.d * s} fill={bad ? "#C44242" : "#3465DC"} fillOpacity={0.42} stroke={stroke} strokeWidth={2.2} strokeDasharray={place.assumedX || place.assumedY ? "7 4" : undefined} />
          <Label x={X(place.x0 + place.w / 2)} y={Y(place.y0 + place.d / 2) + 4} size={14} color="#0A2342">
            {`${fmtNum(place.w)} × ${fmtNum(place.d)} m`}
          </Label>
          {/* gaps */}
          <Dim a={P(place.x0 + place.w / 2, 0)} b={P(place.x0 + place.w / 2, place.y0)} text={t("wb.cv.gapFront", { v: m(place.y0) })} minPx={22} offset={0} color={place.assumedY ? "#5B6B80" : "#0A2342"} />
          <Dim a={P(0, place.y0 + place.d / 2)} b={P(place.x0, place.y0 + place.d / 2)} text={m(place.x0)} minPx={26} color={place.assumedX ? "#5B6B80" : "#0A2342"} />
          <Dim a={P(place.x0 + place.w, place.y0 + place.d / 2)} b={P(pw, place.y0 + place.d / 2)} text={m(place.rightGap)} minPx={26} color="#5B6B80" />
          <Dim a={P(place.x0 + place.w / 2, place.y0 + place.d)} b={P(place.x0 + place.w / 2, pd)} text={t("wb.cv.gapRear", { v: m(place.rearGap) })} minPx={22} color="#5B6B80" />
        </g>
      ) : null}
      {/* plot dimensions */}
      <Dim a={P(0, pd)} b={P(pw, pd)} text={m(pw)} offset={-16} />
      <Dim a={P(0, 0)} b={P(0, pd)} text={m(pd)} offset={-16} />
      <g transform={`translate(${W - 44} 22)`} aria-hidden="true">
        <path d="M0 14 L6 -4 L12 14 L6 10 Z" fill="#0A2342" />
        <text x={6} y={-8} textAnchor="middle" fontSize={11} fontWeight={700} fill="#0A2342">
          N
        </text>
      </g>
    </g>
  );
}

function Scene3D({ x, cam, frontMin, rearMin, flags }: { x: Metrics; cam: Cam; frontMin?: number; rearMin?: number; flags: CanvasFlags }) {
  const { t } = useTranslation();
  const pw = x.plotW!;
  const pd = x.plotD!;
  const place = placeBuilding(x, frontMin);
  const h = place && x.height !== undefined ? x.height : 0;
  const roadDraw = x.roadW ?? Math.max(pd * 0.14, 3);
  const pad = Math.max(pw, pd) * 0.12;
  const c: V3 = { x: pw / 2, y: pd / 2, z: 0 };
  const v = (px: number, py: number, pz = 0): V3 => ({ x: px, y: py, z: pz });
  const bad = flags.outside || flags.front || flags.rear;

  const scene = useMemo(() => {
    const ground = [v(-pad, -roadDraw), v(pw + pad, -roadDraw), v(pw + pad, pd + pad), v(-pad, pd + pad)];
    const plot = [v(0, 0), v(pw, 0), v(pw, pd), v(0, pd)];
    const road = [v(-pad, -roadDraw), v(pw + pad, -roadDraw), v(pw + pad, 0), v(-pad, 0)];
    const all: V3[] = [...ground, ...(place && h > 0 ? [v(place.x0, place.y0, h), v(place.x0 + place.w, place.y0 + place.d, h)] : [])];
    const proj = all.map((p) => project(p, c, cam));
    const f = fit(proj, W, H, 36, cam.zoom);
    const to = (p: V3) => f.to(project(p, c, cam));
    return { ground, plot, road, to, scale: f.scale };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- c/v are derived from the listed values
  }, [pw, pd, pad, roadDraw, place?.x0, place?.y0, place?.w, place?.d, h, cam.yaw, cam.pitch, cam.zoom]);

  // grid on the ground plane
  const step = (() => {
    const raw = Math.max(pw, pd) / 8;
    const p10 = 10 ** Math.floor(Math.log10(raw));
    return [1, 2, 5, 10].map((k) => k * p10).find((s) => s >= raw) ?? raw;
  })();
  const grid: Array<[V3, V3]> = [];
  for (let gx = Math.ceil(-pad / step) * step; gx <= pw + pad; gx += step) grid.push([v(gx, 0), v(gx, pd + pad)]);
  for (let gy = 0; gy <= pd + pad; gy += step) grid.push([v(-pad, gy), v(pw + pad, gy)]);

  const faces = place && h > 0 ? boxFaces({ x0: place.x0, y0: place.y0, w: place.w, d: place.d, h }, cam) : [];
  const floors = x.floors && x.floors > 1 && x.floors <= 80 ? x.floors : 0;
  const to = scene.to;
  const poly = (a: V3[]) => pts(a.map(to));
  const corner = (px: number, py: number, pz: number) => to(v(px, py, pz));
  // the nearest vertical edge carries the height dimension
  const baseCorners = place ? [v(place.x0, place.y0), v(place.x0 + place.w, place.y0), v(place.x0 + place.w, place.y0 + place.d), v(place.x0, place.y0 + place.d)] : [];
  const nearest = baseCorners.length ? baseCorners.reduce((a, b) => (project(b, c, cam).depth > project(a, c, cam).depth ? b : a)) : null;
  const band = (y0: number, y1: number) => poly([v(0, y0, 0.02), v(pw, y0, 0.02), v(pw, y1, 0.02), v(0, y1, 0.02)]);

  return (
    <g>
      <polygon points={poly(scene.ground)} fill="#F4F6FA" />
      {grid.map((g, i) => (
        <line key={i} x1={to(g[0]).x} y1={to(g[0]).y} x2={to(g[1]).x} y2={to(g[1]).y} stroke="#DCE2EB" strokeWidth={1} />
      ))}
      <polygon points={poly(scene.road)} fill="#C9D0DA" />
      {(() => {
        const a = to(v(-pad, -roadDraw / 2));
        const b = to(v(pw + pad, -roadDraw / 2));
        return <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#fff" strokeWidth={2} strokeDasharray="10 8" />;
      })()}
      <polygon points={poly(scene.plot)} fill="#EEF3E6" stroke="#0A2342" strokeWidth={2.2} />
      {frontMin !== undefined && frontMin > 0 ? <polygon points={band(0, frontMin)} fill="#E8A317" fillOpacity={0.28} stroke="#8F5300" strokeDasharray="6 4" /> : null}
      {rearMin !== undefined && rearMin > 0 ? <polygon points={band(pd - rearMin, pd)} fill="#E8A317" fillOpacity={0.28} stroke="#8F5300" strokeDasharray="6 4" /> : null}
      {place && h <= 0 ? <polygon points={poly([v(place.x0, place.y0, 0.03), v(place.x0 + place.w, place.y0, 0.03), v(place.x0 + place.w, place.y0 + place.d, 0.03), v(place.x0, place.y0 + place.d, 0.03)])} fill="#3465DC" fillOpacity={0.4} stroke="#1D4ED8" strokeWidth={2} /> : null}
      {faces.map((f) => (
        <g key={f.id}>
          <polygon points={poly(f.pts)} fill={shade(bad ? RED : BLUE, f.kind === "roof" ? 1 : f.light)} fillOpacity={f.kind === "roof" ? 0.82 : 0.9} stroke="#0A2342" strokeWidth={1.2} strokeLinejoin="round" />
          {f.kind === "wall" && floors
            ? Array.from({ length: floors - 1 }, (_, i) => {
                const z = ((i + 1) * h) / floors;
                const a = f.pts[0]!;
                const b = f.pts[1]!;
                const A = to(v(a.x, a.y, z));
                const B = to(v(b.x, b.y, z));
                return <line key={i} x1={A.x} y1={A.y} x2={B.x} y2={B.y} stroke="#fff" strokeOpacity={0.45} strokeWidth={0.8} />;
              })
            : null}
        </g>
      ))}
      {nearest && h > 0 ? (
        <Dim a={corner(nearest.x, nearest.y, 0)} b={corner(nearest.x, nearest.y, h)} text={m(h)} offset={-14} color="#0A2342" />
      ) : null}
      {(() => {
        const a = to(v(0, 0));
        const b = to(v(pw, 0));
        const d1 = to(v(0, 0));
        const d2 = to(v(0, pd));
        return (
          <g>
            <Label x={(a.x + b.x) / 2} y={Math.max(a.y, b.y) + 18} size={14}>
              {m(pw)}
            </Label>
            <Label x={(d1.x + d2.x) / 2 - 8} y={(d1.y + d2.y) / 2} anchor="end" size={14}>
              {m(pd)}
            </Label>
          </g>
        );
      })()}
      {(() => {
        const rl = to(v(pw / 2, -roadDraw / 2));
        return (
          <Label x={rl.x} y={rl.y + 14} size={13} color="#3B4A5E">
            {x.roadW !== undefined ? t("wb.cv.road", { w: m(x.roadW) }) : t("wb.cv.roadUnknown")}
          </Label>
        );
      })()}
    </g>
  );
}

export function BuildingCanvas({ metrics, frontMin, rearMin, flags, guidesStale, planOnly = false }: { metrics: Metrics; frontMin?: number; rearMin?: number; flags: CanvasFlags; guidesStale?: boolean; planOnly?: boolean }) {
  const { t } = useTranslation();
  const [mode, setMode] = useState<"3d" | "2d">(planOnly ? "2d" : "3d");
  const [cam, setCam] = useState<Cam>(DEFAULT_CAM);
  const drag = useRef<{ x: number; y: number } | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const drawable = metrics.plotW !== undefined && metrics.plotD !== undefined;
  const place = placeBuilding(metrics, frontMin);
  const guides = frontMin !== undefined || rearMin !== undefined;

  // wheel zoom needs a non-passive listener so the page does not scroll while zooming the model
  useEffect(() => {
    const el = svgRef.current;
    if (!el || mode !== "3d") return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      setCam((c) => clampCam({ ...c, zoom: c.zoom * (e.deltaY < 0 ? 1.1 : 1 / 1.1) }));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [mode, drawable]);

  const onDown = (e: PointerEvent<SVGSVGElement>) => {
    drag.current = { x: e.clientX, y: e.clientY };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };
  const onMove = (e: PointerEvent<SVGSVGElement>) => {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    drag.current = { x: e.clientX, y: e.clientY };
    setCam((c) => clampCam({ ...c, yaw: c.yaw + dx * 0.5, pitch: c.pitch + dy * 0.35 }));
  };
  const onUp = () => (drag.current = null);
  const onKey = (e: KeyboardEvent<SVGSVGElement>) => {
    const step: Record<string, Partial<Cam> | undefined> = { ArrowLeft: { yaw: -10 }, ArrowRight: { yaw: 10 }, ArrowUp: { pitch: -5 }, ArrowDown: { pitch: 5 } };
    const d = step[e.key];
    if (d) setCam((c) => clampCam({ ...c, yaw: c.yaw + (d.yaw ?? 0), pitch: c.pitch + (d.pitch ?? 0) }));
    else if (e.key === "+" || e.key === "=") setCam((c) => clampCam({ ...c, zoom: c.zoom * 1.15 }));
    else if (e.key === "-") setCam((c) => clampCam({ ...c, zoom: c.zoom / 1.15 }));
    else if (e.key === "Home") setCam(DEFAULT_CAM);
    else return;
    e.preventDefault();
  };

  const summary = drawable
    ? t("wb.cv.summary", {
        pw: m(metrics.plotW!),
        pd: m(metrics.plotD!),
        road: metrics.roadW !== undefined ? m(metrics.roadW) : "?",
        b: place ? `${fmtNum(place.w)} × ${fmtNum(place.d)} m` : "—",
        h: metrics.height !== undefined ? m(metrics.height) : "—",
      })
    : t("wb.cv.empty");
  const seg = (active: boolean) =>
    `inline-flex min-h-tap items-center gap-1.5 rounded-lg px-3 text-sm font-semibold transition-colors ${active ? "bg-navy text-white" : "text-ink-soft hover:bg-white/80"}`;
  const ibtn = "inline-flex min-h-tap min-w-tap items-center justify-center rounded-lg border border-line bg-white/85 text-ink-soft hover:border-brand-ring hover:text-brand";

  return (
    <section aria-label={t("wb.cv.title")} className="glass-strong overflow-hidden rounded-2xl">
      <div className={`flex flex-wrap items-center gap-2 border-b border-line p-2.5 ${planOnly ? "hidden" : ""}`}>
        <div role="group" aria-label={t("wb.cv.view")} className="inline-flex gap-1 rounded-xl bg-surface-sunken p-1">
          <button type="button" aria-pressed={mode === "3d"} className={seg(mode === "3d")} onClick={() => setMode("3d")}>
            <Box aria-hidden="true" className="h-4 w-4" />
            {t("wb.cv.view3d")}
          </button>
          <button type="button" aria-pressed={mode === "2d"} className={seg(mode === "2d")} onClick={() => setMode("2d")}>
            <LayoutGrid aria-hidden="true" className="h-4 w-4" />
            {t("wb.cv.view2d")}
          </button>
        </div>
        {mode === "3d" ? (
          <div role="group" aria-label={t("wb.cv.controls")} className="inline-flex gap-1">
            <button type="button" className={ibtn} aria-label={t("wb.cv.rotateLeft")} onClick={() => setCam((c) => clampCam({ ...c, yaw: c.yaw - 15 }))}>
              <RotateCcw aria-hidden="true" className="h-4 w-4" />
            </button>
            <button type="button" className={ibtn} aria-label={t("wb.cv.rotateRight")} onClick={() => setCam((c) => clampCam({ ...c, yaw: c.yaw + 15 }))}>
              <RotateCw aria-hidden="true" className="h-4 w-4" />
            </button>
            <button type="button" className={ibtn} aria-label={t("wb.cv.zoomIn")} onClick={() => setCam((c) => clampCam({ ...c, zoom: c.zoom * 1.2 }))}>
              <Plus aria-hidden="true" className="h-4 w-4" />
            </button>
            <button type="button" className={ibtn} aria-label={t("wb.cv.zoomOut")} onClick={() => setCam((c) => clampCam({ ...c, zoom: c.zoom / 1.2 }))}>
              <Minus aria-hidden="true" className="h-4 w-4" />
            </button>
            <button type="button" className={`${ibtn} gap-1.5 px-3 text-sm font-semibold`} onClick={() => setCam(DEFAULT_CAM)}>
              {t("wb.cv.resetView")}
            </button>
          </div>
        ) : null}
        <details className="relative ml-auto">
          <summary className="inline-flex min-h-tap cursor-pointer list-none items-center gap-1.5 rounded-lg border border-line bg-white/85 px-3 text-sm font-semibold text-ink-soft [&::-webkit-details-marker]:hidden">
            <Info aria-hidden="true" className="h-4 w-4" />
            {t("wb.cv.legend")}
          </summary>
          <ul className="absolute right-0 z-20 mt-1 w-72 space-y-1.5 rounded-xl border border-line bg-surface p-3 text-xs shadow-pop">
            <li className="flex items-center gap-2"><span aria-hidden="true" className="h-3 w-5 rounded-sm border border-brand bg-brand/40" />{t("wb.cv.legBuilding")}</li>
            <li className="flex items-center gap-2"><span aria-hidden="true" className="h-3 w-5 rounded-sm border border-dashed border-pending bg-pending/25" />{t("wb.cv.legGuide")}</li>
            <li className="flex items-center gap-2"><span aria-hidden="true" className="h-3 w-5 rounded-sm border border-danger bg-danger/40" />{t("wb.cv.legBad")}</li>
            <li className="flex items-center gap-2"><span aria-hidden="true" className="h-0 w-5 border-t-2 border-dashed border-ink-faint" />{t("wb.cv.legAssumed")}</li>
          </ul>
        </details>
      </div>
      <div className="relative">
        <div className="pointer-events-none absolute left-3 top-3 z-10 flex flex-wrap gap-1.5">
          <span className="rounded-full border border-pending-line bg-pending-tint px-2.5 py-1 text-xs font-semibold text-pending">{t("wb.cv.illustrative")}</span>
          {guides ? (
            <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${guidesStale ? "border-muted-line bg-muted-tint text-muted" : "border-info-line bg-info-tint text-info"}`}>
              {guidesStale ? t("wb.cv.guidesStale") : t("wb.cv.guidesShown")}
            </span>
          ) : null}
          {place && (place.assumedX || place.assumedY) ? <span className="rounded-full border border-muted-line bg-muted-tint px-2.5 py-1 text-xs font-semibold text-muted">{t("wb.cv.assumedPos")}</span> : null}
          {place?.outside ? <span className="rounded-full border border-danger-line bg-danger-tint px-2.5 py-1 text-xs font-semibold text-danger">{t("wb.cv.outside")}</span> : null}
        </div>
        {drawable ? (
          <svg
            ref={svgRef}
            viewBox={`0 0 ${W} ${H}`}
            role="img"
            aria-label={summary}
            tabIndex={mode === "3d" ? 0 : undefined}
            onPointerDown={mode === "3d" ? onDown : undefined}
            onPointerMove={mode === "3d" ? onMove : undefined}
            onPointerUp={onUp}
            onPointerCancel={onUp}
            onKeyDown={mode === "3d" ? onKey : undefined}
            className={`block h-auto w-full touch-none select-none bg-gradient-to-b from-[#1b3157] to-[#0f1c34] ${mode === "3d" ? "cursor-grab active:cursor-grabbing" : ""}`}
            style={{ maxHeight: "60vh", aspectRatio: `${W} / ${H}` }}
          >
            {mode === "3d" ? <Scene3D x={metrics} cam={cam} frontMin={frontMin} rearMin={rearMin} flags={flags} /> : <Plan x={metrics} frontMin={frontMin} rearMin={rearMin} flags={flags} />}
          </svg>
        ) : (
          <div className="flex min-h-[240px] w-full items-center justify-center px-6 py-10 text-center text-sm text-ink-soft sm:min-h-[320px]">
            {t("wb.cv.empty")}
          </div>
        )}
      </div>
      <p className="border-t border-line px-3 py-2 text-xs text-ink-soft">
        {mode === "3d" && drawable ? `${t("wb.cv.dragHint")} ` : ""}
        {t("wb.cv.disclaimer")}
      </p>
    </section>
  );
}
