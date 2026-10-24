import { Box, ChevronDown, Info, Layers, LayoutGrid, Move3d, TriangleAlert } from "lucide-react";
import { Component, lazy, Suspense, useMemo, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { webglAvailable } from "@/lib/anim";
import { buildHouse, type HouseParams } from "@/lib/house";
import { fmtNum, placeBuilding, type Metrics } from "@/lib/workbench";
import { BuildingCanvas, type CanvasFlags } from "./BuildingCanvas";
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
const seg = (on: boolean) => `inline-flex h-[2.125rem] items-center gap-2 rounded-lg px-3.5 text-sm font-bold transition-colors ${on ? "bg-[#262c3d] text-white ring-1 ring-inset ring-white/25" : "text-white/75 hover:bg-white/10 hover:text-white"}`;
const chip = (on: boolean) => `inline-flex h-[2.125rem] items-center gap-1.5 rounded-lg px-3 text-sm font-semibold transition-colors ${on ? "bg-[#262c3d] text-white ring-1 ring-inset ring-white/25" : "text-white/75 hover:bg-white/10 hover:text-white"}`;

/** The Workbench's main stage: realistic 3D house on the user's plot, site plan, floor plans, construction animation. */
export function WorkbenchViewer({ metrics, frontMin, rearMin, frontRule, rearRule, flags, guidesStale }: { metrics: Metrics; frontMin?: number; rearMin?: number; frontRule?: string; rearRule?: string; flags: CanvasFlags; guidesStale?: boolean }) {
  const { t } = useTranslation();
  const [view, setView] = useState<View>("3d");
  const [floorView, setFloorView] = useState<"all" | number>("all");
  const [planFloor, setPlanFloor] = useState(0);
  const [preset, setPreset] = useState<{ name: PresetName; nonce: number }>({ name: "perspective", nonce: 0 });
  const show = { measures: true, zones: true };
  const [broken, setBroken] = useState(false);
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
    <section aria-label={t("wb.cv.title")} className="flex min-h-0 flex-1 flex-col">
      <h2 className="flex h-[2.8125rem] shrink-0 items-center gap-2.5 px-4 text-sm font-bold text-ink">
        <span aria-hidden="true" className="inline-flex h-[1.375rem] w-[1.375rem] items-center justify-center rounded-md bg-navy text-[0.6875rem] text-white">02</span>
        {t("wb.cv.title")}
      </h2>

      <div className="theme-light relative min-h-[22.5rem] flex-1 bg-white">
        {/* floating toolbar: view tabs and reset on the left, layers on the right (as in the reference design) */}
        <div className="absolute left-3 top-3 z-20 flex flex-wrap items-center gap-2">
          <div role="tablist" aria-label={t("wb.cv.view")} className="inline-flex items-center gap-1 rounded-xl bg-[#131722] p-1.5 shadow-lg">
            {tabs.map((x) => (
              <button key={x.id} role="tab" type="button" aria-label={x.label} title={x.label} aria-selected={view === x.id} className={seg(view === x.id)} onClick={() => setView(x.id)}>
                <x.icon aria-hidden="true" className="h-4 w-4" />
                <span className="hidden sm:inline">{x.label}</span>
              </button>
            ))}
            {view === "3d" && use3d && drawable ? (
              <button type="button" aria-label={t("wb.v.resetView")} title={t("wb.v.resetView")} className={seg(false)} onClick={() => setPreset((p) => ({ name: "perspective", nonce: p.nonce + 1 }))}>
                <Move3d aria-hidden="true" className="h-4 w-4" />
                <span className="hidden sm:inline">{t("wb.v.resetView")}</span>
              </button>
            ) : null}
          </div>
        </div>
        {drawable ? (
          <details className="group absolute right-3 top-3 z-20">
            <summary aria-label={t("wb.v.legend")} className="inline-flex h-[2.625rem] cursor-pointer list-none items-center gap-2 rounded-xl bg-[#131722] px-3 text-sm font-bold text-white shadow-lg sm:px-4 [&::-webkit-details-marker]:hidden">
              <Info aria-hidden="true" className="h-[1.125rem] w-[1.125rem]" />
              <span className="hidden sm:inline">{t("wb.v.legend")}</span>
              <ChevronDown aria-hidden="true" className="h-3.5 w-3.5 transition-transform group-open:rotate-180" />
            </summary>
            <div role="group" aria-label={t("wb.v.lgTitle")} className="absolute right-0 top-full mt-2 max-h-[60vh] w-[19rem] overflow-y-auto rounded-xl bg-[#131722] p-4 text-white shadow-lg">
              <p className="mb-3 text-sm font-extrabold uppercase tracking-wider">{t("wb.v.lgTitle")}</p>
              <ul className="space-y-3 text-sm">
                {([["#3b6fe0", "wb.v.lgOk"], ["#c9a227", "wb.v.lgNeed"], ["#d63a5a", "wb.v.lgBad"], ["#8a93a6", "wb.v.lgMass"]] as const).map(([c, k]) => (
                  <li key={k} className="flex items-center gap-2.5">
                    <span aria-hidden="true" className="h-4 w-4 shrink-0 rounded-[4px] border-2 bg-transparent" style={{ borderColor: c }} />
                    {t(k)}
                  </li>
                ))}
              </ul>
              {model && model.assumptions.length ? (
                <div className="mt-3 border-t border-white/15 pt-3">
                  <p className="text-xs font-bold uppercase tracking-wide text-white/80">{t("wb.v.assumptions", { n: model.assumptions.length })}</p>
                  <ul className="mt-1.5 list-disc space-y-1 pl-4 text-xs text-white/70">
                    {model.assumptions.map((a) => (
                      <li key={a.key}>{t(a.key, a.params)}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
              <p className="mt-3 border-t border-white/15 pt-3 text-xs leading-relaxed text-white/60">
                {use3d && drawable && view === "3d" ? `${t("wb.v.dragHint")} ` : ""}
                {t("wb.cv.disclaimer")}
              </p>
            </div>
          </details>
        ) : null}

        <div className="pointer-events-none absolute bottom-[4.5rem] right-3 z-10 flex max-w-[85%] flex-wrap justify-end gap-1.5 sm:bottom-3 sm:max-w-[55%]">
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

        {model && view !== "site" ? (
          <div role="group" aria-label={t("wb.floor.label")} className="absolute bottom-3 left-3 z-20 flex flex-wrap items-center gap-1.5 rounded-xl bg-[#131722] p-1.5 shadow-lg">
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

        {!drawable ? (
          <div className="absolute inset-0 flex items-center justify-center p-6" style={{ backgroundImage: "linear-gradient(rgba(15,23,42,0.07) 1px, transparent 1px), linear-gradient(90deg, rgba(15,23,42,0.07) 1px, transparent 1px)", backgroundSize: "150px 150px" }}>
            <div className="w-full max-w-[30rem] rounded-2xl bg-[#232a3a] px-8 py-9 text-center text-white shadow-2xl">
              <span aria-hidden="true" className="mx-auto inline-flex h-16 w-16 items-center justify-center rounded-2xl border border-white/10 bg-[#1a202d]">
                <LayoutGrid className="h-7 w-7" />
              </span>
              <h3 className="mt-5 text-xl font-bold">{t("wb.v.noPlotTitle")}</h3>
              <p className="mt-2 text-base leading-relaxed text-white/85">{t("wb.cv.empty")}</p>
            </div>
          </div>
        ) : view === "site" ? (
          <div className="h-full overflow-auto pt-14">
            <BuildingCanvas planOnly metrics={metrics} frontMin={frontMin} rearMin={rearMin} flags={flags} guidesStale={guidesStale} />
          </div>
        ) : view === "floor" ? (
          model ? (
            <div className="h-full overflow-auto pt-14">
              <FloorPlanView model={model} floor={safeFloor} />
            </div>
          ) : (
            <div className="flex h-full min-h-[22.5rem] items-center justify-center px-6 py-16 text-center text-sm text-slate-500">{t("wb.v.needFootprint")}</div>
          )
        ) : use3d ? (
          <div role="img" aria-label={summary} className="absolute inset-0">
            <SceneBoundary onError={() => setBroken(true)}>
              <Suspense fallback={<div className="flex h-full items-center justify-center text-sm text-slate-500">{t("wb.v.loading3d")}</div>}>
                <HouseScene plotW={metrics.plotW!} plotD={metrics.plotD!} roadW={metrics.roadW} house={params} floorView={floorView} show={show} guides={{ frontMin: guidesStale ? undefined : frontMin, rearMin: guidesStale ? undefined : rearMin, frontRule, rearRule }} flags={flags} preset={preset} tt={(k, p) => t(k, p) as string} />
              </Suspense>
            </SceneBoundary>
            {!model ? (
              <p className="pointer-events-none absolute inset-x-0 bottom-4 mx-auto w-fit max-w-[90%] rounded-xl bg-[#131722] px-3 py-2 text-center text-xs font-semibold text-white">{t("wb.v.needFootprint")}</p>
            ) : null}
          </div>
        ) : (
          <div className="h-full overflow-auto pt-14">
            <BuildingCanvas metrics={metrics} frontMin={frontMin} rearMin={rearMin} flags={flags} guidesStale={guidesStale} />
          </div>
        )}
      </div>

    </section>
  );
}
