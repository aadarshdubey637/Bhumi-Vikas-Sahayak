import { useTranslation } from "react-i18next";
import type { ExtractedFact } from "@/api/types";
import { humanize } from "@/lib/format";

const SRC: Record<ExtractedFact["source"], string> = {
  user_provided: "facts.source.user_provided",
  document_derived: "facts.source.document_derived",
  system_calculated: "facts.source.system_calculated",
};

export function ExtractedFactsTable({ facts }: { facts: ExtractedFact[] }) {
  const { t } = useTranslation();
  if (facts.length === 0) return null;
  return (
    <section aria-label={t("facts.title")}>
      <h4 className="text-sm font-semibold">{t("facts.title")}</h4>
      <p className="text-xs text-ink-soft">{t("facts.caveat")}</p>
      {/* table on >= 640px, card list below */}
      <table className="mt-2 hidden w-full text-sm sm:table">
        <thead>
          <tr className="text-left text-xs text-ink-soft">
            <th className="py-1 pr-2">{t("facts.name")}</th>
            <th className="py-1 pr-2">{t("facts.value")}</th>
            <th className="py-1 pr-2">{t("facts.sourceCol")}</th>
            <th className="py-1 pr-2">{t("facts.originCol")}</th>
            <th className="py-1 pr-2">{t("facts.validation")}</th>
            <th className="py-1">{t("facts.confidence")}</th>
          </tr>
        </thead>
        <tbody>
          {facts.map((f, i) => (
            <tr key={`${f.name}-${i}`} className="border-t border-line align-top">
              <td className="py-1 pr-2">{humanize(f.name)}</td>
              <td className="py-1 pr-2 tabular">
                {f.value} {f.unit ?? ""}
                {f.note ? <div className="text-xs text-ink-faint">{f.note}</div> : null}
              </td>
              <td className="py-1 pr-2">{t(SRC[f.source], { defaultValue: f.source })}</td>
              <td className="py-1 pr-2">{t(`facts.origin.${f.origin}`, { defaultValue: f.origin })}</td>
              <td className="py-1 pr-2">
                {t(`facts.valid.${f.validation_status}`, { defaultValue: f.validation_status })}
              </td>
              <td className="py-1">{f.confidence}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <ul className="mt-2 space-y-2 sm:hidden">
        {facts.map((f, i) => (
          <li key={`${f.name}-${i}`} className="rounded border border-line p-2 text-sm">
            <p className="font-semibold">
              {humanize(f.name)}:{" "}
              <span className="tabular font-normal">
                {f.value} {f.unit ?? ""}
              </span>
            </p>
            <p className="text-xs text-ink-soft">
              {t(SRC[f.source], { defaultValue: f.source })} ·{" "}
              {t(`facts.origin.${f.origin}`, { defaultValue: f.origin })} ·{" "}
              {t(`facts.valid.${f.validation_status}`, { defaultValue: f.validation_status })} ·{" "}
              {f.confidence}
            </p>
            {f.note ? <p className="text-xs text-ink-faint">{f.note}</p> : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
