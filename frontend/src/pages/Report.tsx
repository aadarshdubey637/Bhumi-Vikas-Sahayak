import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Link, useParams } from "react-router-dom";
import { generateReport, getReport } from "@/api/endpoints/reports";
import { isApiError } from "@/api/errors";
import { ErrorState } from "@/components/common/ErrorState";
import { PageHeader } from "@/components/common/PageHeader";
import { EmptyState, InfoBox, LoadingSkeleton } from "@/components/common/States";
import { ReportView } from "@/components/report/ReportView";
import { downloadJson } from "@/lib/download";
import { isSafeId } from "@/lib/rule-number";
import { btn, btnLink, btnPrimary } from "@/lib/ui";

export default function Report() {
  const { t } = useTranslation();
  const id = useParams().id;
  const safe = isSafeId(id);
  const aid = safe ? id : "";
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["report", aid],
    queryFn: ({ signal }) => getReport(aid, signal),
    enabled: safe,
    retry: false,
  });
  const gen = useMutation({
    mutationFn: () => generateReport(aid),
    onSuccess: (r) => qc.setQueryData(["report", aid], r),
  });
  if (!safe) return <EmptyState title={t("assessment.notFound")} />;
  if (q.isPending) return <LoadingSkeleton lines={5} />;
  const notGenerated = q.isError && isApiError(q.error) && q.error.status === 404;
  if (notGenerated && !gen.data)
    return (
      <EmptyState title={t("report.notGenerated")}>
        <button type="button" className={btnPrimary} disabled={gen.isPending} onClick={() => gen.mutate()}>
          {t("assessment.generateReport")}
        </button>
        {gen.isError ? <ErrorState className="mt-2" error={gen.error} /> : null}
      </EmptyState>
    );
  if (q.isError && !gen.data) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  const report = gen.data ?? q.data;
  if (!report) return null;
  return (
    <>
      <PageHeader title={t("report.title")}>
        <div className="flex flex-wrap gap-2 print:hidden">
          <button type="button" className={btnPrimary} onClick={() => window.print()}>
            {t("report.print")}
          </button>
          <button
            type="button"
            className={btn}
            onClick={() => downloadJson(`report-${report.assessment_id}.json`, report)}
          >
            {t("report.downloadJson")}
          </button>
          <button type="button" className={btn} disabled={gen.isPending} onClick={() => gen.mutate()}>
            {t("report.regenerate")}
          </button>
          <Link className={btnLink} to={`/assessments/${report.assessment_id}`}>
            {t("report.back")}
          </Link>
        </div>
      </PageHeader>
      <div className="print:hidden">
        <InfoBox tone="muted">{t("report.regenerateNote")}</InfoBox>
      </div>
      {gen.isError ? <ErrorState className="mt-2" error={gen.error} /> : null}
      <ReportView report={report} />
    </>
  );
}
