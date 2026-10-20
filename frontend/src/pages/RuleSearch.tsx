import { useQuery } from "@tanstack/react-query";
import { Scale } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router-dom";
import { searchRules } from "@/api/endpoints/rules";
import type { Language, RuleSearchRequest, Verification } from "@/api/types";
import { ErrorState } from "@/components/common/ErrorState";
import { PageHeader } from "@/components/common/PageHeader";
import { Pagination } from "@/components/common/Pagination";
import { EmptyState, InfoBox, LoadingSkeleton } from "@/components/common/States";
import { EvidenceList } from "@/components/evidence/EvidenceCard";
import { useFeedbackDialog } from "@/components/forms/FeedbackDialogContext";
import { queryTerms } from "@/lib/highlight";
import { btnPrimary, input, label as labelCls } from "@/lib/ui";

export default function RuleSearch() {
  const { t } = useTranslation();
  const { openFeedback } = useFeedbackDialog();
  const [q, setQ] = useState("");
  const [num, setNum] = useState("");
  const [language, setLanguage] = useState("");
  const [ver, setVer] = useState("");
  const [limit, setLimit] = useState(10);
  const [submitted, setSubmitted] = useState<RuleSearchRequest | null>(null);
  const empty = q.trim() === "" && num.trim() === "";
  // The header's global search sends ?q=: a bare rule number looks the rule up, anything else is a text query.
  const [params] = useSearchParams();
  const urlQ = params.get("q");
  useEffect(() => {
    const v = (urlQ ?? "").trim();
    if (!v) return;
    const m = /^(?:rule\s+)?(\d{1,3}\s?-?\s?[A-Za-z]?)$/i.exec(v);
    if (m?.[1]) {
      const n = m[1].replace(/\s+/g, "");
      setNum(n);
      setQ("");
      setSubmitted({ limit: 10, offset: 0, rule_number: n });
    } else {
      setQ(v);
      setNum("");
      setSubmitted({ limit: 10, offset: 0, query: v });
    }
  }, [urlQ]);

  const build = (off: number, lim: number): RuleSearchRequest => {
    const b: RuleSearchRequest = { limit: lim, offset: off };
    if (q.trim()) b.query = q.trim();
    if (num.trim()) b.rule_number = num.trim();
    if (language) b.language = language as Language;
    if (ver) b.verification_status = ver as Verification;
    return b;
  };
  const results = useQuery({
    queryKey: ["rule-search", submitted],
    queryFn: ({ signal }) => searchRules(submitted as RuleSearchRequest, signal),
    enabled: submitted !== null,
  });
  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (empty) return;
    setSubmitted(build(0, limit));
  };
  const note = results.data?.note;
  const noRules = !!note && /no rules have been ingested/i.test(note);

  return (
    <>
      <PageHeader title={t("rules.title")} description={t("rulesx.description")} icon={Scale} />
      <form
        onSubmit={onSubmit}
        className="glass grid gap-3 rounded-2xl p-4 sm:grid-cols-2 sm:p-5"
      >
        <div>
          <label htmlFor="rs-q" className={labelCls}>
            {t("rules.query")}
          </label>
          <input
            id="rs-q"
            className={input}
            value={q}
            maxLength={1000}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <div>
          <label htmlFor="rs-num" className={labelCls}>
            {t("rules.ruleNumber")}
          </label>
          <input
            id="rs-num"
            className={input}
            value={num}
            maxLength={32}
            placeholder={t("rules.ruleNumberPlaceholder")}
            onChange={(e) => setNum(e.target.value)}
          />
        </div>
        <div>
          <label htmlFor="rs-lang" className={labelCls}>
            {t("common.language")}
          </label>
          <select
            id="rs-lang"
            className={input}
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
          >
            <option value="">{t("rules.any")}</option>
            <option value="en">English</option>
            <option value="hi">हिन्दी</option>
          </select>
        </div>
        <div>
          <label htmlFor="rs-ver" className={labelCls}>
            {t("rules.verification")}
          </label>
          <select id="rs-ver" className={input} value={ver} onChange={(e) => setVer(e.target.value)}>
            <option value="">{t("rules.any")}</option>
            {(["unverified", "pending_verification", "verified", "rejected"] as const).map((v) => (
              <option key={v} value={v}>
                {t(`status.verification.${v}`)}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-wrap items-end gap-3 sm:col-span-2">
          <div>
            <label htmlFor="rs-limit" className={labelCls}>
              {t("rules.perPage")}
            </label>
            <select
              id="rs-limit"
              className={input}
              value={limit}
              onChange={(e) => {
                const n = Number(e.target.value);
                setLimit(n);
                if (submitted) setSubmitted({ ...submitted, limit: n, offset: 0 });
              }}
            >
              {[10, 25, 50].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </div>
          <button type="submit" className={btnPrimary} disabled={empty}>
            {t("rules.search")}
          </button>
          {empty ? <span className="text-xs text-ink-soft">{t("rules.needOne")}</span> : null}
        </div>
      </form>
      <div className="mt-4 space-y-3" aria-live="polite">
        {results.isFetching ? <LoadingSkeleton lines={3} /> : null}
        {results.isError ? <ErrorState error={results.error} onRetry={() => void results.refetch()} /> : null}
        {note ? (
          noRules ? (
            <div
              role="alert"
              className="rounded border-2 border-pending bg-pending-tint p-3 text-sm font-semibold"
            >
              {note}
            </div>
          ) : (
            <InfoBox tone="info">{note}</InfoBox>
          )
        ) : null}
        {results.data && results.data.items.length === 0 && !note ? (
          <EmptyState title={t("rules.noResults")} />
        ) : null}
        {results.data && results.data.items.length > 0 ? (
          <>
            <EvidenceList
              items={results.data.items}
              terms={queryTerms(submitted?.query)}
              showScore
              onReport={(id) => openFeedback({ category: "incorrect_citation", evidenceId: id })}
            />
            <Pagination
              total={results.data.total}
              limit={results.data.limit}
              offset={results.data.offset}
              onChange={(o) => {
                if (submitted) setSubmitted({ ...submitted, offset: o });
              }}
            />
          </>
        ) : null}
      </div>
    </>
  );
}
