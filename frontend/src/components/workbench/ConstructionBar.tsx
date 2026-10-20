import { Pause, Play, RotateCcw, RefreshCw, SkipForward } from "lucide-react";
import { useSyncExternalStore } from "react";
import { useTranslation } from "react-i18next";
import type { AnimController } from "@/lib/anim";
import type { HouseModel } from "@/lib/house";

const SPEEDS = [0.5, 1, 2, 4];
const b = "inline-flex min-h-tap min-w-tap items-center justify-center gap-1.5 rounded-xl border border-line bg-surface/80 px-3 text-sm font-semibold text-ink hover:border-brand-ring hover:text-brand disabled:cursor-not-allowed disabled:opacity-50";

/** Play / Pause / Replay / Reset for the construction animation, a scrubber and the current stage. Drives the real model's timeline. */
export function ConstructionBar({ ctrl, model }: { ctrl: AnimController; model: HouseModel | null }) {
  const { t } = useTranslation();
  const s = useSyncExternalStore(ctrl.subscribe, ctrl.getSnapshot);
  const stage = model?.stageAt(s.progress);
  const done = s.progress >= 1;
  const pct = Math.round(s.progress * 100);
  return (
    <div role="group" aria-label={t("wb.anim.title")} className="flex flex-wrap items-center gap-2 border-t border-line px-3 py-2.5">
      {s.playing ? (
        <button type="button" className={b} onClick={() => ctrl.pause()} disabled={!model}>
          <Pause aria-hidden="true" className="h-4 w-4" />
          {t("wb.anim.pause")}
        </button>
      ) : (
        <button type="button" className={b} onClick={() => ctrl.play()} disabled={!model}>
          <Play aria-hidden="true" className="h-4 w-4" />
          {done ? t("wb.anim.playAgain") : s.progress > 0 ? t("wb.anim.resume") : t("wb.anim.play")}
        </button>
      )}
      <button type="button" className={b} onClick={() => ctrl.replay()} disabled={!model}>
        <RefreshCw aria-hidden="true" className="h-4 w-4" />
        {t("wb.anim.replay")}
      </button>
      <button type="button" className={b} onClick={() => ctrl.reset()} disabled={!model} title={t("wb.anim.resetHint")}>
        <RotateCcw aria-hidden="true" className="h-4 w-4" />
        {t("wb.anim.reset")}
      </button>
      <button type="button" className={b} onClick={() => ctrl.finish()} disabled={!model || done} aria-label={t("wb.anim.finish")} title={t("wb.anim.finish")}>
        <SkipForward aria-hidden="true" className="h-4 w-4" />
      </button>
      <label className="flex min-w-[8rem] flex-1 items-center gap-2 text-xs font-semibold text-ink-soft">
        <span className="sr-only">{t("wb.anim.scrub")}</span>
        <input
          type="range"
          min={0}
          max={1000}
          value={Math.round(s.progress * 1000)}
          onChange={(e) => ctrl.seek(Number(e.target.value) / 1000)}
          disabled={!model}
          aria-valuetext={stage ? `${t(stage.label.key, stage.label.params)}, ${pct}%` : `${pct}%`}
          className="h-2 w-full cursor-pointer accent-[#F5B301]"
        />
        <span className="tabular w-10 text-right">{pct}%</span>
      </label>
      <label className="flex items-center gap-1.5 text-xs font-semibold text-ink-soft">
        {t("wb.anim.speed")}
        <select
          className="min-h-tap rounded-lg border border-line bg-surface/80 px-2 text-sm text-ink"
          value={s.speed}
          onChange={(e) => ctrl.setSpeed(Number(e.target.value))}
        >
          {SPEEDS.map((x) => (
            <option key={x} value={x}>
              {x}×
            </option>
          ))}
        </select>
      </label>
      <p role="status" aria-live="polite" className="basis-full text-xs font-semibold text-ink-soft">
        {stage ? `${t("wb.anim.stage")}: ${t(stage.label.key, stage.label.params)}` : t("wb.anim.noModel")}
      </p>
    </div>
  );
}
