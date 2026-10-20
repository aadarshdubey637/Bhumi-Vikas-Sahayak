import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import type { Evidence } from "@/api/types";
import { CopyButton } from "@/components/common/CopyButton";
import { pageInfo } from "@/lib/format";
import { ruleHref } from "@/lib/rule-number";
import { btnLink } from "@/lib/ui";
import { FlagList } from "./FlagList";
import { Highlighted } from "./Highlighted";
import { VerificationBadge } from "./StatusBadges";
import { useEvidenceDrawer } from "./EvidenceDrawerContext";

const COLLAPSE_LINES = 6;

const METHOD_KEYS = ["exact_rule_number", "bm25", "hybrid", "amendment_link", "evidence_lookup"];

export function EvidenceCard({
  evidence,
  terms = [],
  onReport,
  showScore,
}: {
  evidence: Evidence;
  terms?: string[];
  onReport?: (evidenceId: string) => void;
  showScore?: boolean;
}) {
  const { t, i18n } = useTranslation();
  const { open } = useEvidenceDrawer();
  const [expanded, setExpanded] = useState(false);
  const pg = pageInfo(evidence);
  const lines = evidence.excerpt.split("\n");
  const long = lines.length > COLLAPSE_LINES;
  const shown = long && !expanded ? lines.slice(0, COLLAPSE_LINES).join("\n") + "…" : evidence.excerpt;

  return (
    <article
      className="glass rounded-xl p-4"
      aria-label={t("evidence.chip", { rule: evidence.rule_number })}
    >
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-base font-semibold">
            {t("evidence.rule", { rule: evidence.rule_number })}{" "}
            <span className="font-normal text-ink-soft">— {evidence.rule_title}</span>
          </h3>
          {pg.pages ? (
            <p className="text-sm text-ink-soft tabular">
              {pg.exact
                ? t("evidence.pageExact", { pages: pg.pages })
                : t("evidence.pageRange", { pages: pg.pages })}
            </p>
          ) : null}
        </div>
        <VerificationBadge status={evidence.verification_status} />
      </header>
      {evidence.verification_status === "unverified" ? (
        <p className="mt-1 text-xs text-ink-faint">{t("status.unverifiedHelp")}</p>
      ) : null}
      <p className="mt-2 text-xs text-ink-faint">
        {METHOD_KEYS.includes(evidence.retrieval_method)
          ? t(`evidence.method.${evidence.retrieval_method}`)
          : evidence.retrieval_method}
        {showScore && evidence.score !== null
          ? ` · ${t("evidence.score")}: ${evidence.score.toFixed(2)}`
          : ""}
        {evidence.is_embedded_rule ? ` · ${t("evidence.embedded")}` : ""}
      </p>
      <div className="mt-2">
        <FlagList flags={evidence.flags} tableLike={evidence.table_like} />
      </div>
      <pre
        className="mt-3 whitespace-pre-wrap break-words rounded bg-surface-sunken p-3 font-sans text-sm"
        lang="en"
      >
        <Highlighted text={shown} terms={terms} />
      </pre>
      {i18n.language === "hi" ? (
        <p className="mt-1 text-xs text-ink-faint">{t("evidence.notTranslated")}</p>
      ) : null}
      <footer className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1">
        {long ? (
          <button
            type="button"
            className={btnLink}
            onClick={() => setExpanded((v) => !v)}
            aria-expanded={expanded}
          >
            {expanded ? t("evidence.showLess") : t("evidence.showFull")}
          </button>
        ) : null}
        <code className="font-mono text-xs text-ink-soft">{evidence.evidence_id}</code>
        <CopyButton text={evidence.evidence_id} compact />
        <button type="button" className={btnLink} onClick={() => open(evidence.evidence_id)}>
          {t("evidence.details")}
        </button>
        <Link className={btnLink} to={ruleHref(evidence.rule_number)}>
          {t("evidence.openRule")}
        </Link>
        {onReport ? (
          <button type="button" className={btnLink} onClick={() => onReport(evidence.evidence_id)}>
            {t("evidence.reportIssue")}
          </button>
        ) : null}
      </footer>
    </article>
  );
}

export function EvidenceList({
  items,
  terms,
  onReport,
  showScore,
}: {
  items: Evidence[];
  terms?: string[];
  onReport?: (id: string) => void;
  showScore?: boolean;
}) {
  return (
    <ul className="space-y-3">
      {items.map((e) => (
        <li key={e.evidence_id}>
          <EvidenceCard evidence={e} terms={terms} onReport={onReport} showScore={showScore} />
        </li>
      ))}
    </ul>
  );
}
