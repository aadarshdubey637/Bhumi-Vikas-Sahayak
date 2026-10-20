import { AlertTriangle, CheckCircle2, CircleHelp, Info, MinusCircle, XCircle } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { ComplianceItem, ComplianceReport, ItemStatus, Verdict } from "@/lib/compliance";
import type { FieldId } from "@/lib/workbench";

const ITEM_STYLE: Record<ItemStatus, { cls: string; icon: typeof Info }> = {
  violation: { cls: "border-danger-line bg-danger-tint", icon: XCircle },
  within: { cls: "border-info-line bg-info-tint", icon: CheckCircle2 },
  needs_input: { cls: "border-pending-line bg-pending-tint", icon: CircleHelp },
  not_evaluated: { cls: "border-muted-line bg-muted-tint", icon: MinusCircle },
  info: { cls: "border-line bg-surface-sunken/50", icon: Info },
};
const ICON_CLS: Record<ItemStatus, string> = { violation: "text-danger", within: "text-info", needs_input: "text-pending", not_evaluated: "text-muted", info: "text-ink-soft" };
const VERDICT_STYLE: Record<Verdict, string> = {
  violations: "border-danger bg-danger-tint",
  preliminary_ok: "border-info bg-info-tint",
  cannot_evaluate: "border-pending bg-pending-tint",
};

function Item({ it, onGoToField }: { it: ComplianceItem; onGoToField: (f: FieldId) => void }) {
  const { t } = useTranslation();
  const st = ITEM_STYLE[it.status];
  const Icon = st.icon;
  return (
    <li className={`rounded-xl border p-3 text-sm ${st.cls}`}>
      <div className="flex items-start gap-2">
        <Icon aria-hidden="true" className={`mt-0.5 h-4 w-4 shrink-0 ${ICON_CLS[it.status]}`} />
        <div className="min-w-0 flex-1">
          <p className="font-semibold">
            {t(it.title.key, it.title.params)}
            <span className="ml-2 rounded-full bg-surface px-2 py-0.5 text-[0.6875rem] font-semibold text-ink-soft">
              {t(it.kind === "geometry" && it.status === "within" ? "wb.c.state.geoOk" : `wb.c.state.${it.status}`)}
            </span>
          </p>
          {it.detail ? <p className="mt-1">{t(it.detail.key, it.detail.params)}</p> : null}
          {it.raw ? (
            <p lang="en" className="mt-1 text-xs text-ink-soft">
              {it.raw}
            </p>
          ) : null}
          {it.measured || it.limit ? (
            <dl className="mt-1.5 flex flex-wrap gap-x-4 gap-y-0.5 text-xs tabular">
              {it.measured ? (
                <div className="flex gap-1">
                  <dt className="text-ink-soft">{t("wb.c.yours")}:</dt>
                  <dd className="font-semibold">{it.measured}</dd>
                </div>
              ) : null}
              {it.limit ? (
                <div className="flex gap-1">
                  <dt className="text-ink-soft">{t("wb.c.statedLimit")}:</dt>
                  <dd className="font-semibold">{it.limit}</dd>
                </div>
              ) : null}
              {it.rule ? (
                <div className="flex gap-1">
                  <dt className="text-ink-soft">{t("wb.c.rule")}:</dt>
                  <dd className="font-semibold">{it.rule}</dd>
                </div>
              ) : null}
            </dl>
          ) : null}
          {it.suggestions.length ? (
            <ul className="mt-2 list-disc space-y-0.5 pl-5">
              {it.suggestions.map((s, i) => (
                <li key={i}>{t(s.key, s.params)}</li>
              ))}
            </ul>
          ) : null}
          {it.missing.length && it.status === "needs_input" ? (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {it.missing.map((f) => (
                <button key={f} type="button" onClick={() => onGoToField(f)} className="rounded-md border border-pending-line bg-surface px-2 py-1 text-xs font-semibold text-pending hover:bg-pending-tint">
                  {t("wb.c.add", { field: t(`wb.f.${f}`) })}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </li>
  );
}

export function CompliancePanel({ report, stale, onGoToField }: { report: ComplianceReport; stale: boolean; onGoToField: (f: FieldId) => void }) {
  const { t } = useTranslation();
  const groups: Array<{ key: ItemStatus; titleKey: string }> = [
    { key: "violation", titleKey: "wb.c.gViolation" },
    { key: "needs_input", titleKey: "wb.c.gNeeds" },
    { key: "within", titleKey: "wb.c.gWithin" },
    { key: "info", titleKey: "wb.c.gInfo" },
    { key: "not_evaluated", titleKey: "wb.c.gNot" },
  ];
  const c = report.counts;
  return (
    <div className="space-y-3">
      {stale ? (
        <p role="status" className="flex items-center gap-2 rounded-lg border border-pending-line bg-pending-tint px-3 py-2 text-xs font-semibold text-pending">
          <AlertTriangle aria-hidden="true" className="h-4 w-4" />
          {t("wb.c.stale")}
        </p>
      ) : null}
      <section aria-label={t("wb.c.verdictLabel")} className={`rounded-2xl border-l-4 p-3.5 ${VERDICT_STYLE[report.verdict]}`}>
        <h3 className="text-base font-bold">{t(`wb.c.verdict.${report.verdict}`)}</h3>
        <p className="mt-1 text-sm">{t(`wb.c.verdictBody.${report.verdict}`, { v: c.violation, ok: report.regWithin, n: c.needs_input + c.not_evaluated })}</p>
        <p className="mt-2 text-xs text-ink-soft">{t("wb.c.notApproval")}</p>
        {report.unverified ? <p className="mt-1 text-xs font-semibold text-pending">{t("wb.c.unverified")}</p> : null}
        {report.amendmentFlag ? <p className="mt-1 text-xs text-ink-soft">{t("wb.c.amendment")}</p> : null}
      </section>
      <ul aria-label={t("plain.key.title")} className="flex flex-wrap gap-x-4 gap-y-1 rounded-xl border border-line bg-surface-sunken px-3 py-2 text-xs text-ink-soft">
        {([["bg-info", "ok"], ["bg-pending", "need"], ["bg-danger", "fix"], ["bg-muted", "na"]] as const).map(([dot, k]) => (
          <li key={k} className="inline-flex items-center gap-1.5">
            <span aria-hidden="true" className={`h-2.5 w-2.5 rounded-full ${dot}`} />
            {t(`plain.key.${k}`)}
          </li>
        ))}
      </ul>
      {groups.map((g) => {
        const list = report.items.filter((i) => i.status === g.key);
        if (list.length === 0) return null;
        return (
          <section key={g.key} aria-label={t(g.titleKey)}>
            <h4 className="mb-1.5 text-xs font-bold uppercase tracking-wide text-ink-soft">
              {t(g.titleKey)} ({list.length})
            </h4>
            <ul className="space-y-2">
              {list.map((it) => (
                <Item key={it.id} it={it} onGoToField={onGoToField} />
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
