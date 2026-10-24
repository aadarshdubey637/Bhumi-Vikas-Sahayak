import { useTranslation } from "react-i18next";
import type { AssumedKey } from "@/lib/autofill";
import { fmtNum, type ParsedWb } from "@/lib/workbench";

const ORDER = ["plot_width", "plot_length", "plot_area", "road_width", "floors", "building_height", "built_up_area", "building_use"] as const;

/**
 * "What I understood": the numbers taken from the user's own words (or typed by hand), and, separately, what the 3D sketch had to
 * assume to be drawn. Assumptions are never mixed in with the user's values.
 */
export function UnderstoodPanel({ parsed, assumed }: { parsed: ParsedWb; assumed: AssumedKey[] }) {
  const { t } = useTranslation();
  const rows = ORDER.flatMap((name) => {
    const v = parsed.inputs[name];
    if (v === undefined) return [];
    const text = typeof v === "string" ? v : `${fmtNum(Number(v.value), 2)}${v.unit === "count" ? "" : ` ${t(`units.${v.unit}`, { defaultValue: v.unit })}`}`;
    return [{ name, text }];
  });
  return (
    <section aria-label={t("wb.auto.understood")} className="space-y-2.5">
      <h2 className="text-base font-semibold">{t("wb.auto.understood")}</h2>
      {rows.length === 0 ? (
        <p className="text-sm text-ink-soft">{t("wb.auto.none")}</p>
      ) : (
        <dl className="divide-y divide-line rounded-xl border border-line bg-surface">
          {rows.map((r) => (
            <div key={r.name} className="flex items-baseline justify-between gap-3 px-3 py-2 text-sm">
              <dt className="text-ink-soft">{t(`plain.d.${r.name}`, { defaultValue: r.name })}</dt>
              <dd className="font-semibold">{r.text}</dd>
            </div>
          ))}
        </dl>
      )}
      {assumed.length > 0 ? (
        <p className="rounded-xl bg-pending-tint px-3 py-2 text-xs leading-relaxed text-pending">
          {t("wb.auto.assumed")} {assumed.map((k) => t(`wb.auto.k.${k}`)).join(", ")}.
        </p>
      ) : null}
    </section>
  );
}
