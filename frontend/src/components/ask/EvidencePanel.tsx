import { FileText, Info, Scale, TriangleAlert } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import type { AskResponse } from "@/api/types";
import { CitationChip } from "@/components/evidence/CitationChip";
import { VerificationBadge } from "@/components/evidence/StatusBadges";
import { ruleHref } from "@/lib/rule-number";
import { btnLink } from "@/lib/ui";

/** Desktop side panel: the rules and pages behind the LATEST answer, at a glance. Everything here comes from the response. */
export function EvidencePanel({ response }: { response?: AskResponse }) {
  const { t } = useTranslation();
  return (
    <aside aria-label={t("askx.panelTitle")} className="sticky top-20 max-h-[calc(100vh-6rem)] overflow-y-auto">
      <div className="glass rounded-2xl p-4">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <Scale aria-hidden="true" className="h-4 w-4 text-brand" />
          {t("askx.panelTitle")}
        </h2>
        {response ? (
          <div className="mt-3 space-y-3">
            {response.evidence.length === 0 ? (
              <p className="rounded-lg border border-muted-line bg-muted-tint p-3 text-sm">{t("askx.noEvidence")}</p>
            ) : (
              <ul className="space-y-3">
                {response.evidence.map((e) => (
                  <li key={e.evidence_id} className="rounded-lg border border-line bg-surface-page p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <CitationChip evidence={e} />
                      <VerificationBadge status={e.verification_status} />
                    </div>
                    <p className="mt-2 text-sm font-semibold leading-snug">{e.rule_title}</p>
                    {e.table_like ? (
                      <p className="mt-1 flex items-start gap-1.5 text-xs text-pending">
                        <TriangleAlert aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                        {t("askx.tableWarn")}
                      </p>
                    ) : null}
                    <Link to={ruleHref(e.rule_number)} className={`${btnLink} !min-h-0 pt-1 text-xs`}>
                      {t("askx.openRule")}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : (
          <p className="mt-3 text-sm text-ink-soft">{t("askx.panelEmpty")}</p>
        )}
      </div>

      <div className="mt-4 glass rounded-2xl p-4 text-sm">
        <h3 className="font-semibold">{t("askx.legendTitle")}</h3>
        <ul className="mt-2 space-y-2 text-xs text-ink-soft">
          <li className="flex items-start gap-2">
            <Info aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0 text-info" />
            {t("askx.legendExplain")}
          </li>
          <li className="flex items-start gap-2">
            <Scale aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0 text-verified" />
            {t("askx.legendRule")}
          </li>
          <li className="flex items-start gap-2">
            <FileText aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0 text-brand" />
            {t("askx.legendPage")}
          </li>
          <li className="flex items-start gap-2">
            <TriangleAlert aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0 text-pending" />
            {t("askx.legendUncertain")}
          </li>
        </ul>
      </div>
    </aside>
  );
}
