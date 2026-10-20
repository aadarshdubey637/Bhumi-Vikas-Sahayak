import { useState } from "react";
import { useTranslation } from "react-i18next";
import { btnLink } from "@/lib/ui";

const COLLAPSE_AFTER = 3;

export function WarningsList({ warnings }: { warnings: string[] }) {
  const { t } = useTranslation();
  const [all, setAll] = useState(false);
  if (warnings.length === 0) return null;
  const shown = all ? warnings : warnings.slice(0, COLLAPSE_AFTER);
  return (
    <section
      aria-label={t("warnings.title")}
      className="rounded border border-pending-line bg-pending-tint p-3"
    >
      <h4 className="text-sm font-semibold text-pending">{t("warnings.title")}</h4>
      <ul className="mt-1 list-disc space-y-1 pl-5 text-sm">
        {shown.map((w, i) => (
          <li key={`${i}-${w}`} className="whitespace-pre-wrap break-words">
            {w}
          </li>
        ))}
      </ul>
      {warnings.length > COLLAPSE_AFTER ? (
        <button type="button" className={btnLink} aria-expanded={all} onClick={() => setAll((v) => !v)}>
          {all ? t("warnings.showFewer") : t("warnings.showAll", { count: warnings.length })}
        </button>
      ) : null}
    </section>
  );
}
