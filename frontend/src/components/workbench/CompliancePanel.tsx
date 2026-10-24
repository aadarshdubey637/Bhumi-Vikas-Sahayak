import { AlertTriangle, CheckCircle2, Calculator } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { ComplianceItem, ComplianceReport, ItemStatus, Verdict } from "@/lib/compliance";
import { fmtNum, type FieldId, type Metrics } from "@/lib/workbench";

const BADGE: Record<ItemStatus, string> = {
  violation: "border-danger-line bg-danger-tint text-danger",
  within: "border-verified-line bg-verified-tint text-verified",
  needs_input: "border-pending-line bg-pending-tint text-pending",
  not_evaluated: "border-muted-line bg-muted-tint text-muted",
  info: "border-info-line bg-info-tint text-info",
};
const STRIP: Record<ItemStatus, string> = {
  violation: "border-danger-line bg-danger-tint text-danger",
  within: "border-verified-line bg-verified-tint text-verified",
  needs_input: "border-pending-line bg-pending-tint text-pending",
  not_evaluated: "border-line bg-surface-sunken text-ink-soft",
  info: "border-line bg-surface-sunken text-ink-soft",
};
const VERDICT_STYLE: Record<Verdict, string> = {
  violations: "border-danger bg-danger-tint",
  preliminary_ok: "border-verified bg-verified-tint",
  cannot_evaluate: "border-pending bg-pending-tint",
};
const cap = "font-mono text-[0.6875rem] font-bold uppercase tracking-[0.14em] text-ink-soft";
const pill = "inline-flex items-center gap-1.5 rounded-md border px-2 py-1 font-mono text-[0.625rem] font-bold uppercase tracking-wider";

function Item({ it, onGoToField }: { it: ComplianceItem; onGoToField: (f: FieldId) => void }) {
  const { t } = useTranslation();
  const label = t(it.kind === "geometry" && it.status === "within" ? "wb.c.state.geoOk" : `wb.c.state.${it.status}`);
  const [bigLimit, restLimit] = it.limit ? [it.limit.split(" (")[0], it.limit.includes(" (") ? ` (${it.limit.split(" (").slice(1).join(" (")}` : ""] : [undefined, ""];
  return (
    <li className="rounded-xl border border-line bg-surface p-3.5 text-sm">
      <div className="flex items-start justify-between gap-2">
        <p className="font-semibold text-ink">{t(it.title.key, it.title.params)}</p>
        <span className={`${pill} shrink-0 ${BADGE[it.status]}`}>{label}</span>
      </div>
      {bigLimit ? (
        <p className="mt-2 text-2xl font-bold tabular text-ink">
          {bigLimit}
          <span className="text-xs font-normal text-ink-faint">{restLimit}</span>
        </p>
      ) : null}
      {it.detail ? <p className={`mt-2.5 rounded-lg border px-3 py-2 font-mono text-xs leading-relaxed ${STRIP[it.status]}`}>{t(it.detail.key, it.detail.params)}</p> : null}
      {it.raw ? (
        <p lang="en" className="mt-2 text-xs text-ink-soft">
          {it.raw}
        </p>
      ) : null}
      {it.measured || it.rule ? (
        <dl className="mt-2.5 space-y-1 rounded-lg bg-surface-page px-3 py-2 text-xs tabular">
          {it.measured ? (
            <div className="flex justify-between gap-3">
              <dt className="text-ink-soft">{t("wb.c.yours")}</dt>
              <dd className="font-mono font-semibold">{it.measured}</dd>
            </div>
          ) : null}
          {it.rule ? (
            <div className="flex justify-between gap-3">
              <dt className="text-ink-soft">{t("wb.c.rule")}</dt>
              <dd className="font-mono font-semibold">R{it.rule}</dd>
            </div>
          ) : null}
        </dl>
      ) : null}
      {it.suggestions.length ? (
        <ul className="mt-2.5 list-disc space-y-0.5 pl-5 text-ink-soft">
          {it.suggestions.map((s, i) => (
            <li key={i}>{t(s.key, s.params)}</li>
          ))}
        </ul>
      ) : null}
      {it.missing.length && it.status === "needs_input" ? (
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {it.missing.map((f) => (
            <button key={f} type="button" onClick={() => onGoToField(f)} className="rounded-md border border-pending-line bg-surface px-2 py-1 text-xs font-semibold text-pending hover:bg-pending-tint">
              {t("wb.c.add", { field: t(`wb.f.${f}`) })}
            </button>
          ))}
        </div>
      ) : null}
    </li>
  );
}

