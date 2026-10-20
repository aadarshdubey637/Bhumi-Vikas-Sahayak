import { Building2, Minus, Plus, Ruler, Route, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { PlotFormValues } from "@/api/schemas";
import { FieldError } from "@/components/common/FieldError";
import { BUILDING_USE_SUGGESTIONS, FLOORS_FIELD, MEASUREMENT_FIELDS, unitsFor } from "@/lib/units";
import { input, label as labelCls } from "@/lib/ui";
import { MeasurementField } from "./MeasurementField";

function Section({ icon: Icon, title, children }: { icon: LucideIcon; title: string; children: ReactNode }) {
  return (
    <fieldset className="rounded-2xl border border-line bg-white/60 p-4">
      <legend className="flex items-center gap-2 px-1 text-sm font-semibold text-ink">
        <span aria-hidden="true" className="inline-flex h-6 w-6 items-center justify-center rounded-lg bg-brand-tint text-brand">
          <Icon className="h-3.5 w-3.5" />
        </span>
        {title}
      </legend>
      <div className="mt-2 grid gap-4 sm:grid-cols-2">{children}</div>
    </fieldset>
  );
}

/**
 * Controlled form for every allowed input (all optional), grouped the way a clerk thinks about a case: the plot, the road, the building.
 * `errors` maps field name -> i18n key or server text. Field ids, labels and the submitted values are unchanged by the grouping.
 */
export function PlotInputsForm({
  idPrefix = "pi",
  value,
  onChange,
  errors,
  disabled,
}: {
  idPrefix?: string;
  value: PlotFormValues;
  onChange: (next: PlotFormValues) => void;
  errors: Record<string, string>;
  disabled?: boolean;
}) {
  const { t } = useTranslation();
  const listId = `${idPrefix}-use-list`;
  const measure = (name: string, placeholder?: string) => {
    const f = MEASUREMENT_FIELDS.find((x) => x.name === name);
    if (!f) return null;
    const cell = value.measurements[name] ?? { value: "", unit: unitsFor(f.dim)[0] ?? "" };
    return (
      <MeasurementField
        key={name}
        id={`${idPrefix}-${name}`}
        label={t(`forms.fields.${name}`)}
        hint={t(`forms.hints.${name}`)}
        placeholder={placeholder}
        units={unitsFor(f.dim)}
        value={cell.value}
        unit={cell.unit}
        disabled={disabled}
        error={errors[name]}
        onChange={(next) => onChange({ ...value, measurements: { ...value.measurements, [name]: next } })}
      />
    );
  };
  const floorsNum = parseInt(value.floors, 10);
  const setFloors = (n: number) => onChange({ ...value, floors: String(Math.min(Math.max(n, 0), 200)) });

  return (
    <div className="space-y-4">
      <Section icon={Ruler} title={t("forms.sections.plot")}>
        {measure("plot_area", "200")}
        {measure("plot_length", "20")}
        {measure("plot_width", "10")}
      </Section>

      <Section icon={Route} title={t("forms.sections.road")}>
        {measure("road_width", "9")}
        <div>
          <label htmlFor={`${idPrefix}-location`} className={labelCls}>
            {t("forms.fields.location")}
          </label>
          <input
            id={`${idPrefix}-location`}
            maxLength={64}
            autoComplete="off"
            className={input}
            value={value.location}
            disabled={disabled}
            aria-invalid={!!errors.location}
            aria-describedby={`${idPrefix}-location-hint`}
            onChange={(e) => onChange({ ...value, location: e.target.value })}
          />
          <p id={`${idPrefix}-location-hint`} className="mt-1.5 text-xs text-ink-faint">
            {t("forms.hints.location")}
          </p>
          <FieldError message={errors.location} />
        </div>
      </Section>

      <Section icon={Building2} title={t("forms.sections.building")}>
        <div className="sm:col-span-2">
          <label htmlFor={`${idPrefix}-use`} className={labelCls}>
            {t("forms.fields.building_use")}
          </label>
          <input
            id={`${idPrefix}-use`}
            list={listId}
            maxLength={64}
            autoComplete="off"
            className={input}
            value={value.building_use}
            disabled={disabled}
            aria-invalid={!!errors.building_use}
            aria-describedby={`${idPrefix}-use-hint`}
            onChange={(e) => onChange({ ...value, building_use: e.target.value })}
          />
          <datalist id={listId}>
            {BUILDING_USE_SUGGESTIONS.map((u) => (
              <option key={u} value={u} />
            ))}
          </datalist>
          <div className="mt-2 flex flex-wrap gap-2" role="group" aria-label={t("forms.useChips")}>
            {BUILDING_USE_SUGGESTIONS.map((u) => (
              <button
                key={u}
                type="button"
                disabled={disabled}
                aria-pressed={value.building_use === u}
                onClick={() => onChange({ ...value, building_use: value.building_use === u ? "" : u })}
                className={`min-h-[2.25rem] rounded-full border px-3 text-xs font-semibold capitalize transition-colors ${
                  value.building_use === u ? "border-brand bg-brand text-white" : "border-line-strong bg-white/80 text-ink-soft hover:border-brand-ring hover:text-brand"
                }`}
              >
                {t(`forms.use.${u}`, { defaultValue: u })}
              </button>
            ))}
          </div>
          <p id={`${idPrefix}-use-hint`} className="mt-1.5 text-xs text-ink-faint">
            {t("forms.hints.building_use")}
          </p>
          <FieldError message={errors.building_use} />
        </div>
        <div>
          <label htmlFor={`${idPrefix}-floors`} className={labelCls}>
            {t("forms.fields.floors")}
          </label>
          <div className="flex">
            <button
              type="button"
              aria-label={t("forms.floorsDec")}
              disabled={disabled || !(floorsNum > 0)}
              onClick={() => setFloors((Number.isFinite(floorsNum) ? floorsNum : 0) - 1)}
              className="inline-flex min-h-tap min-w-tap items-center justify-center rounded-l-xl border border-r-0 border-line-strong bg-surface-sunken text-ink-soft hover:text-brand disabled:opacity-40"
            >
              <Minus aria-hidden="true" className="h-4 w-4" />
            </button>
            <input
              id={`${idPrefix}-floors`}
              inputMode="numeric"
              autoComplete="off"
              placeholder={t("forms.eg", { value: "2" })}
              className={`${input} !rounded-none text-center tabular`}
              value={value.floors}
              disabled={disabled}
              aria-invalid={!!errors[FLOORS_FIELD]}
              aria-describedby={`${idPrefix}-floors-hint`}
              onChange={(e) => onChange({ ...value, floors: e.target.value })}
            />
            <button
              type="button"
              aria-label={t("forms.floorsInc")}
              disabled={disabled}
              onClick={() => setFloors((Number.isFinite(floorsNum) ? floorsNum : 0) + 1)}
              className="inline-flex min-h-tap min-w-tap items-center justify-center rounded-r-xl border border-l-0 border-line-strong bg-surface-sunken text-ink-soft hover:text-brand disabled:opacity-40"
            >
              <Plus aria-hidden="true" className="h-4 w-4" />
            </button>
          </div>
          <p id={`${idPrefix}-floors-hint`} className="mt-1.5 text-xs text-ink-faint">
            {t("forms.hints.floors")}
          </p>
          <FieldError message={errors[FLOORS_FIELD]} />
        </div>
        {measure("building_height", "9")}
        {measure("building_length", "12")}
        {measure("building_width", "8")}
      </Section>
    </div>
  );
}
