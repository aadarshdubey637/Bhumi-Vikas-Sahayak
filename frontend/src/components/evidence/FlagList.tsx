import { useTranslation } from "react-i18next";
import { Flag } from "lucide-react";

export function FlagList({ flags, tableLike }: { flags: string[]; tableLike?: boolean }) {
  const { t } = useTranslation();
  const hasTable = tableLike || flags.includes("table_like_content_unverified");
  const others = flags.filter((f) => f !== "table_like_content_unverified");
  if (!hasTable && others.length === 0) return null;
  return (
    <ul className="space-y-1 text-xs text-pending">
      {hasTable ? (
        <li className="flex items-start gap-1">
          <Flag aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {t("evidence.tableWarning")}
        </li>
      ) : null}
      {others.map((f) => (
        <li key={f} className="flex items-start gap-1">
          <Flag aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {t(`flags.${f}`, { defaultValue: f.replace(/_/g, " ") })}
        </li>
      ))}
    </ul>
  );
}
