import { useQuery } from "@tanstack/react-query";
import { FileText } from "lucide-react";
import { useTranslation } from "react-i18next";
import { listDocuments } from "@/api/endpoints/documents";
import { ErrorState } from "@/components/common/ErrorState";
import { CopyButton } from "@/components/common/CopyButton";
import { PageHeader } from "@/components/common/PageHeader";
import { EmptyState, InfoBox, LoadingSkeleton } from "@/components/common/States";
import { VerificationBadge } from "@/components/evidence/StatusBadges";
import { formatDate, isHttpUrl } from "@/lib/format";
import { btnLink } from "@/lib/ui";

export default function Sources() {
  const { t, i18n } = useTranslation();
  const q = useQuery({ queryKey: ["documents"], queryFn: ({ signal }) => listDocuments(signal) });
  return (
    <>
      <PageHeader title={t("sources.title")} description={t("sourcesx.description")} icon={FileText} />
      {q.isPending ? <LoadingSkeleton lines={4} /> : null}
      {q.isError ? <ErrorState error={q.error} onRetry={() => void q.refetch()} /> : null}
      {q.data && q.data.items.length === 0 ? <EmptyState title={t("sources.empty")} /> : null}
      <div className="space-y-3">
        {q.data?.items.map((d) => (
          <article key={d.document_key} className="glass rounded-2xl p-4">
            <header className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-semibold">{d.title}</h2>
              <VerificationBadge status={d.verification_status} />
            </header>
            <dl className="mt-2 grid grid-cols-[auto,1fr] gap-x-4 gap-y-1 text-sm">
              <dt className="text-ink-soft">{t("sources.key")}</dt>
              <dd className="font-mono text-xs">{d.document_key}</dd>
              <dt className="text-ink-soft">{t("sources.type")}</dt>
              <dd>{d.document_type}</dd>
              <dt className="text-ink-soft">{t("common.language")}</dt>
              <dd>{d.language}</dd>
              <dt className="text-ink-soft">{t("sources.consolidation")}</dt>
              <dd>{formatDate(d.consolidation_date, i18n.language)}</dd>
              <dt className="text-ink-soft">{t("sources.pages")}</dt>
              <dd className="tabular">{d.page_count ?? "—"}</dd>
              <dt className="text-ink-soft">{t("sources.hash")}</dt>
              <dd className="flex items-center gap-2 break-all font-mono text-xs">
                {d.file_hash ?? "—"}
                {d.file_hash ? <CopyButton text={d.file_hash} compact /> : null}
              </dd>
            </dl>
            {d.language === "hi" ? (
              <div className="mt-2">
                <InfoBox tone="pending">{t("sources.hindiNotSearchable")}</InfoBox>
              </div>
            ) : null}
            {d.notes ? <p className="mt-2 text-sm">{d.notes}</p> : null}
            {isHttpUrl(d.source_url) ? (
              <a className={btnLink} href={d.source_url} target="_blank" rel="noopener noreferrer">
                {t("sources.open")}
              </a>
            ) : null}
          </article>
        ))}
      </div>
    </>
  );
}
