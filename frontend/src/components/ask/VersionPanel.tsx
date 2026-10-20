import { useTranslation } from "react-i18next";
import type { LinkedAmendment, VersionResolution } from "@/api/types";
import { VersionStatusBadge } from "@/components/evidence/StatusBadges";
import { formatDate } from "@/lib/format";
import { VerificationBadge } from "@/components/evidence/StatusBadges";

export function AmendmentList({ items }: { items: LinkedAmendment[] }) {
  const { t, i18n } = useTranslation();
  if (items.length === 0) return null;
  return (
    <ul className="space-y-2">
      {items.map((a) => (
        <li key={a.amendment_id} className="rounded border border-pending-line bg-pending-tint p-3 text-sm">
          <p className="font-semibold">
            {a.title} <span className="font-mono text-xs font-normal">({a.amendment_id})</span>
          </p>
          <p className="mt-1 flex flex-wrap items-center gap-2">
            <VerificationBadge status={a.verification_status} />
            <span>
              {t("version.effectiveDate")}:{" "}
              {a.effective_date ? formatDate(a.effective_date, i18n.language) : t("version.effectiveUnknown")}
            </span>
            {a.stated_date ? (
              <span>
                {t("version.statedDate")}: {a.stated_date}
              </span>
            ) : null}
          </p>
          {a.effective_date === null ? <p className="mt-1 text-xs">{t("version.pendingAmendment")}</p> : null}
        </li>
      ))}
    </ul>
  );
}

export function VersionPanel({ items }: { items: VersionResolution[] }) {
  const { t, i18n } = useTranslation();
  if (items.length === 0) return null;
  return (
    <section aria-label={t("version.title")} className="space-y-3">
      <h4 className="text-sm font-semibold">{t("version.title")}</h4>
      {items.map((v) => (
        <VersionResolutionView key={v.rule_key + v.status} v={v} lang={i18n.language} />
      ))}
    </section>
  );
}

export function VersionResolutionView({ v, lang }: { v: VersionResolution; lang?: string }) {
  const { t } = useTranslation();
  return (
    <div className="glass rounded-xl p-3 text-sm">
      <p className="flex flex-wrap items-center gap-2">
        <span className="font-semibold">{t("version.rule", { rule: v.rule_key })}</span>
        <VersionStatusBadge status={v.status} />
      </p>
      {v.reasons.length > 0 ? (
        <ul className="mt-2 list-disc pl-5">
          {v.reasons.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
      ) : null}
      {v.status === "source_conflict" ? (
        <p className="mt-2 font-semibold text-danger">{t("version.consultGazette")}</p>
      ) : null}
      <p className="mt-2 text-xs text-ink-soft">
        {v.as_of ? `${t("version.asOf")}: ${formatDate(v.as_of, lang)} · ` : ""}
        {v.corpus_consolidated_to
          ? t("version.consolidated", { date: formatDate(v.corpus_consolidated_to, lang) })
          : ""}
      </p>
      {v.version_ids.length > 0 ? (
        <p className="mt-1 break-all font-mono text-xs text-ink-faint">{v.version_ids.join(", ")}</p>
      ) : null}
      <div className="mt-2">
        <AmendmentList items={v.linked_amendments} />
      </div>
    </div>
  );
}
