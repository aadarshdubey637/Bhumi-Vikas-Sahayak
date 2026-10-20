import { useTranslation } from "react-i18next";
import type { Evidence } from "@/api/types";
import { pageInfo } from "@/lib/format";
import { useEvidenceDrawer } from "./EvidenceDrawerContext";

/** "Rule 21 · p.35" — opens the evidence drawer. */
export function CitationChip({
  evidence,
}: {
  evidence: Pick<
    Evidence,
    "evidence_id" | "rule_number" | "page_start" | "page_end" | "page_precision" | "verification_status"
  >;
}) {
  const { t } = useTranslation();
  const { open } = useEvidenceDrawer();
  const pg = pageInfo(evidence);
  return (
    <button
      type="button"
      onClick={() => open(evidence.evidence_id)}
      className="inline-flex min-h-tap items-center gap-1 rounded-full border border-line-strong bg-surface px-3 text-xs font-semibold text-brand hover:bg-brand-tint"
    >
      <span
        aria-hidden="true"
        className={`h-2 w-2 rounded-full ${evidence.verification_status === "verified" ? "bg-verified" : "bg-pending"}`}
      />
      {t("evidence.chip", { rule: evidence.rule_number })}
      {pg.pages ? ` · ${t("evidence.pageShort", { pages: pg.pages })}` : ""}
    </button>
  );
}

/** Chip for a bare evidence id (e.g. explanation_citations). */
export function EvidenceIdChip({ evidenceId }: { evidenceId: string }) {
  const { open } = useEvidenceDrawer();
  return (
    <button
      type="button"
      onClick={() => open(evidenceId)}
      className="inline-flex min-h-tap items-center rounded-full border border-line-strong bg-surface px-3 font-mono text-xs text-brand hover:bg-brand-tint"
    >
      {evidenceId}
    </button>
  );
}
