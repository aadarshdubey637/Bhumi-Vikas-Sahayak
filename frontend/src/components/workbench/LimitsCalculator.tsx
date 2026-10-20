import { useMutation } from "@tanstack/react-query";
import { useMemo, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { ask } from "@/api/endpoints/ask";
import { buildAskRequest } from "@/api/schemas";
import type { AskResponse, DirectRequirement } from "@/api/types";
import { ErrorState } from "@/components/common/ErrorState";
import { InfoBox, LoadingSkeleton } from "@/components/common/States";
import { MeasurementField } from "@/components/forms/MeasurementField";
import { FieldError } from "@/components/common/FieldError";
import { AREA_UNITS, LENGTH_UNITS } from "@/lib/units";
import { btnPrimary, card, input, label as labelCls } from "@/lib/ui";
import { emptyWbForm, fmtNum, parseWb, type CellField, type WbForm } from "@/lib/workbench";

const QUESTION = "What front, rear and side open space and floor area ratio apply?";
const SQFT = 10.7639104167;
const BUILDING_USES = ["residential", "commercial", "industrial", "farm house", "institutional"] as const;

const req = (a: AskResponse, key: string): DirectRequirement | undefined => a.direct_answer?.requirements?.find((r) => r.key === key);

function Stat({ title, value, sub, rule, tone = "plain" }: { title: string; value: string; sub?: string; rule?: string; tone?: "plain" | "amber" }) {
  return (
    <div className={`${card} ${tone === "amber" ? "border-l-4 border-l-accent" : ""}`}>
      <p className="text-xs font-bold uppercase tracking-wide text-ink-soft">{title}</p>
      <p className="tabular mt-1 text-2xl font-semibold">{value}</p>
      {sub ? <p className="mt-0.5 text-sm text-ink-soft">{sub}</p> : null}
      {rule ? <p className="mt-2 inline-block rounded-full bg-surface-sunken px-2.5 py-0.5 text-xs font-semibold text-ink-soft">{rule}</p> : null}
    </div>
  );
}

/** Setback, FAR and floor-area limits for a plot, taken from the stated rule tables via the backend; arithmetic on top is shown plainly. */
export function LimitsCalculator() {
  const { t, i18n } = useTranslation();
  const [form, setForm] = useState<WbForm>(emptyWbForm);
  const parsed = useMemo(() => parseWb(form), [form]);
  const [tried, setTried] = useState(false);
  const m = useMutation({
    mutationFn: () => ask(buildAskRequest({ question: QUESTION, language: i18n.language === "hi" ? "hi" : undefined, context: parsed.inputs })),
  });

  const cell = (f: CellField, units: readonly string[], placeholder: string) => (
    <MeasurementField
      id={`lim-${f}`}
      label={t(`wb.f.${f}`)}
      units={units}
      value={form.cells[f].value}
      unit={form.cells[f].unit}
      onChange={(v) => setForm({ ...form, cells: { ...form.cells, [f]: v } })}
      error={parsed.errors[f] ? t(parsed.errors[f] as string) : undefined}
      placeholder={placeholder}
    />
  );
  const submit = (e: FormEvent) => {
    e.preventDefault();
    setTried(true);
    if (parsed.metrics.plotAreaSqm === undefined && !parsed.errors.plot_area) return;
    if (Object.keys(parsed.errors).length > 0) return;
    m.mutate();
  };
  const x = parsed.metrics;
  const a = m.data;
  const front = a ? req(a, "front_open_space") : undefined;
  const rear = a ? req(a, "rear_open_space") : undefined;
  const far = a ? req(a, "max_floor_area") : undefined;
  const farCap = far ? Number(far.value) : undefined;
  const maxDepth = x.plotD !== undefined && front && rear ? x.plotD - Number(front.value) - Number(rear.value) : undefined;
  const tall = x.height !== undefined && x.height > 12.5;
  const plotMissing = tried && x.plotAreaSqm === undefined;

  return (
    <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]">
      <form onSubmit={submit} className={`${card} space-y-4`} noValidate>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
          {cell("plot_width", LENGTH_UNITS, "10")}
          {cell("plot_length", LENGTH_UNITS, "20")}
        </div>
        {cell("plot_area", AREA_UNITS, "200")}
        {x.plotAreaDerived && form.cells.plot_area.value.trim() === "" ? <p className="rounded-lg bg-info-tint px-3 py-2 text-xs text-info">{t("wb.inputs.areaDerived", { area: fmtNum(x.plotAreaSqm!) })}</p> : null}
        {cell("road_width", LENGTH_UNITS, "9")}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
          {cell("building_height", LENGTH_UNITS, "9")}
          <div>
            <label htmlFor="lim-floors" className={labelCls}>
              {t("wb.f.floors")}
            </label>
            <input id="lim-floors" className={`${input} tabular`} inputMode="numeric" value={form.floors} onChange={(e) => setForm({ ...form, floors: e.target.value })} placeholder={t("forms.eg", { value: "3" })} />
            <FieldError message={parsed.errors.floors ? t(parsed.errors.floors) : undefined} />
          </div>
        </div>
        <div>
          <label htmlFor="lim-use" className={labelCls}>
            {t("wb.f.building_use")}
          </label>
          <select id="lim-use" className={input} value={form.building_use} onChange={(e) => setForm({ ...form, building_use: e.target.value })}>
            <option value="">{t("wb.inputs.notSpecified")}</option>
            {BUILDING_USES.map((u) => (
              <option key={u} value={u}>
                {t(`wb.use.${u.replace(" ", "_")}`)}
              </option>
            ))}
          </select>
        </div>
        {plotMissing ? (
          <p role="alert" className="text-sm text-danger">
            {t("calc.needPlot")}
          </p>
        ) : null}
        <button type="submit" className={`${btnPrimary} w-full`} disabled={m.isPending}>
          {m.isPending ? t("common.sending") : t("calc.calculateLimits")}
        </button>
      </form>

      <div className="space-y-3" aria-live="polite">
        {m.isError ? <ErrorState error={m.error} /> : null}
        {m.isPending ? <LoadingSkeleton lines={5} label={t("calc.working")} /> : null}
        {a && !m.isPending ? (
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              <Stat title={t("calc.sPlot")} value={`${fmtNum(x.plotAreaSqm ?? 0)} ${t("units.sqm")}`} sub={`${fmtNum((x.plotAreaSqm ?? 0) * SQFT, 1)} ${t("units.sqft")}`} />
              {farCap !== undefined ? (
                <Stat
                  tone="amber"
                  title={t("calc.sFar")}
                  value={`${fmtNum(farCap)} ${t("units.sqm")}`}
                  sub={`${fmtNum(farCap * SQFT, 1)} ${t("units.sqft")}${x.floors ? ` · ${t("calc.perFloor", { n: x.floors, v: fmtNum(farCap / x.floors, 1) })}` : ""}`}
                  rule={`${t("wb.c.rule")} ${far!.rule} · ${far!.basis}`}
                />
              ) : null}
              {front ? <Stat tone="amber" title={t("wb.c.front")} value={`≥ ${fmtNum(Number(front.value))} m`} sub={t("calc.roadBand", { band: front.basis })} rule={`${t("wb.c.rule")} ${front.rule}`} /> : null}
              {rear ? <Stat tone="amber" title={t("wb.c.rear")} value={rear.value === "0" ? t("calc.nil") : `≥ ${fmtNum(Number(rear.value))} m`} sub={rear.basis} rule={`${t("wb.c.rule")} ${rear.rule}`} /> : null}
              {maxDepth !== undefined && maxDepth > 0 ? <Stat title={t("calc.sDepth")} value={`${fmtNum(maxDepth)} m`} sub={t("calc.depthHow", { d: fmtNum(x.plotD!), f: fmtNum(Number(front!.value)), r: fmtNum(Number(rear!.value)) })} /> : null}
            </div>
            {!front && !tall ? <InfoBox tone="pending">{t("calc.needRoad")}</InfoBox> : null}
            {tall ? <InfoBox tone="pending">{t("wb.c.tall", { h: `${fmtNum(x.height!)} m` })}</InfoBox> : null}
            <InfoBox tone="muted">{t("calc.sideNote")}</InfoBox>
            {a.direct_answer?.lines.length ? (
              <section className={`${card} space-y-2`}>
                <h2 className="text-sm font-bold uppercase tracking-wide text-ink-soft">{t("wb.a.simple")}</h2>
                <ul className="space-y-1.5 text-sm">
                  {a.direct_answer.lines.map((l, i) => (
                    <li key={i}>{l}</li>
                  ))}
                </ul>
                {a.direct_answer.caveats.map((c, i) => (
                  <p key={i} className="text-xs text-ink-soft">
                    {c}
                  </p>
                ))}
              </section>
            ) : null}
            <p className="text-xs text-ink-soft">
              {t("wb.c.unverified")} {t("wb.c.notApproval")}{" "}
              <Link to="/" className="font-semibold text-brand underline">
                {t("calc.openWorkbench")}
              </Link>
            </p>
          </>
        ) : null}
        {!a && !m.isPending && !m.isError ? (
          <div className={`${card} flex flex-col items-center gap-2 py-10 text-center`}>
            <p className="font-semibold">{t("calc.emptyTitle")}</p>
            <p className="max-w-sm text-sm text-ink-soft">{t("calc.emptyBody")}</p>
          </div>
        ) : null}
      </div>
    </div>
  );
}