/** The result of "Evaluate Compliance": what was checked, each limit with its rule number, and the inputs that were used. */
export function CompliancePanel({ report, stale, onGoToField, target, metrics }: { report: ComplianceReport; stale: boolean; onGoToField: (f: FieldId) => void; target: string; metrics: Metrics }) {
  const { t } = useTranslation();
  const order: ItemStatus[] = ["violation", "needs_input", "within", "info", "not_evaluated"];
  const items = order.flatMap((s) => report.items.filter((i) => i.status === s));
  const c = report.counts;
  const used: Array<[string, string]> = [
    metrics.roadW !== undefined ? [t("wb.f.road_width"), `${fmtNum(metrics.roadW)} m`] : null,
    metrics.use ? [t("wb.f.building_use"), metrics.use] : null,
    metrics.height !== undefined ? [t("wb.f.building_height"), `${fmtNum(metrics.height)} m`] : null,
  ].filter((x): x is [string, string] => x !== null);
  return (
    <div className="space-y-4">
      {stale ? (
        <p role="status" className="flex items-center gap-2 rounded-lg border border-pending-line bg-pending-tint px-3 py-2 text-xs font-semibold text-pending">
          <AlertTriangle aria-hidden="true" className="h-4 w-4" />
          {t("wb.c.stale")}
        </p>
      ) : null}

      <section aria-label={t("wb.c.verdictLabel")} className="space-y-3">
        <p className={cap}>{t("wb.ui.statutory")}</p>
        <h3 className="text-lg font-extrabold leading-snug text-ink">{t("wb.ui.required", { target })}</h3>
        <div className="flex flex-wrap gap-2">
          <span className={`${pill} border-info-line bg-info-tint text-info`}>
            <Calculator aria-hidden="true" className="h-3 w-3" />
            {t("wb.ui.calcDone")}
          </span>
          <span className={`${pill} ${report.unverified ? "border-pending-line bg-pending-tint text-pending" : "border-verified-line bg-verified-tint text-verified"}`}>
            <CheckCircle2 aria-hidden="true" className="h-3 w-3" />
            {report.unverified ? t("wb.ui.notVerified") : t("wb.ui.verified")}
          </span>
        </div>
        <p className="text-sm text-ink-soft">{t("wb.ui.computedBy")}</p>
        <div className={`rounded-xl border-l-4 p-3 ${VERDICT_STYLE[report.verdict]}`}>
          <p className="text-sm font-bold">{t(`wb.c.verdict.${report.verdict}`)}</p>
          <p className="mt-1 text-xs">{t(`wb.c.verdictBody.${report.verdict}`, { v: c.violation, ok: report.regWithin, n: c.needs_input + c.not_evaluated })}</p>
          <p className="mt-1.5 text-xs text-ink-soft">{t("wb.c.notApproval")}</p>
          {report.amendmentFlag ? <p className="mt-1 text-xs text-ink-soft">{t("wb.c.amendment")}</p> : null}
        </div>
      </section>

      <section aria-label={t("wb.ui.ruleResults")} className="space-y-2.5">
        <p className={cap}>{t("wb.ui.ruleResults")}</p>
        <ul className="space-y-2.5">
          {items.map((it) => (
            <Item key={it.id} it={it} onGoToField={onGoToField} />
          ))}
        </ul>
      </section>

      {used.length ? (
        <dl className="space-y-1.5 rounded-xl border border-line bg-surface px-3.5 py-3 text-sm">
          {used.map(([k, v]) => (
            <div key={k} className="flex justify-between gap-3">
              <dt className="text-ink-soft">{k}</dt>
              <dd className="font-mono font-semibold">{v}</dd>
            </div>
          ))}
        </dl>
      ) : null}
    </div>
  );
}
