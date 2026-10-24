import { Component, lazy, Suspense, useMemo, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { BuildingCanvas } from "@/components/workbench/BuildingCanvas";
import { webglAvailable } from "@/lib/anim";
import type { HouseParams } from "@/lib/house";
import type { Metrics } from "@/lib/workbench";

const HouseScene = lazy(() => import("@/components/workbench3d/HouseScene"));

// A real 30 x 40 ft plot with a three-storey house, built by the same model and scene as the workbench. Purely a sample.
const SAMPLE: HouseParams = { plotW: 9.144, plotD: 12.192, roadW: 9, x0: 1.5, z0: 3.2, w: 6, d: 7, floors: 3, height: 9.5, use: "residential" };
const SAMPLE_METRICS: Metrics = { plotW: 9.144, plotD: 12.192, plotAreaSqm: 111.48, plotAreaDerived: true, roadW: 9, height: 9.5, floors: 3, bldgW: 6, bldgD: 7, gapFront: 3.2, gapLeft: 1.5, use: "residential" };

class Boundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

/** Live, draggable 3D preview of the workbench scene. */
export function HeroPreview() {
  const { t } = useTranslation();
  const gl = useMemo(() => webglAvailable(), []);

  const flat = <BuildingCanvas metrics={SAMPLE_METRICS} flags={{ front: false, rear: false, outside: false }} />;
  return (
    <div className="relative">
      <div aria-hidden="true" className="absolute -inset-6 rounded-[2.5rem] bg-gradient-to-br from-accent/25 via-brand/20 to-transparent blur-3xl" />
      <div className="relative overflow-hidden rounded-[1.75rem] border border-white/20 bg-white/10 shadow-panel backdrop-blur-xl">
        <div className="flex items-center gap-2 border-b border-white/15 px-4 py-2.5">
          <span aria-hidden="true" className="h-2.5 w-2.5 rounded-full bg-[#ff6b6b]" />
          <span aria-hidden="true" className="h-2.5 w-2.5 rounded-full bg-[#f5b301]" />
          <span aria-hidden="true" className="h-2.5 w-2.5 rounded-full bg-[#4ade80]" />
          <span className="ml-2 truncate text-xs font-semibold text-white/80">{t("land.preview.title")}</span>
        </div>
        <div className="relative h-[20rem] bg-white sm:h-[25rem]" role="img" aria-label={t("land.preview.alt")}>
          {gl ? (
            <Boundary fallback={flat}>
              <Suspense fallback={<div className="flex h-full items-center justify-center text-sm text-slate-600">{t("wb.v.loading3d")}</div>}>
                <HouseScene neighbours plotW={SAMPLE.plotW} plotD={SAMPLE.plotD} roadW={SAMPLE.roadW} house={SAMPLE} floorView="all" show={{ measures: true, zones: false }} guides={{}} flags={{ front: false, rear: false, outside: false }} preset={{ name: "perspective", nonce: 0 }} tt={(k, p) => t(k, p) as string} />
              </Suspense>
            </Boundary>
          ) : (
            flat
          )}
        </div>
        <div className="grid grid-cols-3 divide-x divide-white/15 border-t border-white/15 text-center text-xs text-white/80">
          <p className="px-2 py-2.5">
            <span className="block text-base font-semibold text-white">30 × 40 ft</span>
            {t("land.preview.plot")}
          </p>
          <p className="px-2 py-2.5">
            <span className="block text-base font-semibold text-white">3 {t("land.preview.floors")}</span>
            {t("land.preview.h", { h: "9.5" })}
          </p>
          <p className="px-2 py-2.5">
            <span className="block text-base font-semibold text-accent">≥ 3.0 m</span>
            {t("land.preview.front")}
          </p>
        </div>
      </div>
      <p className="mt-2.5 text-center text-xs text-white/60">{t("land.preview.note")}</p>
    </div>
  );
}
