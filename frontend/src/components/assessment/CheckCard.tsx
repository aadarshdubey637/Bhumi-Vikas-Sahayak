import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { getEvidence } from "@/api/endpoints/evidence";
import type { AssessmentCheck } from "@/api/types";
import { ErrorState } from "@/components/common/ErrorState";
import { LoadingSkeleton } from "@/components/common/States";
import { EvidenceCard } from "@/components/evidence/EvidenceCard";
import { CheckStatusBadge } from "@/components/evidence/StatusBadges";
import { formatValue, humanize } from "@/lib/format";
import { checkGroup } from "@/lib/status";
import { CalculationTrace } from "./CalculationTrace";

function RelatedEvidence({ id }: { id: string }) {
  const q = useQuery({ queryKey: ["evidence", id], queryFn: ({ signal }) => getEvidence(id, signal) });
  if (q.isPending) return <LoadingSkeleton lines={2} />;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  return <EvidenceCard evidence={q.data} />;
}

export function CheckCard({ check }: { check: AssessmentCheck }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const group = checkGroup(check.check_id);
  const regulatory = group === "regulatory";
  const hasRelated = check.related_evidence_ids.length > 0 || check.rule_references.length > 0;
  const inputs = Object.entries(check.input_values);
  return (
    <article className="glass rounded-xl p-4" aria-label={check.description}>
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="font-semibold">{check.description}</h4>
        <CheckStatusBadge status={check.status} />
      </header>
      {group === "input" ? (
        <p className="mt-1 text-xs text-ink-soft">{t("assessment.inputCheckNote")}</p>
      ) : null}
      <p className="mt-2 text-sm">{check.explanation}</p>
      {check.missing_information.length > 0 ? (
        <ul className="mt-2 flex flex-wrap gap-2" aria-label={t("missing.title")}>
          {check.missing_information.map((m) => (
            <li key={m} className="rounded border border-pending-line bg-pending-tint px-2 py-0.5 text-xs">
              {humanize(m)}
            </li>
          ))}
        </ul>
      ) : null}
      {inputs.length > 0 ? (
        <dl className="mt-2 grid grid-cols-[auto,1fr] gap-x-4 text-sm">
          {inputs.map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="text-ink-soft">{humanize(k)}</dt>
              <dd className="tabular">{formatValue(v)}</dd>
            </div>
          ))}
        </dl>
      ) : null}
      {check.calculation_result ? (
        <div className="mt-3">
          <CalculationTrace trace={check.calculation_result} />
        </div>
      ) : null}
      {check.warnings.length > 0 ? (
        <ul className="mt-2 list-disc pl-5 text-sm text-pending">
          {check.warnings.map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
      ) : null}
      {regulatory && hasRelated ? (
        <details className="mt-3" onToggle={(e) => setOpen((e.currentTarget as HTMLDetailsElement).open)}>
          <summary className="min-h-tap cursor-pointer py-2 text-sm font-semibold text-brand">
            {t("assessment.relatedNotApplied")}
          </summary>
          {check.rule_references.length > 0 ? (
            <p className="text-sm text-ink-soft">{check.rule_references.join(", ")}</p>
          ) : null}
          {open ? (
            <div className="mt-2 space-y-2">
              {check.related_evidence_ids.map((id) => (
                <RelatedEvidence key={id} id={id} />
              ))}
            </div>
          ) : null}
        </details>
      ) : null}
    </article>
  );
}

export function CheckGroups({ checks }: { checks: AssessmentCheck[] }) {
  const { t } = useTranslation();
  const input = checks.filter((c) => checkGroup(c.check_id) !== "regulatory");
  const reg = checks.filter((c) => checkGroup(c.check_id) === "regulatory");
  return (
    <div className="space-y-6">
      {input.length > 0 ? (
        <section>
          <h3 className="mb-2 text-lg font-semibold">{t("assessment.groupInput")}</h3>
          <div className="space-y-3">
            {input.map((c) => (
              <CheckCard key={c.check_id} check={c} />
            ))}
          </div>
        </section>
      ) : null}
      {reg.length > 0 ? (
        <section>
          <h3 className="mb-2 text-lg font-semibold">{t("assessment.groupRegulatory")}</h3>
          <div className="space-y-3">
            {reg.map((c) => (
              <CheckCard key={c.check_id} check={c} />
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
