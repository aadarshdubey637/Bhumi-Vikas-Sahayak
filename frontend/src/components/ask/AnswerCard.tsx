import { ChevronDown } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { AskResponse } from "@/api/types";
import { CalculationTrace } from "@/components/assessment/CalculationTrace";
import { CopyButton } from "@/components/common/CopyButton";
import { RequestIdTag } from "@/components/common/RequestIdTag";
import { EvidenceIdChip } from "@/components/evidence/CitationChip";
import { EvidenceList } from "@/components/evidence/EvidenceCard";
import { LinkedText } from "@/components/evidence/LinkedText";
import { StatusBadge } from "@/components/evidence/StatusBadges";
import { humanize } from "@/lib/format";
import { ANSWER_VIEW, TONE_ACCENT, viewFor } from "@/lib/status";
import { btn, btnLink } from "@/lib/ui";
import { ExtractedFactsTable } from "./ExtractedFactsTable";
import { MissingInfoPanel } from "./MissingInfoPanel";
import { RejectedEvidence } from "./RejectedEvidence";
import { VersionPanel } from "./VersionPanel";
import { WarningsList } from "./WarningsList";

const LANG_LABEL: Record<string, string> = { en: "English", hi: "हिन्दी", "hi-en": "Hinglish" };

/** Native <details>: keyboard and screen-reader friendly, content stays in the DOM when closed. */
function Disclosure({ title, defaultOpen = false, children }: { title: string; defaultOpen?: boolean; children: React.ReactNode }) {
  return (
    <details open={defaultOpen} className="group rounded-xl border border-line bg-white/60">
      <summary className="flex min-h-tap cursor-pointer list-none items-center justify-between gap-2 px-3.5 text-sm font-semibold text-ink-soft [&::-webkit-details-marker]:hidden">
        {title}
        <ChevronDown aria-hidden="true" className="h-4 w-4 transition-transform group-open:rotate-180" />
      </summary>
      <div className="space-y-4 border-t border-line p-3.5">{children}</div>
    </details>
  );
}

const FIRST_N = 2;

/** The first passages are the best matches; the rest stay one click away so a long answer does not bury the actions. */
function LimitedEvidence({ items, terms, onReport }: { items: AskResponse["evidence"]; terms?: string[]; onReport: (id?: string) => void }) {
  const { t } = useTranslation();
  const [all, setAll] = useState(false);
  const shown = all ? items : items.slice(0, FIRST_N);
  return (
    <>
      <EvidenceList items={shown} terms={terms} onReport={(id) => onReport(id)} />
      {!all && items.length > FIRST_N ? (
        <button type="button" className={btn} onClick={() => setAll(true)}>
          {t("askx.showMore", { n: items.length - FIRST_N })}
        </button>
      ) : null}
    </>
  );
}

