import { Building2, ChevronDown, Fence, FileCheck2, Map, RotateCcw, Sparkles, Waypoints } from "lucide-react";
import { useTranslation } from "react-i18next";
import { FieldError } from "@/components/common/FieldError";
import { MeasurementField } from "@/components/forms/MeasurementField";
import { AREA_UNITS, BUILDING_USE_SUGGESTIONS, LENGTH_UNITS } from "@/lib/units";
import { btn, btnAccent, input, label as labelCls } from "@/lib/ui";
import { fieldDomId, fmtNum, type CellField, type FieldId, type UnitSystem, type WbForm } from "@/lib/workbench";
import type { ParsedWb } from "@/lib/workbench";

function Section({ n, title, icon: Icon, children, open = true, badge }: { n: number; title: string; icon: typeof Map; children: React.ReactNode; open?: boolean; badge?: string }) {
  return (
    <details open={open} className="group rounded-2xl border border-line bg-surface">
      <summary className="flex min-h-tap cursor-pointer list-none items-center gap-2 px-3.5 py-2 text-[0.9375rem] font-semibold text-ink [&::-webkit-details-marker]:hidden">
        <span aria-hidden="true" className="inline-flex h-6 w-6 items-center justify-center rounded-md bg-navy text-xs text-white">{n}</span>
        <Icon aria-hidden="true" className="h-4 w-4 text-brand" />
        <span className="flex-1">{title}</span>
        {badge ? <span className="rounded-full bg-surface-sunken px-2 py-0.5 text-[0.6875rem] font-semibold normal-case tracking-normal text-ink-soft">{badge}</span> : null}
        <ChevronDown aria-hidden="true" className="h-4 w-4 transition-transform group-open:rotate-180" />
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
  onReset,
  onExample,
  unitSystem,
  onUnitSystem,
}: {
  form: WbForm;
  onChange: (next: WbForm) => void;
  parsed: ParsedWb;
  onEvaluate: () => void;
  evaluating: boolean;
  onReset: () => void;
  onExample: () => void;
  unitSystem: UnitSystem;
  onUnitSystem: (u: UnitSystem) => void;
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
  const derived = parsed.metrics.plotAreaDerived && parsed.metrics.plotAreaSqm !== undefined;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-base font-semibold">{t("wb.inputs.title")}</h2>
        <div className="flex gap-1.5">
          <button type="button" className={`${btn} !min-h-0 !px-2.5 !py-1.5 text-xs`} onClick={onExample}>
            <Sparkles aria-hidden="true" className="h-3.5 w-3.5" />
            {t("wb.inputs.example")}
          </button>
          <button type="button" className={`${btn} !min-h-0 !px-2.5 !py-1.5 text-xs`} onClick={onReset}>
            <RotateCcw aria-hidden="true" className="h-3.5 w-3.5" />
            {t("wb.reset")}
          </button>
        </div>
      </div>

      <div role="group" aria-label={t("wb.units.label")} className="flex items-center justify-between gap-2 rounded-xl border border-line bg-surface-sunken/60 p-1.5">
        <span className="pl-2 text-xs font-semibold text-ink-soft">{t("wb.units.label")}</span>
        <div className="inline-flex gap-1">
          {(["ft", "m"] as const).map((u) => (
            <button key={u} type="button" aria-pressed={unitSystem === u} onClick={() => onUnitSystem(u)} className={`min-h-tap rounded-lg px-3.5 text-sm font-semibold transition-colors ${unitSystem === u ? "bg-accent text-navy-night" : "text-ink-soft hover:bg-surface"}`}>
              {t(`wb.units.${u}`)}
            </button>
          ))}
        </div>
      </div>

      <Section n={1} title={t("wb.inputs.plot")} icon={Map}>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-1">
          {cell("plot_width", LENGTH_UNITS, { placeholder: "10" })}
          {cell("plot_length", LENGTH_UNITS, { placeholder: "20" })}
        </div>
        {cell("plot_area", AREA_UNITS, { placeholder: "200" })}
        {derived && form.cells.plot_area.value.trim() === "" ? (
          <p className="rounded-lg bg-info-tint px-3 py-2 text-xs text-info">{t("wb.inputs.areaDerived", { area: fmtNum(parsed.metrics.plotAreaSqm!) })}</p>
        ) : null}
      </Section>

      <Section n={2} title={t("wb.inputs.road")} icon={Waypoints}>
        {cell("road_width", LENGTH_UNITS, { hintKey: "wb.inputs.roadHint", placeholder: "9" })}
        <div>
          <label htmlFor={fieldDomId("location")} className={labelCls}>{t("wb.f.location")}</label>
          <input id={fieldDomId("location")} className={input} maxLength={64} value={form.location} aria-invalid={!!err("location")} onChange={(e) => onChange({ ...form, location: e.target.value })} />
          <FieldError id="wb-location-err" message={err("location")} />
        </div>
      </Section>

      <Section n={3} title={t("wb.inputs.building")} icon={Building2}>
        <div>
          <label htmlFor={fieldDomId("building_use")} className={labelCls}>{t("wb.f.building_use")}</label>
          <select id={fieldDomId("building_use")} className={input} value={form.building_use} onChange={(e) => onChange({ ...form, building_use: e.target.value })}>
            <option value="">{t("wb.inputs.notSpecified")}</option>
            {BUILDING_USE_SUGGESTIONS.map((u) => (
              <option key={u} value={u}>{t(`wb.use.${u.replace(" ", "_")}`, { defaultValue: u })}</option>
            ))}
          </select>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-1">
          {cell("building_height", LENGTH_UNITS, { placeholder: "9" })}
          <div>
            <label htmlFor={fieldDomId("floors")} className={labelCls}>{t("wb.f.floors")}</label>
            <input id={fieldDomId("floors")} className={`${input} tabular`} inputMode="numeric" autoComplete="off" value={form.floors} aria-invalid={!!err("floors")} onChange={(e) => onChange({ ...form, floors: e.target.value })} placeholder={t("forms.eg", { value: "2" })} />
            <FieldError id="wb-floors-err" message={err("floors")} />
          </div>
        </div>
        {cell("built_up_area", AREA_UNITS, { hintKey: "wb.inputs.builtUpHint", placeholder: "150" })}
      </Section>

      <Section n={4} title={t("wb.inputs.footprint")} icon={Fence} badge={t("wb.inputs.optional")} open>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-1">
          {cell("building_width", LENGTH_UNITS, { placeholder: "7" })}
          {cell("building_length", LENGTH_UNITS, { placeholder: "12" })}
          {cell("gap_front", LENGTH_UNITS, { placeholder: "3" })}
          {cell("gap_left", LENGTH_UNITS, { placeholder: "1.5" })}
        </div>
        <p className="text-xs text-ink-faint">{t("wb.inputs.footprintHint")}</p>
      </Section>

      {errorCount > 0 ? (
        <p role="alert" className="rounded-lg border border-danger-line bg-danger-tint px-3 py-2 text-xs text-danger">{t("wb.inputs.errors", { count: errorCount })}</p>
      ) : null}
      <button type="button" className={`${btnAccent} w-full`} onClick={onEvaluate} disabled={evaluating}>
        <FileCheck2 aria-hidden="true" className="h-4 w-4" />
        {evaluating ? t("wb.evaluating") : t("wb.evaluate")}
      </button>
    </div>
  );
}
