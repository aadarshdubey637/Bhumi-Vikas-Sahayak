import { useQuery } from "@tanstack/react-query";
import { ExternalLink, GitPullRequestArrow, Scale } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { listAmendments, type Amendment } from "@/api/endpoints/amendments";
import { ErrorState } from "@/components/common/ErrorState";
import { PageHeader } from "@/components/common/PageHeader";
import { EmptyState, InfoBox, LoadingSkeleton } from "@/components/common/States";
import { useBackendReadiness } from "@/hooks/useBackendReadiness";
import { formatDate, isHttpUrl } from "@/lib/format";
import { ruleHref } from "@/lib/rule-number";
import { btnLink } from "@/lib/ui";

function AmendmentCard({ a }: { a: Amendment }) {
  const { t, i18n } = useTranslation();
  const verified = a.verification_status === "verified";
  const date = (v: string | null, unknownKey: string) => (v ? formatDate(v, i18n.language) : t(unknownKey));
  return (
    <article className={`glass rounded-2xl border-l-4 p-4 ${verified ? "border-verified-line border-l-verified" : "border-pending-line border-l-pending"}`}>
      <header className="flex flex-wrap items-start justify-between gap-2">
        <h3 className="min-w-0 flex-1 font-semibold">{a.title}</h3>
        <span
          className={`shrink-0 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${verified ? "border-verified-line bg-verified-tint text-verified" : "border-pending-line bg-pending-tint text-pending"}`}
        >
          {t(`amend.status.${verified ? "verified" : "pending"}`, { defaultValue: a.verification_status })}
        </span>
      </header>
      <p className="mt-1 font-mono text-xs text-ink-faint">{a.amendment_id}</p>
      {a.summary ? <p className="mt-2 text-sm">{a.summary}</p> : null}
      <dl className="mt-3 grid grid-cols-[auto,1fr] gap-x-4 gap-y-1 text-sm">
        <dt className="text-ink-soft">{t("amend.stated")}</dt>
        <dd>{date(a.stated_date, "amend.none")}</dd>
        <dt className="text-ink-soft">{t("amend.published")}</dt>
        <dd>{date(a.publication_date, "amend.unknown")}</dd>
        <dt className="text-ink-soft">{t("amend.effective")}</dt>
        <dd>{date(a.effective_date, "amend.unknown")}</dd>
      </dl>
      {a.affects.length > 0 ? (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold text-ink-soft">{t("amend.affects")}</span>
          {a.affects.map((x) => (
            <Link
              key={`${x.rule}-${x.clause_path}`}
              to={ruleHref(x.rule)}
              className="rounded-full border border-info-line bg-info-tint px-2.5 py-0.5 text-xs font-semibold text-info hover:bg-brand-tint"
            >
              {t("amend.ruleChip", { rule: x.rule })}
              {x.clause_path ? ` (${x.clause_path.split("/").join(")(")})` : ""}
            </Link>
          ))}
        </div>
      ) : null}
      {a.source_url && isHttpUrl(a.source_url) ? (
        <p className="mt-3 text-xs">
          <a href={a.source_url} target="_blank" rel="noreferrer noopener" className={`${btnLink} !min-h-0 text-xs`}>
            {t("amend.sourceLink")}
            <ExternalLink aria-hidden="true" className="h-3 w-3" />
          </a>
          <span className="ml-2 text-ink-faint">{t("amend.sourceNote")}</span>
        </p>
      ) : null}
    </article>
  );
}

export default function Amendments() {
  const { t } = useTranslation();
  const { ready } = useBackendReadiness();
  const q = useQuery({ queryKey: ["amendments"], queryFn: ({ signal }) => listAmendments(signal), retry: false });
  const items = q.data?.items ?? [];
  const verified = items.filter((a) => a.verification_status === "verified");
  const manual = items.filter((a) => a.verification_status !== "verified");

  return (
    <>
      <PageHeader title={t("amend.title")} description={t("amend.description")} icon={GitPullRequestArrow} />
      <InfoBox tone="pending">{t("amend.notice")}</InfoBox>
      {q.isPending ? (
        <div className="mt-4">
          <LoadingSkeleton lines={4} />
        </div>
      ) : null}
      {q.isError ? (
        <div className="mt-4">
          <ErrorState error={q.error} onRetry={() => void q.refetch()} />
        </div>
      ) : null}
      {q.data ? (
        <div className="mt-5 space-y-8">
          <section aria-labelledby="amd-corpus" className="glass rounded-2xl p-5">
            <h2 id="amd-corpus" className="flex items-center gap-2 font-semibold">
              <Scale aria-hidden="true" className="h-4 w-4 text-brand" />
              {t("amend.corpusTitle")}
            </h2>
            <p className="mt-1 text-sm text-ink-soft">
              {ready.data ? t("amend.corpusBody", { n: ready.data.rules_loaded }) : t("amend.corpusBodyUnknown")}
            </p>
            <Link to="/rules" className={`${btnLink} mt-1`}>
              {t("amend.corpusLink")}
            </Link>
          </section>

          <section aria-labelledby="amd-verified" className="space-y-3">
            <h2 id="amd-verified" className="flex items-center gap-2 font-semibold">
              <GitPullRequestArrow aria-hidden="true" className="h-4 w-4 text-verified" />
              {t("amend.verifiedTitle", { n: verified.length })}
            </h2>
            {verified.length === 0 ? <EmptyState title={t("amend.verifiedEmpty")} /> : verified.map((a) => <AmendmentCard key={a.amendment_id} a={a} />)}
          </section>

          <section aria-labelledby="amd-manual" className="space-y-3">
            <h2 id="amd-manual" className="flex items-center gap-2 font-semibold">
              <GitPullRequestArrow aria-hidden="true" className="h-4 w-4 text-pending" />
              {t("amend.manualTitle", { n: manual.length })}
            </h2>
            <p className="text-sm text-ink-soft">{t("amend.manualHelp")}</p>
            {manual.length === 0 ? <EmptyState title={t("amend.manualEmpty")} /> : manual.map((a) => <AmendmentCard key={a.amendment_id} a={a} />)}
          </section>
          <p className="text-xs text-ink-faint">{q.data.note}</p>
        </div>
      ) : null}
    </>
  );
}
