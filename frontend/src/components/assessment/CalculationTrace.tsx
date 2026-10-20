import { useTranslation } from "react-i18next";
import type { CalculationTrace as Trace } from "@/api/types";
import { CopyButton } from "@/components/common/CopyButton";
import { Badge } from "@/components/common/Badge";
import { formatValue, humanize } from "@/lib/format";

function verificationView(v: string): { tone: "verified" | "pending" | "muted"; key: string } {
  if (v === "not_applicable_general_arithmetic") return { tone: "muted", key: "calc.generalArithmetic" };
  if (v.startsWith("verified")) return { tone: "verified", key: "calc.verified" };
  return { tone: "pending", key: "calc.notVerified" };
}

export function CalculationTrace({ trace }: { trace: Trace }) {
  const { t } = useTranslation();
  const vv = verificationView(trace.verification_status);
  const invalid = trace.validation_status === "invalid";
  return (
    <section
      aria-label={t("calc.title")}
      className={`rounded-2xl border p-5 ${invalid ? "border-danger-line bg-danger-tint" : "glass"}`}
    >
      <div className="flex flex-wrap items-center gap-2">
        <Badge
          tone={vv.tone}
          icon={vv.tone === "verified" ? "check" : vv.tone === "pending" ? "flag" : "info"}
        >
          {t(vv.key)}
        </Badge>
        {invalid ? (
          <Badge tone="danger" icon="x">
            {t("calc.invalid")}
          </Badge>
        ) : null}
      </div>
      <p className="mt-3 rounded-xl bg-gradient-to-br from-brand-tint to-white px-4 py-3 text-4xl font-semibold tabular text-navy" aria-live="polite">
        {trace.final_value ?? "—"}{" "}
        <span className="text-lg font-normal text-ink-soft">{trace.output_unit ?? ""}</span>
      </p>
      <dl className="mt-3 grid grid-cols-[auto,1fr] gap-x-4 gap-y-1 text-sm">
        <dt className="text-ink-soft">{t("calc.type")}</dt>
        <dd>{humanize(trace.calculation_type)}</dd>
        <dt className="text-ink-soft">{t("calc.formula")}</dt>
        <dd className="font-mono text-xs">{trace.formula_id}</dd>
        <dt className="text-ink-soft">{t("calc.formulaSource")}</dt>
        <dd>{trace.formula_source}</dd>
        <dt className="text-ink-soft">{t("calc.ruleReference")}</dt>
        <dd>{trace.rule_reference ?? t("calc.noRule")}</dd>
        <dt className="text-ink-soft">{t("calc.rounding")}</dt>
        <dd>
          {t(`calc.roundingPolicy.${trace.rounding_policy}`, {
            defaultValue: humanize(trace.rounding_policy),
          })}
        </dd>
      </dl>
      <h4 className="mt-4 text-sm font-semibold">{t("calc.inputs")}</h4>
      <table className="mt-1 w-full text-sm">
        <tbody>
          {Object.entries(trace.inputs).map(([k, v]) => (
            <tr key={k} className="border-t border-line">
              <th scope="row" className="py-1 pr-3 text-left font-normal text-ink-soft">
                {humanize(k)}
              </th>
              <td className="py-1 tabular">{formatValue(v)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {Object.keys(trace.intermediate).length > 0 ? (
        <>
          <h4 className="mt-4 text-sm font-semibold">{t("calc.steps")}</h4>
          <ol className="mt-1 list-decimal space-y-0.5 pl-5 text-sm tabular">
            {Object.entries(trace.intermediate).map(([k, v]) => (
              <li key={k}>
                <span className="text-ink-soft">{humanize(k)}:</span> {v}
              </li>
            ))}
          </ol>
        </>
      ) : null}
      {trace.assumptions.length > 0 ? (
        <>
          <h4 className="mt-4 text-sm font-semibold">{t("common.assumptions")}</h4>
          <ul className="list-disc pl-5 text-sm">
            {trace.assumptions.map((a) => (
              <li key={a}>{a}</li>
            ))}
          </ul>
        </>
      ) : null}
      {trace.warnings.length > 0 ? (
        <ul className="mt-4 space-y-1 text-sm text-pending">
          {trace.warnings.map((w) => (
            <li key={w}>⚑ {w}</li>
          ))}
        </ul>
      ) : null}
      <p className="mt-3 flex flex-wrap items-center gap-1 text-xs text-ink-faint">
        {t("calc.id")}: <code className="font-mono">{trace.calculation_id}</code>
        <CopyButton text={trace.calculation_id} compact />
      </p>
    </section>
  );
}
