import { useTranslation } from "react-i18next";
import type { ReportOut } from "@/api/types";
import { CheckCard } from "@/components/assessment/CheckCard";
import { OverallStatusBadge } from "@/components/evidence/StatusBadges";
import { formatDateTime, formatValue, humanize } from "@/lib/format";

export function ReportView({ report }: { report: ReportOut }) {
  const { t, i18n } = useTranslation();
  const unevaluated = new Set(report.unevaluated_checks);
  const evaluated = report.checks.filter((c) => !unevaluated.has(c.check_id));
  const notEvaluated = report.checks.filter((c) => unevaluated.has(c.check_id));
  const versionCols = Array.from(new Set(report.rule_versions_used.flatMap((r) => Object.keys(r))));
  return (
    <article className="report space-y-6 bg-surface p-4 print:p-0" aria-label={t("report.title")}>
      <p role="note" className="rounded border border-pending-line bg-pending-tint p-3 text-sm font-semibold">
        {report.disclaimer}
      </p>
      <header>
        <h2 className="text-xl font-semibold">{t("report.title")}</h2>
        <dl className="mt-2 grid grid-cols-[auto,1fr] gap-x-4 text-sm">
          <dt className="text-ink-soft">{t("report.version")}</dt>
          <dd>{report.report_version}</dd>
          <dt className="text-ink-soft">{t("report.generatedAt")}</dt>
          <dd>{formatDateTime(report.generated_at, i18n.language)}</dd>
          <dt className="text-ink-soft">{t("report.assessmentId")}</dt>
          <dd className="font-mono text-xs">{report.assessment_id}</dd>
          <dt className="text-ink-soft">{t("report.assessmentDate")}</dt>
          <dd>{formatDateTime(report.assessment_created_at, i18n.language)}</dd>
          <dt className="text-ink-soft">{t("report.status")}</dt>
          <dd>
            <OverallStatusBadge status={report.status} />
          </dd>
        </dl>
        {report.summary ? <p className="mt-2 text-sm">{report.summary}</p> : null}
      </header>
      <section>
        <h3 className="font-semibold">{t("report.inputSnapshot")}</h3>
        <dl className="mt-1 grid grid-cols-[auto,1fr] gap-x-4 text-sm">
          {Object.entries(report.input_snapshot).map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="text-ink-soft">{humanize(k)}</dt>
              <dd className="tabular">{formatValue(v)}</dd>
            </div>
          ))}
        </dl>
      </section>
      <section>
        <h3 className="mb-2 font-semibold">{t("report.checks")}</h3>
        <div className="space-y-3">
          {evaluated.map((c) => (
            <CheckCard key={c.check_id} check={c} />
          ))}
        </div>
      </section>
      {notEvaluated.length > 0 ? (
        <section>
          <h3 className="mb-2 font-semibold">{t("report.notEvaluated")}</h3>
          <div className="space-y-3">
            {notEvaluated.map((c) => (
              <CheckCard key={c.check_id} check={c} />
            ))}
          </div>
        </section>
      ) : null}
      <section>
        <h3 className="mb-2 font-semibold">{t("report.evidence")}</h3>
        <ul className="space-y-2 text-sm">
          {report.evidence.map((e) => (
            <li key={e.evidence_id} className="rounded border border-line p-2">
              <p className="font-semibold">
                {t("evidence.rule", { rule: e.rule_number })} ·{" "}
                {e.page_reference ? t("evidence.pageShort", { pages: e.page_reference }) : ""} ·{" "}
                {e.evidence_id}
              </p>
              <p className="text-xs text-ink-soft">{t("assessment.relatedContext")}</p>
              <p className="mt-1 whitespace-pre-wrap">{e.evidence_text}</p>
            </li>
          ))}
        </ul>
      </section>
      {report.rule_versions_used.length > 0 ? (
        <section>
          <h3 className="mb-2 font-semibold">{t("report.rulesUsed")}</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr>
                  {versionCols.map((c) => (
                    <th key={c} className="border-b border-line p-1">
                      {humanize(c)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {report.rule_versions_used.map((r, i) => (
                  <tr key={i}>
                    {versionCols.map((c) => (
                      <td key={c} className="break-all border-b border-line p-1 font-mono">
                        {r[c] ?? ""}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
      {[
        ["common.assumptions", report.assumptions],
        ["assessment.missing", report.missing_information],
        ["warnings.title", report.warnings],
      ].map(([k, items]) =>
        (items as string[]).length > 0 ? (
          <section key={k as string}>
            <h3 className="font-semibold">{t(k as string)}</h3>
            <ul className="list-disc pl-5 text-sm">
              {(items as string[]).map((m) => (
                <li key={m}>{m}</li>
              ))}
            </ul>
          </section>
        ) : null,
      )}
      <p role="note" className="rounded border border-pending-line bg-pending-tint p-3 text-sm font-semibold">
        {report.disclaimer}
      </p>
    </article>
  );
}
