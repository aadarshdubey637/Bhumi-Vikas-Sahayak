import { useTranslation } from "react-i18next";
import { btn } from "@/lib/ui";

export function Pagination({
  total,
  limit,
  offset,
  onChange,
}: {
  total: number;
  limit: number;
  offset: number;
  onChange: (offset: number) => void;
}) {
  const { t } = useTranslation();
  if (total <= limit && offset === 0) return null;
  const from = total === 0 ? 0 : offset + 1;
  const to = Math.min(offset + limit, total);
  return (
    <nav
      aria-label={t("common.pagination")}
      className="flex flex-wrap items-center justify-between gap-2 pt-2"
    >
      <p className="text-sm text-ink-soft tabular">{t("common.showing", { from, to, total })}</p>
      <div className="flex gap-2">
        <button
          type="button"
          className={btn}
          disabled={offset <= 0}
          onClick={() => onChange(Math.max(0, offset - limit))}
        >
          {t("common.previous")}
        </button>
        <button
          type="button"
          className={btn}
          disabled={offset + limit >= total}
          onClick={() => onChange(offset + limit)}
        >
          {t("common.next")}
        </button>
      </div>
    </nav>
  );
}
