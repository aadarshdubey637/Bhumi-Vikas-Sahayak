import { useTranslation } from "react-i18next";
import { InlineDisclaimer } from "@/components/common/Disclaimer";
import { OverallStatusBadge } from "@/components/evidence/StatusBadges";
import { WarningsList } from "@/components/ask/WarningsList";
import type { OverallStatus } from "@/api/types";
import { CheckGroups } from "./CheckCard";
import type { AssessmentCheck } from "@/api/types";

interface Shape {
  overall_status: OverallStatus;
  summary: string;
  checks: AssessmentCheck[];
  assumptions: string[];
  missing_information: string[];
  warnings: string[];
}

export function AssessmentSummary({ data }: { data: Shape }) {
  const { t } = useTranslation();
  return (
    <div className="space-y-4">
      <div className="glass rounded-xl p-4">
        <OverallStatusBadge status={data.overall_status} />
        <p className="mt-2 text-sm">{data.summary}</p>
        <div className="mt-2">
          <InlineDisclaimer />
        </div>
      </div>
      <CheckGroups checks={data.checks} />
      {data.missing_information.length > 0 ? (
        <section>
          <h3 className="text-sm font-semibold">{t("assessment.missing")}</h3>
          <ul className="list-disc pl-5 text-sm">
            {data.missing_information.map((m) => (
              <li key={m}>{m}</li>
            ))}
          </ul>
        </section>
      ) : null}
      {data.assumptions.length > 0 ? (
        <section>
          <h3 className="text-sm font-semibold">{t("common.assumptions")}</h3>
          <ul className="list-disc pl-5 text-sm">
            {data.assumptions.map((m) => (
              <li key={m}>{m}</li>
            ))}
          </ul>
        </section>
      ) : null}
      <WarningsList warnings={data.warnings} />
    </div>
  );
}
