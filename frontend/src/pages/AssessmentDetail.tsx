import * as Tabs from "@radix-ui/react-tabs";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useParams } from "react-router-dom";
import { getAssessment, getAssessmentEvidence } from "@/api/endpoints/assessments";
import { generateReport } from "@/api/endpoints/reports";
import { isApiError } from "@/api/errors";
import { AssessmentSummary } from "@/components/assessment/AssessmentSummary";
import { ErrorState } from "@/components/common/ErrorState";
import { PageHeader } from "@/components/common/PageHeader";
import { EmptyState, InfoBox, LoadingSkeleton } from "@/components/common/States";
import { VerificationBadge } from "@/components/evidence/StatusBadges";
import { useFeedbackDialog } from "@/components/forms/FeedbackDialogContext";
import { formatDateTime, formatValue, humanize } from "@/lib/format";
import { isSafeId } from "@/lib/rule-number";
import { btn, btnPrimary } from "@/lib/ui";

const tabCls =
  "min-h-tap px-4 text-sm font-semibold data-[state=active]:border-b-2 data-[state=active]:border-brand data-[state=active]:text-brand-dark";

export default function AssessmentDetail() {
  const { t, i18n } = useTranslation();
  const id = useParams().id;
  const safe = isSafeId(id);
  const aid = safe ? id : "";
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { openFeedback } = useFeedbackDialog();
  const a = useQuery({
    queryKey: ["assessment", aid],
    queryFn: ({ signal }) => getAssessment(aid, signal),
    enabled: safe,
  });
  const ev = useQuery({
    queryKey: ["assessment-evidence", aid],
    queryFn: ({ signal }) => getAssessmentEvidence(aid, signal),
    enabled: safe,
  });
  const gen = useMutation({
    mutationFn: () => generateReport(aid),
    onSuccess: (r) => {
      qc.setQueryData(["report", aid], r);
      navigate(`/assessments/${aid}/report`);
    },
  });
  if (!safe) return <EmptyState title={t("assessment.notFound")} />;
  if (a.isPending) return <LoadingSkeleton lines={4} />;
  if (a.isError)
    return isApiError(a.error) && a.error.status === 404 ? (
      <EmptyState title={t("assessment.notFound")} />
    ) : (
      <ErrorState error={a.error} onRetry={() => void a.refetch()} />
    );
  const d = a.data;
  return (
    <>
      <PageHeader title={t("assessment.title")}>
        <div className="flex flex-wrap gap-2">
          <Link className={btn} to={`/assessments/${d.id}/report`}>
            {t("assessment.viewReport")}
          </Link>
          <button type="button" className={btnPrimary} disabled={gen.isPending} onClick={() => gen.mutate()}>
            {t("assessment.generateReport")}
          </button>
          <button
            type="button"
            className={btn}
            onClick={() => openFeedback({ assessmentId: d.id, category: "incorrect_calculation" })}
          >
            {t("ask.reportProblem")}
          </button>
        </div>
      </PageHeader>
      <p className="mb-2 font-mono text-xs text-ink-soft">
        {d.id} · {formatDateTime(d.created_at, i18n.language)}
      </p>
      <InfoBox tone="muted">{t("assessment.immutable")}</InfoBox>
      {gen.isError ? <ErrorState className="mt-2" error={gen.error} /> : null}
      <Tabs.Root defaultValue="checks" className="mt-3">
        <Tabs.List className="flex border-b border-line">
          <Tabs.Trigger value="checks" className={tabCls}>
            {t("assessment.tabChecks")}
          </Tabs.Trigger>
          <Tabs.Trigger value="evidence" className={tabCls}>
            {t("assessment.tabEvidence")}
          </Tabs.Trigger>
        </Tabs.List>
        <Tabs.Content value="checks" className="space-y-4 pt-3">
          <section>
            <h2 className="font-semibold">{t("assessment.snapshot")}</h2>
            <p className="text-xs text-ink-soft">{t("assessment.snapshotNote")}</p>
            <dl className="mt-1 grid grid-cols-[auto,1fr] gap-x-4 text-sm">
              {Object.entries(d.input_snapshot).map(([k, v]) => (
                <div key={k} className="contents">
                  <dt className="text-ink-soft">{humanize(k)}</dt>
                  <dd className="tabular">{formatValue(v)}</dd>
                </div>
              ))}
            </dl>
          </section>
          <AssessmentSummary data={d} />
        </Tabs.Content>
        <Tabs.Content value="evidence" className="space-y-2 pt-3">
          {ev.isPending ? <LoadingSkeleton lines={3} /> : null}
          {ev.isError ? <ErrorState error={ev.error} onRetry={() => void ev.refetch()} /> : null}
          {ev.data && ev.data.items.length === 0 ? <EmptyState title={t("assessment.noEvidence")} /> : null}
          {ev.data?.items.map((e) => (
            <article key={e.evidence_id} className="glass rounded-xl p-3">
              <header className="flex flex-wrap items-center gap-2 text-sm font-semibold">
                {t("evidence.rule", { rule: e.rule_number })}
                {e.page_reference ? ` · ${t("evidence.pageShort", { pages: e.page_reference })}` : ""}
                <VerificationBadge status={e.verification_status} />
                <span className="rounded bg-surface-sunken px-2 py-0.5 text-xs font-normal">
                  {t("assessment.relatedContext")}
                </span>
              </header>
              <p className="mt-1 whitespace-pre-wrap text-sm">{e.evidence_text}</p>
              <p className="mt-1 font-mono text-xs text-ink-soft">{e.evidence_id}</p>
            </article>
          ))}
        </Tabs.Content>
      </Tabs.Root>
    </>
  );
}
