import { Box, Compass, Layers, LayoutGrid, Ruler, Trees, TriangleAlert } from "lucide-react";
import { Component, lazy, Suspense, useMemo, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { AnimController, webglAvailable } from "@/lib/anim";
import { buildHouse, type HouseParams } from "@/lib/house";
import { fmtNum, placeBuilding, type Metrics } from "@/lib/workbench";
import { BuildingCanvas, type CanvasFlags } from "./BuildingCanvas";
import { ConstructionBar } from "./ConstructionBar";
import { FloorPlanView } from "./FloorPlanView";
import type { PresetName } from "../workbench3d/HouseScene";

const HouseScene = lazy(() => import("../workbench3d/HouseScene"));

class SceneBoundary extends Component<{ onError: () => void; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch() {
    this.props.onError();
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

type View = "3d" | "site" | "floor";
const PRESETS: PresetName[] = ["perspective", "front", "rear", "left", "right", "top"];
const seg = (on: boolean) => `inline-flex min-h-tap items-center gap-1.5 rounded-lg px-3 text-sm font-semibold transition-colors ${on ? "bg-navy text-white shadow" : "text-ink-soft hover:bg-surface/80"}`;
const chip = (on: boolean) => `inline-flex min-h-tap items-center gap-1.5 rounded-lg border px-2.5 text-xs font-semibold transition-colors ${on ? "border-brand-ring bg-brand-tint text-brand-dark" : "border-line bg-surface/70 text-ink-soft hover:border-brand-ring"}`;

/** The Workbench's main stage: realistic 3D house on the user's plot, site plan, floor plans, construction animation. */
export function WorkbenchViewer({ metrics, frontMin, rearMin, flags, guidesStale }: { metrics: Metrics; frontMin?: number; rearMin?: number; flags: CanvasFlags; guidesStale?: boolean }) {
  const { t } = useTranslation();
  const [view, setView] = useState<View>("3d");
  const [floorView, setFloorView] = useState<"all" | number>("all");
  const [planFloor, setPlanFloor] = useState(0);
  const [preset, setPreset] = useState<{ name: PresetName; nonce: number }>({ name: "perspective", nonce: 0 });
  const [show, setShow] = useState({ measures: true, context: true, zones: true });
  const [broken, setBroken] = useState(false);
  const ctrlRef = useRef<AnimController>();
  if (!ctrlRef.current) ctrlRef.current = new AnimController(1);
  const ctrl = ctrlRef.current;
  const gl = useMemo(() => webglAvailable(), []);

  const place = placeBuilding(metrics, frontMin);
  const params: HouseParams | null = useMemo(() => {
    if (metrics.plotW === undefined || metrics.plotD === undefined || !place) return null;
    return { plotW: metrics.plotW, plotD: metrics.plotD, roadW: metrics.roadW, x0: place.x0, z0: place.y0, w: place.w, d: place.d, floors: metrics.floors, height: metrics.height, use: metrics.use };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- place is derived from the metrics listed
  }, [metrics.plotW, metrics.plotD, metrics.roadW, metrics.floors, metrics.height, metrics.use, place?.x0, place?.y0, place?.w, place?.d]);
  const model = useMemo(() => (params ? buildHouse(params) : null), [params]);
  const drawable = metrics.plotW !== undefined && metrics.plotD !== undefined;
  const floorsN = model?.floors ?? 0;
  const safeFloor = Math.min(planFloor, Math.max(0, floorsN - 1));
  const use3d = gl && !broken;
  const floorName = (f: number) => (f === 0 ? t("wb.floor.ground") : t("wb.floor.nth", { n: f }));

  const stats = model
    ? (() => {
        const foot = model.fp.w * model.fp.d;
        const coverage = metrics.plotAreaSqm ? (foot / metrics.plotAreaSqm) * 100 : undefined;
        return { foot, coverage, total: foot * model.floors };
      })()
    : null;

  const summary = model
    ? t("wb.v.summary", { floors: model.floors, h: fmtNum(model.totalH, 1), fw: fmtNum(model.fp.w), fd: fmtNum(model.fp.d) })
    : drawable
      ? t("wb.v.summaryPlotOnly", { w: fmtNum(metrics.plotW!), d: fmtNum(metrics.plotD!) })
      : t("wb.cv.empty");

  const tabs: Array<{ id: View; label: string; icon: typeof Box }> = [
    { id: "3d", label: t("wb.v.view3d"), icon: Box },
    { id: "site", label: t("wb.v.viewSite"), icon: LayoutGrid },
    { id: "floor", label: t("wb.v.viewFloor"), icon: Layers },
  ];

  return (
    <section aria-label={t("wb.cv.title")} className="glass-strong overflow-hidden rounded-3xl">
      <div className="flex flex-wrap items-center gap-2 border-b border-line p-2.5">
        <div role="tablist" aria-label={t("wb.cv.view")} className="inline-flex gap-1 rounded-xl bg-surface-sunken p-1">
          {tabs.map((x) => (
            <button key={x.id} role="tab" type="button" aria-selected={view === x.id} className={seg(view === x.id)} onClick={() => setView(x.id)}>
              <x.icon aria-hidden="true" className="h-4 w-4" />
              {x.label}
            </button>
          ))}
        </div>
        {view === "3d" && use3d && drawable ? (
          <div role="group" aria-label={t("wb.v.camera")} className="flex flex-wrap gap-1">
            {PRESETS.map((pn) => (
              <button key={pn} type="button" className={chip(preset.name === pn)} aria-pressed={preset.name === pn} onClick={() => setPreset((p) => ({ name: pn, nonce: p.nonce + 1 }))}>
                {pn === "perspective" ? <Compass aria-hidden="true" className="h-3.5 w-3.5" /> : null}
                {t(`wb.v.cam.${pn}`)}
              </button>
            ))}
          </div>
        ) : null}
        {view === "3d" && use3d && drawable ? (
          <div role="group" aria-label={t("wb.v.layers")} className="ml-auto flex flex-wrap gap-1">
            <button type="button" className={chip(show.measures)} aria-pressed={show.measures} onClick={() => setShow((s) => ({ ...s, measures: !s.measures }))}>
              <Ruler aria-hidden="true" className="h-3.5 w-3.5" />
              {t("wb.v.measures")}
            </button>
            <button type="button" className={chip(show.zones)} aria-pressed={show.zones} onClick={() => setShow((s) => ({ ...s, zones: !s.zones }))}>
              {t("wb.v.zones")}
            </button>
            <button type="button" className={chip(show.context)} aria-pressed={show.context} onClick={() => setShow((s) => ({ ...s, context: !s.context }))}>
              <Trees aria-hidden="true" className="h-3.5 w-3.5" />
              {t("wb.v.context")}
            </button>
          </div>
        ) : null}
      </div>

      {model && view !== "site" ? (
        <div role="group" aria-label={t("wb.floor.label")} className="flex flex-wrap items-center gap-1.5 border-b border-line px-2.5 py-2">
          <span className="text-xs font-semibold text-ink-soft">{t("wb.floor.label")}:</span>
          {view === "3d" ? (
            <button type="button" className={chip(floorView === "all")} aria-pressed={floorView === "all"} onClick={() => { setFloorView("all"); setPreset((q) => ({ name: "perspective", nonce: q.nonce + 1 })); }}>
              {t("wb.floor.all")}
            </button>
          ) : null}
          {Array.from({ length: floorsN }, (_, f) => {
            const on = view === "3d" ? floorView === f : safeFloor === f;
            return (
              <button key={f} type="button" className={chip(on)} aria-pressed={on} onClick={() => { if (view === "3d") { setFloorView(f); setPreset((q) => ({ name: "inspect", nonce: q.nonce + 1 })); } else setPlanFloor(f); }}>
                {floorName(f)}
              </button>
            );
          })}
        </div>
      ) : null}

      <div className="relative">
        <div className="pointer-events-none absolute left-3 top-3 z-10 flex max-w-[calc(100%-1.5rem)] flex-wrap gap-1.5">
          <span className="rounded-full border border-pending-line bg-pending-tint px-2.5 py-1 text-xs font-semibold text-pending">{t("wb.cv.illustrative")}</span>
          {frontMin !== undefined || rearMin !== undefined ? (
            <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${guidesStale ? "border-muted-line bg-muted-tint text-muted" : "border-info-line bg-info-tint text-info"}`}>{guidesStale ? t("wb.cv.guidesStale") : t("wb.cv.guidesShown")}</span>
          ) : null}
          {place && (place.assumedX || place.assumedY) ? <span className="rounded-full border border-muted-line bg-muted-tint px-2.5 py-1 text-xs font-semibold text-muted">{t("wb.cv.assumedPos")}</span> : null}
          {place?.outside ? <span className="rounded-full border border-danger-line bg-danger-tint px-2.5 py-1 text-xs font-semibold text-danger">{t("wb.cv.outside")}</span> : null}
          {view === "3d" && !use3d ? (
            <span className="inline-flex items-center gap-1 rounded-full border border-muted-line bg-muted-tint px-2.5 py-1 text-xs font-semibold text-muted">
              <TriangleAlert aria-hidden="true" className="h-3.5 w-3.5" />
              {gl ? t("wb.v.sceneFailed") : t("wb.v.noWebgl")}
            </span>
          ) : null}
        </div>

        {!drawable ? (
          <div className="flex min-h-[340px] w-full items-center justify-center px-6 py-16 text-center text-sm text-ink-soft sm:min-h-[460px]">{t("wb.cv.empty")}</div>
        ) : view === "site" ? (
          <BuildingCanvas planOnly metrics={metrics} frontMin={frontMin} rearMin={rearMin} flags={flags} guidesStale={guidesStale} />
        ) : view === "floor" ? (
          model ? (
            <FloorPlanView model={model} floor={safeFloor} />
          ) : (
            <div className="flex min-h-[340px] items-center justify-center px-6 py-16 text-center text-sm text-ink-soft">{t("wb.v.needFootprint")}</div>
          )
        ) : use3d ? (
          <div role="img" aria-label={summary} className="relative h-[380px] w-full sm:h-[500px] xl:h-[560px]">
            <SceneBoundary onError={() => setBroken(true)}>
              <Suspense fallback={<div className="flex h-full items-center justify-center text-sm text-ink-soft">{t("wb.v.loading3d")}</div>}>
                <HouseScene plotW={metrics.plotW!} plotD={metrics.plotD!} roadW={metrics.roadW} house={params} ctrl={ctrl} floorView={floorView} show={show} guides={{ frontMin: guidesStale ? undefined : frontMin, rearMin: guidesStale ? undefined : rearMin }} flags={flags} preset={preset} tt={(k, p) => t(k, p) as string} />
              </Suspense>
            </SceneBoundary>
            {!model ? (
              <p className="pointer-events-none absolute inset-x-0 bottom-4 mx-auto w-fit max-w-[90%] rounded-xl bg-navy-night px-3 py-2 text-center text-xs font-semibold text-white">{t("wb.v.needFootprint")}</p>
            ) : null}
          </div>
        ) : (
          <BuildingCanvas metrics={metrics} frontMin={frontMin} rearMin={rearMin} flags={flags} guidesStale={guidesStale} />
        )}
      </div>

      {view === "3d" && use3d && drawable ? <ConstructionBar ctrl={ctrl} model={model} /> : null}

      {stats && model ? (
        <dl className="grid grid-cols-2 gap-x-4 gap-y-1 border-t border-line px-3 py-2.5 text-xs sm:grid-cols-4">
          <div>
            <dt className="text-ink-faint">{t("wb.v.sFloors")}</dt>
            <dd className="tabular font-semibold">{model.floors}</dd>
          </div>
          <div>
            <dt className="text-ink-faint">{t("wb.v.sHeight")}</dt>
            <dd className="tabular font-semibold">{fmtNum(model.totalH, 1)} m <span className="font-normal text-ink-faint">({Math.round(model.totalH * 3.28084)} ft)</span></dd>
          </div>
          <div>
            <dt className="text-ink-faint">{t("wb.v.sCoverage")}</dt>
            <dd className="tabular font-semibold">{stats.coverage !== undefined ? `${fmtNum(stats.coverage, 1)} %` : "—"}</dd>
          </div>
          <div>
            <dt className="text-ink-faint">{t("wb.v.sFloorArea")}</dt>
            <dd className="tabular font-semibold">{fmtNum(stats.total, 1)} m² <span className="font-normal text-ink-faint">({Math.round(stats.total * 10.7639).toLocaleString("en-IN")} sq ft)</span></dd>
          </div>
        </dl>
      ) : null}
      {model && model.assumptions.length ? (
        <details className="border-t border-line px-3 py-2 text-xs text-ink-soft">
          <summary className="min-h-tap cursor-pointer py-2 font-semibold">{t("wb.v.assumptions", { n: model.assumptions.length })}</summary>
          <ul className="list-disc space-y-1 pl-5">
            {model.assumptions.map((a) => (
              <li key={a.key}>{t(a.key, a.params)}</li>
            ))}
          </ul>
        </details>
      ) : null}
      <p className="border-t border-line px-3 py-2 text-xs text-ink-soft">
        {view === "3d" && use3d && drawable ? `${t("wb.v.dragHint")} ` : ""}
        {t("wb.cv.disclaimer")}
      </p>
    </section>
  );
}
