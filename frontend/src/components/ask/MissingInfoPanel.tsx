import { useTranslation } from "react-i18next";
import type { MissingInformation } from "@/api/types";
import { InfoBox } from "@/components/common/States";
import { isMissingInformation, humanize } from "@/lib/format";

function Chips({ items, cls }: { items: string[]; cls: string }) {
  return (
    <ul className="flex flex-wrap gap-1.5">
      {items.map((i) => (
        <li key={i} className={`rounded-full border px-2.5 py-0.5 text-xs ${cls}`}>
          {humanize(i)}
        </li>
      ))}
    </ul>
  );
}

/** `missing_information` may be `{}`; that renders nothing. */
export function MissingInfoPanel({ info }: { info: MissingInformation | Record<string, never> }) {
  const { t } = useTranslation();
  if (!isMissingInformation(info)) return null;
  const hasAny = info.missing_facts.length + info.invalid_facts.length + info.unverified_facts.length > 0;
  if (info.prerequisites_established && !hasAny && !info.reason && !info.clarifying_question) return null;
  return (
    <section aria-label={t("missing.title")} className="space-y-2">
      {!info.prerequisites_established && info.reason ? (
        <InfoBox tone="info">
          <p className="font-semibold">{t("missing.whyNoValue")}</p>
          <p className="mt-1 whitespace-pre-wrap">{info.reason}</p>
        </InfoBox>
      ) : null}
      {info.missing_facts.length > 0 ? (
        <div>
          <h4 className="text-sm font-semibold">{t("missing.missing")}</h4>
          <Chips items={info.missing_facts} cls="border-line-strong bg-surface" />
        </div>
      ) : null}
      {info.invalid_facts.length > 0 ? (
        <div>
          <h4 className="text-sm font-semibold">{t("missing.invalid")}</h4>
          <Chips items={info.invalid_facts} cls="border-danger-line bg-danger-tint text-danger" />
        </div>
      ) : null}
      {info.unverified_facts.length > 0 ? (
        <div>
          <h4 className="text-sm font-semibold">{t("missing.unverified")}</h4>
          <Chips items={info.unverified_facts} cls="border-pending-line bg-pending-tint text-pending" />
        </div>
      ) : null}
      {info.clarifying_question ? (
        <div className="rounded border-2 border-brand bg-brand-tint p-3 text-sm font-semibold">
          {info.clarifying_question}
        </div>
      ) : null}
    </section>
  );
}
