import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { listFeedback } from "@/api/endpoints/feedback";
import { ErrorState } from "@/components/common/ErrorState";
import { PageHeader } from "@/components/common/PageHeader";
import { Pagination } from "@/components/common/Pagination";
import { EmptyState, InfoBox, LoadingSkeleton } from "@/components/common/States";
import { FeedbackForm } from "@/components/forms/FeedbackForm";
import { formatDateTime } from "@/lib/format";
import { card } from "@/lib/ui";

const LIMIT = 20;

export default function Feedback() {
  const { t, i18n } = useTranslation();
  const [offset, setOffset] = useState(0);
  const q = useQuery({
    queryKey: ["feedback", { limit: LIMIT, offset }],
    queryFn: ({ signal }) => listFeedback({ limit: LIMIT, offset }, signal),
  });
  return (
    <>
      <PageHeader title={t("feedback.title")} />
      <div className="grid gap-4 lg:grid-cols-2">
        <section className={card}>
          <h2 className="mb-2 font-semibold">{t("feedback.new")}</h2>
          <FeedbackForm />
        </section>
        <section aria-label={t("feedback.mine")}>
          <h2 className="mb-2 font-semibold">{t("feedback.mine")}</h2>
          <InfoBox tone="muted">{t("feedback.noMessageNote")}</InfoBox>
          {q.isPending ? <LoadingSkeleton lines={3} /> : null}
          {q.isError ? <ErrorState error={q.error} onRetry={() => void q.refetch()} /> : null}
          {q.data && q.data.items.length === 0 ? <EmptyState title={t("feedback.empty")} /> : null}
          <ul className="mt-2 space-y-2">
            {q.data?.items.map((f) => (
              <li key={f.id} className={card}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-semibold">{t(`feedback.categories.${f.category}`)}</span>
                  <span className="rounded bg-surface-sunken px-2 py-0.5 text-xs">
                    {t(`feedback.resolution.${f.resolution_status}`, { defaultValue: f.resolution_status })}
                  </span>
                </div>
                <p className="text-xs text-ink-soft">{formatDateTime(f.created_at, i18n.language)}</p>
                {f.evidence_id ? <p className="font-mono text-xs">{f.evidence_id}</p> : null}
                {f.assessment_id ? <p className="font-mono text-xs">{f.assessment_id}</p> : null}
              </li>
            ))}
          </ul>
          {q.data ? (
            <Pagination
              total={q.data.total}
              limit={q.data.limit}
              offset={q.data.offset}
              onChange={setOffset}
            />
          ) : null}
        </section>
      </div>
    </>
  );
}
