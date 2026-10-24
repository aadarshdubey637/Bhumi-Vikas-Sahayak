import { ChevronDown } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { AskResponse } from "@/api/types";
import { CalculationTrace } from "@/components/assessment/CalculationTrace";
import { CopyButton } from "@/components/common/CopyButton";
import { Markdown } from "@/components/common/Markdown";
import { EvidenceIdChip } from "@/components/evidence/CitationChip";
import { EvidenceList } from "@/components/evidence/EvidenceCard";
import { LinkedText } from "@/components/evidence/LinkedText";
import { StatusBadge } from "@/components/evidence/StatusBadges";
import { btn, btnLink } from "@/lib/ui";
import { ExtractedFactsTable } from "./ExtractedFactsTable";
import { MissingInfoPanel } from "./MissingInfoPanel";
import { RejectedEvidence } from "./RejectedEvidence";
import { VersionPanel } from "./VersionPanel";
import { WarningsList } from "./WarningsList";

const FIRST_N = 2;

/**
 * An assistant turn in the chat: the answer is plain flowing text on the page (no card, no border), the way a chat
 * assistant writes. Proof and caveats sit one click below in "Sources and rule text".
 */
export function ChatAnswer({
  response: r,
  terms,
  onReport,
}: {
  response: AskResponse;
  terms?: string[];
  onReport: (evidenceId?: string) => void;
}) {
  const { t } = useTranslation();
  const [allEvidence, setAllEvidence] = useState(false);
  const hasExplanation = !!r.explanation;
  const general = r.explanation_kind === "general";
  const text = hasExplanation ? r.explanation! : r.answer;
  const shown = allEvidence ? r.evidence : r.evidence.slice(0, FIRST_N);
  const citations = r.evidence.map((e) => `Rule ${e.rule_number} [${e.evidence_id}]`).join("\n");
  const hasSources =
    r.evidence.length > 0 ||
    r.warnings.length > 0 ||
    r.version_status.length > 0 ||
    r.extracted_facts.length > 0 ||
    r.assumptions.length > 0 ||
    r.rejected_evidence.length > 0 ||
    (r.direct_answer?.quotes.length ?? 0) > 0;

  return (
    <article className="min-w-0 space-y-4 text-[0.9375rem] leading-relaxed" aria-label={t("ask.answerLabel")}>
      {hasExplanation ? <Markdown text={text} /> : <LinkedText text={text} />}

      {!hasExplanation && r.follow_up_question ? <p className="font-semibold">{r.follow_up_question}</p> : null}

      {!hasExplanation && r.status === "not_established" ? (
        <p className="text-sm text-ink-soft">{t("ask.noSupportingText")}</p>
      ) : null}

      {general ? <p className="text-sm italic text-ink-soft">{t("askx.chatGeneral")}</p> : null}

      {r.explanation_citations.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {r.explanation_citations.map((c) => (
            <EvidenceIdChip key={c} evidenceId={c} />
          ))}
        </div>
      ) : null}

      <MissingInfoPanel info={r.missing_information} />
      {r.calculations.map((c) => (
        <CalculationTrace key={c.calculation_id} trace={c} />
      ))}

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-ink-soft">
        <StatusBadge status={r.status} />
        <CopyButton text={text} label={t("ask.copyAnswer")} compact />
        <button type="button" className={btnLink} onClick={() => onReport()}>
          {t("ask.reportProblem")}
        </button>
      </div>
      {hasExplanation && !general ? <p className="text-xs text-ink-soft">{t("askx.chatAiNote")}</p> : null}

      {hasSources ? (
        <details className="group border-t border-line pt-2">
          <summary className="flex min-h-tap cursor-pointer list-none items-center gap-2 text-sm font-semibold text-ink-soft [&::-webkit-details-marker]:hidden">
            <ChevronDown aria-hidden="true" className="h-4 w-4 transition-transform group-open:rotate-180" />
            {t("askx.chatSources")}
            {r.evidence.length > 0 ? ` (${r.evidence.length})` : ""}
          </summary>
          <div className="space-y-4 pt-3">
            {r.direct_answer && r.direct_answer.quotes.length > 0
              ? r.direct_answer.quotes.map((q) => (
                  <figure key={`${q.rule_number}-${q.text.slice(0, 40)}`} className="space-y-1">
                    <figcaption className="text-sm font-semibold">
                      Rule {q.rule_number} — {q.rule_title} · PDF p.
                      {q.page_start === q.page_end ? q.page_start : `${q.page_start}–${q.page_end}`}
                    </figcaption>
                    <blockquote className="whitespace-pre-wrap rounded-lg bg-surface-sunken p-3 font-mono text-xs leading-relaxed">
                      {q.text}
                    </blockquote>
                  </figure>
                ))
              : null}
            {r.evidence.length > 0 ? (
              <>
                <EvidenceList items={shown} terms={terms} onReport={(id) => onReport(id)} />
                {!allEvidence && r.evidence.length > FIRST_N ? (
                  <button type="button" className={btn} onClick={() => setAllEvidence(true)}>
                    {t("askx.showMore", { n: r.evidence.length - FIRST_N })}
                  </button>
                ) : null}
                <CopyButton text={citations} label={t("ask.copyCitations")} compact />
              </>
            ) : null}
            <WarningsList warnings={r.warnings} />
            <VersionPanel items={r.version_status} />
            <ExtractedFactsTable facts={r.extracted_facts} />
            {r.assumptions.length > 0 ? (
              <ul className="list-disc pl-5 text-sm">
                {r.assumptions.map((a) => (
                  <li key={a}>{a}</li>
                ))}
              </ul>
            ) : null}
            <RejectedEvidence items={r.rejected_evidence} />
          </div>
        </details>
      ) : null}
    </article>
  );
}
