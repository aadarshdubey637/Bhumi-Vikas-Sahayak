import { useTranslation } from "react-i18next";

/** Inline disclaimer for pages where it must be visible next to results (Ask, Plot check, Assessment, Report, Calculator). */
export function InlineDisclaimer() {
  const { t } = useTranslation();
  return (
    <p role="note" className="rounded-xl border border-pending-line bg-pending-tint px-3.5 py-2.5 text-sm text-ink">
      {t("disclaimer")}
    </p>
  );
}
