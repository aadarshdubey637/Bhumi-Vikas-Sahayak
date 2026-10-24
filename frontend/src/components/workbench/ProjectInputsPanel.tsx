import { Building2, ChevronDown, Fence, Map, PanelLeftClose, Play, SlidersHorizontal, Sparkles, Waypoints, type LucideIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { FieldError } from "@/components/common/FieldError";
import { FieldCaption, MeasurementField, fieldBox, fieldLabel } from "@/components/forms/MeasurementField";
import { AREA_UNITS, BUILDING_USE_SUGGESTIONS, LENGTH_UNITS } from "@/lib/units";
import { fieldDomId, fmtNum, type CellField, type FieldId, type WbForm } from "@/lib/workbench";
import type { ParsedWb } from "@/lib/workbench";

export type Target = "all" | "front" | "rear" | "far";
const TARGETS: Target[] = ["all", "front", "rear", "far"];

function Section({ title, icon: Icon, children, open = true, badge }: { title: string; icon: LucideIcon; children: React.ReactNode; open?: boolean; badge?: string }) {
  return (
    <details open={open} className="group rounded-xl border border-line bg-surface">
      <summary className="flex min-h-tap cursor-pointer list-none items-center gap-2.5 px-3.5 py-2 text-sm font-extrabold uppercase tracking-wide text-ink [&::-webkit-details-marker]:hidden">
        <span aria-hidden="true" className="inline-flex h-[1.375rem] w-[1.375rem] shrink-0 items-center justify-center rounded-full border-2 border-accent text-accent"><Icon className="h-3 w-3" /></span>
        <span className="flex-1">{title}</span>
        {badge ? <span className="rounded-full bg-surface-sunken px-2 py-0.5 text-[0.625rem] font-semibold normal-case tracking-normal text-ink-soft">{badge}</span> : null}
        <ChevronDown aria-hidden="true" className="h-4 w-4 text-ink-faint transition-transform group-open:rotate-180" />
      </summary>
      <div className="space-y-3.5 border-t border-line p-3.5">{children}</div>
    </details>
  );
}

export function ProjectInputsPanel({
  form,
  onChange,
  parsed,
  onEvaluate,
  evaluating,
  onExample,
  target,
  onTarget,
  onCollapse,
}: {
  form: WbForm;
  onChange: (next: WbForm) => void;
  parsed: ParsedWb;
  onEvaluate: () => void;
  evaluating: boolean;
  onExample: () => void;
  target: Target;
  onTarget: (t: Target) => void;
  /** desktop only: fold the panel away to a slim rail */
  onCollapse?: () => void;
}) {
  const { t } = useTranslation();
  const err = (f: FieldId): string | undefined => (parsed.errors[f] ? t(parsed.errors[f] as string) : undefined);
  const cell = (f: CellField, units: readonly string[], opts: { hintKey?: string; placeholder?: string } = {}) => (
    <MeasurementField
      id={fieldDomId(f)}
      label={t(`wb.f.${f}`)}
      units={units}
      value={form.cells[f].value}
      unit={form.cells[f].unit}
      onChange={(v) => onChange({ ...form, cells: { ...form.cells, [f]: v } })}
      error={err(f)}
      hint={opts.hintKey ? t(opts.hintKey) : undefined}
      placeholder={opts.placeholder}
    />
  );
  const errorCount = Object.keys(parsed.errors).length;
  const m = parsed.metrics;
  const calcArea = m.plotW !== undefined && m.plotD !== undefined ? m.plotW * m.plotD : undefined;

  return (
    <div className="flex min-h-full flex-col">
      <h2 className="flex h-[2.875rem] shrink-0 items-center gap-2.5 border-b border-line px-4 text-sm font-bold text-ink">
        <span aria-hidden="true" className="inline-flex h-[1.375rem] w-[1.375rem] items-center justify-center rounded-md bg-navy text-[0.6875rem] text-white">01</span>
        <span className="flex-1">{t("wb.ui.inputsTitle")}</span>
        {onCollapse ? (
          <button type="button" onClick={onCollapse} aria-label={t("wb.ui.collapse")} title={t("wb.ui.collapse")} className="hidden h-8 w-8 items-center justify-center rounded-lg text-ink-soft hover:bg-surface-sunken hover:text-ink xl:inline-flex">
            <PanelLeftClose aria-hidden="true" className="h-[1.125rem] w-[1.125rem]" />
          </button>
        ) : null}
      </h2>

      <div className="flex-1 space-y-3 p-3.5">
        <div className="flex items-center justify-between gap-1 px-0.5">
          <p className="flex items-center gap-2 whitespace-nowrap text-sm font-bold text-ink">
            <SlidersHorizontal aria-hidden="true" className="h-[1.125rem] w-[1.125rem]" />
            {t("wb.ui.params")}
          </p>
          <div className="flex items-center gap-1">
            <button type="button" className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-line-strong bg-surface-sunken px-3 text-sm font-bold text-ink hover:border-accent" onClick={onExample}>
              <Sparkles aria-hidden="true" className="h-4 w-4 text-accent" />
              {t("wb.inputs.example")}
            </button>
          </div>
        </div>

        <div className="rounded-xl border border-line bg-surface p-3.5">
          <label htmlFor="wb-target" className="mb-2.5 block text-xs font-bold uppercase tracking-wider text-ink-soft">
            {t("wb.ui.target")}
          </label>
          <div className="relative">
            <select id="wb-target" className={`${fieldBox} cursor-pointer appearance-none pr-9 !text-sm font-semibold`} value={target} onChange={(e) => onTarget(e.target.value as Target)}>
              {TARGETS.map((k) => (
                <option key={k} value={k}>
                  {t(`wb.ui.t${k[0]!.toUpperCase()}${k.slice(1)}`)}
                </option>
              ))}
            </select>
            <ChevronDown aria-hidden="true" className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-soft" />
          </div>
        </div>

        <Section title={`1. ${t("wb.inputs.plot")}`} icon={Map}>
          <div className="grid grid-cols-2 gap-3">
            {cell("plot_width", LENGTH_UNITS, { hintKey: "wb.ui.hWidth" })}
            {cell("plot_length", LENGTH_UNITS)}
          </div>
          {cell("plot_area", AREA_UNITS, { hintKey: "wb.ui.hArea" })}
          {calcArea !== undefined ? (
            <p className="flex items-center justify-between rounded-lg border border-line bg-surface-sunken px-3 py-2.5 text-sm font-semibold text-ink">
              {t("wb.ui.calcArea")}
              <span className="tabular text-accent">{fmtNum(calcArea)} {t("units.sqm")}</span>
            </p>
          ) : null}
        </Section>

        <Section title={`2. ${t("wb.inputs.road")}`} icon={Waypoints}>
          {cell("road_width", LENGTH_UNITS, { hintKey: "wb.inputs.roadHint" })}
        </Section>

        <Section title={`3. ${t("wb.inputs.building")}`} icon={Building2}>
          <div>
            <FieldCaption htmlFor={fieldDomId("building_use")}>{t("wb.f.building_use")}</FieldCaption>
            <div className="relative">
              <select id={fieldDomId("building_use")} className={`${fieldBox} cursor-pointer appearance-none pr-9 !text-sm font-medium`} value={form.building_use} onChange={(e) => onChange({ ...form, building_use: e.target.value })}>
                <option value="">{t("wb.inputs.notSpecified")}</option>
                {BUILDING_USE_SUGGESTIONS.map((u) => (
                  <option key={u} value={u}>{t(`wb.use.${u.replace(" ", "_")}`, { defaultValue: u })}</option>
                ))}
              </select>
              <ChevronDown aria-hidden="true" className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-soft" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {cell("building_height", LENGTH_UNITS)}
            <div>
              <FieldCaption htmlFor={fieldDomId("floors")}>{t("wb.f.floors")}</FieldCaption>
              <input id={fieldDomId("floors")} className={`${fieldBox} tabular`} inputMode="numeric" autoComplete="off" value={form.floors} aria-invalid={!!err("floors")} onChange={(e) => onChange({ ...form, floors: e.target.value })} placeholder={t("forms.eg", { value: "2" })} />
              <FieldError id="wb-floors-err" message={err("floors")} />
            </div>
          </div>
          {cell("built_up_area", AREA_UNITS, { hintKey: "wb.inputs.builtUpHint" })}
        </Section>

        <Section title={`4. ${t("wb.inputs.footprint")}`} icon={Fence} badge={t("wb.inputs.optional")}>
          <div className="grid grid-cols-2 gap-3">
            {cell("building_width", LENGTH_UNITS)}
            {cell("building_length", LENGTH_UNITS)}
            {cell("gap_front", LENGTH_UNITS)}
            {cell("gap_left", LENGTH_UNITS)}
          </div>
          <p className={`${fieldLabel} !mb-0 font-normal !text-ink-faint`}>{t("wb.inputs.footprintHint")}</p>
        </Section>

        {errorCount > 0 ? (
          <p role="alert" className="rounded-lg border border-danger-line bg-danger-tint px-3 py-2 text-xs text-danger">{t("wb.inputs.errors", { count: errorCount })}</p>
        ) : null}
      </div>

      <div className="sticky bottom-0 z-10 border-t border-line bg-[var(--top-bg)] p-3.5">
        <button type="button" className="inline-flex h-[2.875rem] w-full items-center justify-center gap-2.5 whitespace-nowrap rounded-full bg-white px-4 text-sm font-bold text-[#10131c] shadow-lift transition-colors hover:bg-white/90 disabled:cursor-not-allowed disabled:opacity-60" onClick={onEvaluate} disabled={evaluating}>
          {evaluating ? null : <Play aria-hidden="true" className="h-4 w-4 fill-current" />}
          {evaluating ? t("wb.evaluating") : t("wb.evaluate")}
        </button>
      </div>
    </div>
  );
}
