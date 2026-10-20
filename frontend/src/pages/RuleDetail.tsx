import * as Tabs from "@radix-ui/react-tabs";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useParams } from "react-router-dom";
import { getRule, getRuleVersions, searchRules } from "@/api/endpoints/rules";
import { isApiError } from "@/api/errors";
import { AmendmentList, VersionResolutionView } from "@/components/ask/VersionPanel";
import { ErrorState } from "@/components/common/ErrorState";
import { PageHeader } from "@/components/common/PageHeader";
import { EmptyState, InfoBox, LoadingSkeleton } from "@/components/common/States";
import { EvidenceList } from "@/components/evidence/EvidenceCard";
import { FlagList } from "@/components/evidence/FlagList";
import { VerificationBadge } from "@/components/evidence/StatusBadges";
import { formatDate } from "@/lib/format";
import { decodeRuleParam, ruleHref } from "@/lib/rule-number";
import { btnLink, input, label as labelCls } from "@/lib/ui";

const tabCls =
  "min-h-tap px-4 text-sm font-semibold data-[state=active]:border-b-2 data-[state=active]:border-brand data-[state=active]:text-brand-dark";

export default function RuleDetail() {
  const { t, i18n } = useTranslation();
  const ruleId = decodeRuleParam(useParams().ruleId);
  const [asOf, setAsOf] = useState("");
  const [tab, setTab] = useState("summary");
  const asOfParam = asOf || undefined;
  const rule = useQuery({
    queryKey: ["rule", ruleId, asOfParam],
    queryFn: ({ signal }) => getRule(ruleId, asOfParam, signal),
  });
  const versions = useQuery({
    queryKey: ["rule-versions", ruleId, asOfParam],
    queryFn: ({ signal }) => getRuleVersions(ruleId, asOfParam, signal),
    enabled: tab === "versions" || (rule.data?.embedded_in ?? null) !== null,
  });
  const chunks = useQuery({
    queryKey: ["rule-chunks", ruleId],
    queryFn: ({ signal }) => searchRules({ rule_number: ruleId, limit: 50 }, signal),
    enabled: tab === "chunks",
  });

  if (rule.isPending) return <LoadingSkeleton lines={4} />;
  if (rule.isError) {
    if (isApiError(rule.error) && rule.error.status === 404)
      return (
        <EmptyState title={t("rules.notFound")}>
          <Link className={btnLink} to="/rules">
            {t("nav.rules")}
          </Link>
        </EmptyState>
      );
    return <ErrorState error={rule.error} onRetry={() => void rule.refetch()} />;
  }
  const r = rule.data;
  const consolidated = r.version_resolution?.corpus_consolidated_to ?? null;
  const afterCorpus = !!asOf && !!consolidated && asOf > consolidated;
  return (
    <>
      <PageHeader title={t("rules.ruleHeading", { rule: r.official_rule_id, title: r.title })} />
      <p className="mb-3 text-sm text-ink-soft">{r.part}</p>
      {r.embedded_in ? (
        <InfoBox tone="pending">
          {t("rules.embedded", { rule: r.official_rule_id, parent: r.embedded_in })}{" "}
          <Link className={btnLink} to={ruleHref(r.embedded_in)}>
            {t("rules.openParent", { parent: r.embedded_in })}
          </Link>
        </InfoBox>
      ) : null}
      <div className="my-3 max-w-xs">
        <label htmlFor="rd-asof" className={labelCls}>
          {t("ask.asOf")}
        </label>
        <input
          id="rd-asof"
          type="date"
          className={input}
          value={asOf}
          onChange={(e) => setAsOf(e.target.value)}
        />
      </div>
      {afterCorpus ? (
        <InfoBox tone="pending">
          {t("rules.afterCorpus", { date: formatDate(consolidated, i18n.language) })}
        </InfoBox>
      ) : null}
      <Tabs.Root value={tab} onValueChange={setTab} className="mt-3">
        <Tabs.List className="flex border-b border-line" aria-label={t("rules.tabs")}>
          <Tabs.Trigger value="summary" className={tabCls}>
            {t("rules.tabSummary")}
          </Tabs.Trigger>
          <Tabs.Trigger value="versions" className={tabCls}>
            {t("rules.tabVersions")}
          </Tabs.Trigger>
          <Tabs.Trigger value="chunks" className={tabCls}>
            {t("rules.tabChunks")}
          </Tabs.Trigger>
        </Tabs.List>
        <Tabs.Content value="summary" className="space-y-3 pt-3">
          {r.version_resolution ? (
            <VersionResolutionView v={r.version_resolution} lang={i18n.language} />
          ) : null}
          <h2 className="font-semibold">{t("version.amendments")}</h2>
          {r.linked_amendments.length > 0 ? (
            <AmendmentList items={r.linked_amendments} />
          ) : (
            <p className="text-sm text-ink-soft">{t("version.noAmendments")}</p>
          )}
          {r.versions.length > 0 ? (
            <ul className="space-y-1 text-sm">
              {r.versions.map((v) => (
                <li key={v.version_id} className="rounded border border-line p-2">
                  <span className="font-mono text-xs">{v.version_id}</span> · {v.version_status} ·{" "}
                  {t("evidence.pageSpan", { start: v.page_start, end: v.page_end })}{" "}
                  <VerificationBadge status={v.verification_status} />
                </li>
              ))}
            </ul>
          ) : null}
        </Tabs.Content>
        <Tabs.Content value="versions" className="space-y-3 pt-3">
          {versions.isPending ? <LoadingSkeleton lines={4} /> : null}
          {versions.isError ? (
            <ErrorState error={versions.error} onRetry={() => void versions.refetch()} />
          ) : null}
          {versions.data?.items.map((v) => (
            <article key={v.version_id} className="glass rounded-xl p-4">
              <header className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-xs">{v.version_id}</span>
                <VerificationBadge status={v.verification_status} />
              </header>
              <p className="mt-1 text-sm text-ink-soft">
                {v.source_document.title} · {t("evidence.pageSpan", { start: v.page_start, end: v.page_end })}
              </p>
              <FlagList flags={v.flags} />
              <pre className="mt-2 max-h-96 overflow-auto whitespace-pre-wrap rounded bg-surface-sunken p-3 font-mono text-xs">
                {v.original_text}
              </pre>
              {v.reviewer_notes ? <p className="mt-2 text-sm">{v.reviewer_notes}</p> : null}
            </article>
          ))}
          {versions.data && versions.data.items.length === 0 ? (
            <EmptyState title={t("rules.noVersions")} />
          ) : null}
        </Tabs.Content>
        <Tabs.Content value="chunks" className="pt-3">
          {chunks.isPending ? <LoadingSkeleton lines={3} /> : null}
          {chunks.isError ? <ErrorState error={chunks.error} onRetry={() => void chunks.refetch()} /> : null}
          {chunks.data?.note ? <InfoBox tone="info">{chunks.data.note}</InfoBox> : null}
          {chunks.data ? <EvidenceList items={chunks.data.items} /> : null}
        </Tabs.Content>
      </Tabs.Root>
    </>
  );
}