export function AnswerCard({
  response,
  terms,
  requestId,
  onReport,
}: {
  response: AskResponse;
  terms?: string[];
  requestId?: string | null;
  onReport: (evidenceId?: string) => void;
}) {
  const { t } = useTranslation();
  const r = response;
  const notEstablished = r.status === "not_established";
  const citations = r.evidence.map((e) => `Rule ${e.rule_number} [${e.evidence_id}]`).join("\n");
  const followUp = r.follow_up_question ?? null;
  const hasDetails = r.extracted_facts.length > 0 || r.assumptions.length > 0 || r.rejected_evidence.length > 0;

  return (
    <article
      className={`glass-strong space-y-4 rounded-2xl border-l-4 p-4 sm:p-5 ${TONE_ACCENT[viewFor(ANSWER_VIEW, r.status).tone]}`}
      aria-label={t("ask.answerLabel")}
    >
      {/* 1 · what is this answer */}
      <header className="flex flex-wrap items-center gap-2">
        <StatusBadge status={r.status} />
        <span className="rounded-full bg-surface-sunken px-2.5 py-0.5 text-xs">
          {t(`intent.${r.intent}`, { defaultValue: humanize(r.intent) })}
        </span>
        <span className="rounded-full bg-surface-sunken px-2.5 py-0.5 text-xs">{LANG_LABEL[r.language] ?? r.language}</span>
      </header>
      <p className="text-sm text-ink-soft">{t(`status.answerHelp.${r.status}`, { defaultValue: "" })}</p>

      {/* 2 · the answer */}
      <div className="text-[0.9375rem] leading-relaxed">
        <LinkedText text={r.answer} />
      </div>

      {r.direct_answer && r.direct_answer.quotes.length > 0 ? (
        <Disclosure title={`${t("ask.exactText")} (${r.direct_answer.quotes.length})`} defaultOpen>
          {r.direct_answer.quotes.map((q) => (
            <figure key={`${q.rule_number}-${q.text.slice(0, 40)}`} className="space-y-1">
              <figcaption className="text-sm font-semibold">
                Rule {q.rule_number} — {q.rule_title} · PDF p.{q.page_start === q.page_end ? q.page_start : `${q.page_start}–${q.page_end}`}
              </figcaption>
              <blockquote className="whitespace-pre-wrap rounded-lg bg-surface-sunken p-3 font-mono text-xs leading-relaxed">{q.text}</blockquote>
            </figure>
          ))}
          {r.source_version ? (
            <p className="text-xs text-ink-soft">
              {t("ask.versionLabel")} {r.source_version}
            </p>
          ) : null}
        </Disclosure>
      ) : null}

      {/* 3 · the one thing we need from the user, right under the answer */}
      {followUp ? (
        <div className="rounded-xl border-2 border-brand bg-brand-tint p-3.5 text-sm font-semibold">{followUp}</div>
      ) : null}

      {r.explanation ? (
        <section className="rounded-xl border border-info-line bg-info-tint p-3.5 text-sm" aria-label={t("ask.explanationTitle")}>
          <h4 className="font-semibold">{t("ask.explanationTitle")}</h4>
          <p className="mt-1 whitespace-pre-wrap">{r.explanation}</p>
          {r.explanation_citations.length > 0 ? (
            <div className="mt-2 flex flex-wrap gap-2">
              {r.explanation_citations.map((c) => (
                <EvidenceIdChip key={c} evidenceId={c} />
              ))}
            </div>
          ) : null}
          <p className="mt-2 text-xs text-ink-soft">{t("ask.explanationCaveat")}</p>
        </section>
      ) : null}

      {/* 4 · proof: the exact rule text */}
      {notEstablished ? (
        <p className="rounded-xl border border-muted-line bg-muted-tint p-3.5 text-sm">{t("ask.noSupportingText")}</p>
      ) : r.evidence.length > 0 ? (
        <Disclosure title={`${t("ask.evidenceTitle")} (${r.evidence.length})`} defaultOpen>
          <LimitedEvidence items={r.evidence} terms={terms} onReport={onReport} />
        </Disclosure>
      ) : null}

      {/* 5 · what is missing / limits: always visible */}
      <MissingInfoPanel info={r.missing_information} />
      <WarningsList warnings={r.warnings} />
      <VersionPanel items={r.version_status} />
      {r.calculations.map((c) => (
        <CalculationTrace key={c.calculation_id} trace={c} />
      ))}

      {/* 6 · supporting detail, collapsed by default */}
      {hasDetails ? (
        <Disclosure title={t("askx.moreDetails")}>
          <ExtractedFactsTable facts={r.extracted_facts} />
          {r.assumptions.length > 0 ? (
            <section className={r.status === "conditional" ? "rounded-xl border border-info-line bg-info-tint p-3" : ""}>
              <h4 className="text-sm font-semibold">{t("common.assumptions")}</h4>
              <ul className="list-disc pl-5 text-sm">
                {r.assumptions.map((a) => (
                  <li key={a}>{a}</li>
                ))}
              </ul>
            </section>
          ) : null}
          <RejectedEvidence items={r.rejected_evidence} />
        </Disclosure>
      ) : null}

      <footer className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-line pt-3">
        <CopyButton text={r.answer} label={t("ask.copyAnswer")} compact />
        {r.evidence.length > 0 ? <CopyButton text={citations} label={t("ask.copyCitations")} compact /> : null}
        <button type="button" className={btnLink} onClick={() => onReport()}>
          {t("ask.reportProblem")}
        </button>
        <RequestIdTag requestId={requestId} />
      </footer>
    </article>
  );
}
