import { useMutation } from "@tanstack/react-query";
import { Calculator as CalcIcon } from "lucide-react";
import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { calculatePlotArea } from "@/api/endpoints/calculations";
import { mapValidationErrors, isApiError } from "@/api/errors";
import { lengthMeasurement } from "@/api/schemas";
import type { OutputAreaUnit } from "@/api/types";
import { CalculationTrace } from "@/components/assessment/CalculationTrace";
import { MiniPlot } from "@/components/brand/Illustrations";
import { ErrorState } from "@/components/common/ErrorState";
import { FieldError } from "@/components/common/FieldError";
import { PageHeader } from "@/components/common/PageHeader";
import { InfoBox, LoadingSkeleton } from "@/components/common/States";
import { InlineDisclaimer } from "@/components/common/Disclaimer";
import { MeasurementField } from "@/components/forms/MeasurementField";
import { UnitSelect } from "@/components/forms/UnitSelect";
import { AREA_UNITS, LENGTH_UNITS } from "@/lib/units";
import { LimitsCalculator } from "@/components/workbench/LimitsCalculator";
import { btnPrimary, card, input, label as labelCls } from "@/lib/ui";

function AreaCalculator() {
  const { t } = useTranslation();
  const [len, setLen] = useState({ value: "", unit: "m" });
  const [wid, setWid] = useState({ value: "", unit: "m" });
  const [out, setOut] = useState<OutputAreaUnit>("sqm");
  const [places, setPlaces] = useState("4");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const m = useMutation({ mutationFn: calculatePlotArea });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const l = lengthMeasurement.safeParse(len);
    const w = lengthMeasurement.safeParse(wid);
    const p = Number(places);
    const errs: Record<string, string> = {};
    if (!l.success) errs.length = l.error.issues[0]?.message ?? "validation.decimal";
    if (!w.success) errs.width = w.error.issues[0]?.message ?? "validation.decimal";
    if (!Number.isInteger(p) || p < 0 || p > 8) errs.places = "validation.places";
    setErrors(errs);
    if (Object.keys(errs).length > 0 || !l.success || !w.success) return;
    m.mutate({
      length: { value: l.data.value, unit: l.data.unit },
      width: { value: w.data.value, unit: w.data.unit },
      output_unit: out,
      places: p,
    });
  };
  const server = m.isError && isApiError(m.error) && m.error.status === 422 ? mapValidationErrors(m.error) : null;
  const err = (f: string) => (errors[f] ? t(errors[f]) : server?.fields[f]);

  return (
    <>
      <p className="text-sm text-ink-soft">{t("calcx.description")}</p>
      <div className="mt-4 grid items-start gap-5 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]">
        <form onSubmit={submit} className={`${card} space-y-4`} noValidate>
          <MeasurementField
            id="calc-length"
            label={t("forms.fields.plot_length")}
            hint={t("forms.hints.plot_length")}
            placeholder="20"
            units={LENGTH_UNITS}
            value={len.value}
            unit={len.unit}
            onChange={setLen}
            error={err("length")}
          />
          <MeasurementField
            id="calc-width"
            label={t("forms.fields.plot_width")}
            hint={t("forms.hints.plot_width")}
            placeholder="10"
            units={LENGTH_UNITS}
            value={wid.value}
            unit={wid.unit}
            onChange={setWid}
            error={err("width")}
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <UnitSelect
              id="calc-out"
              label={t("calculator.outputUnit")}
              units={AREA_UNITS}
              value={out}
              onChange={(v) => setOut(v as OutputAreaUnit)}
            />
            <div>
              <label htmlFor="calc-places" className={labelCls}>
                {t("calculator.places")}
              </label>
              <input
                id="calc-places"
                inputMode="numeric"
                className={`${input} tabular`}
                value={places}
                onChange={(e) => setPlaces(e.target.value)}
              />
              <FieldError message={err("places")} />
            </div>
          </div>
          <button type="submit" className={`${btnPrimary} w-full`} disabled={m.isPending}>
            {m.isPending ? t("common.sending") : t("calculator.calculate")}
          </button>
        </form>

        <div className="space-y-3" aria-live="polite">
          {server?.general.map((g) => (
            <InfoBox key={g} tone="danger">
              {g}
            </InfoBox>
          ))}
          {m.isError && !server ? <ErrorState error={m.error} /> : null}
          {m.isPending ? <LoadingSkeleton lines={4} /> : null}
          {m.data ? <CalculationTrace trace={m.data} /> : null}
          {!m.data && !m.isPending && !m.isError ? (
            <div className={`${card} flex flex-col items-center gap-3 py-10 text-center`}>
              <MiniPlot className="h-28 w-48" />
              <p className="font-semibold">{t("calcx.emptyTitle")}</p>
              <p className="max-w-sm text-sm text-ink-soft">{t("calcx.emptyBody")}</p>
            </div>
          ) : null}
        </div>
      </div>
    </>
  );
}

type Tab = "limits" | "area";

export default function Calculator() {
  const { t } = useTranslation();
  const [tab, setTab] = useState<Tab>("limits");
  const tabs: Array<{ id: Tab; label: string }> = [
    { id: "limits", label: t("calc.tabLimits") },
    { id: "area", label: t("calc.tabArea") },
  ];
  return (
    <>
      <PageHeader title={t("calc.pageTitle")} description={t("calc.pageBody")} icon={CalcIcon} />
      <InlineDisclaimer />
      <div role="tablist" aria-label={t("calc.pageTitle")} className="mt-4 inline-flex gap-1 rounded-xl bg-surface-sunken p-1">
        {tabs.map((x) => (
          <button
            key={x.id}
            role="tab"
            type="button"
            aria-selected={tab === x.id}
            onClick={() => setTab(x.id)}
            className={`min-h-tap rounded-lg px-4 text-sm font-semibold transition-colors ${tab === x.id ? "bg-navy text-white shadow" : "text-ink-soft hover:bg-surface/80"}`}
          >
            {x.label}
          </button>
        ))}
      </div>
      <div className="mt-4" role="tabpanel">
        {tab === "limits" ? <LimitsCalculator /> : <AreaCalculator />}
      </div>
    </>
  );
}
