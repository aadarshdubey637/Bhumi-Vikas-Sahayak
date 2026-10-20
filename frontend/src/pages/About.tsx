import { useTranslation } from "react-i18next";
import { PageHeader } from "@/components/common/PageHeader";
import {
  StatusBadge,
  CheckStatusBadge,
  VerificationBadge,
  VersionStatusBadge,
} from "@/components/evidence/StatusBadges";
import { card } from "@/lib/ui";
import { SAMPLE_QUESTIONS } from "@/lib/samples";

const ANSWER = [
  "supported",
  "conditional",
  "pending_verification",
  "insufficient_information",
  "source_conflict",
  "not_established",
] as const;
const CHECK = ["passed", "failed", "conditional", "pending_verification", "not_evaluated"] as const;
const VERIF = ["unverified", "pending_verification", "verified", "rejected"] as const;
const VERSION = [
  "verified_current",
  "historical",
  "pending_verification",
  "unknown_effective_date",
  "insufficient_information",
  "source_conflict",
] as const;

export default function About() {
  const { t } = useTranslation();
  return (
    <>
      <PageHeader title={t("about.title")} />
      <div className="space-y-4">
        <section className={card}>
          <h2 className="font-semibold">{t("about.purposeTitle")}</h2>
          <p className="mt-1 text-sm">{t("about.purpose")}</p>
        </section>
        <section className={card}>
          <h2 className="font-semibold">{t("about.limitsTitle")}</h2>
          <ul className="mt-1 list-disc space-y-1 pl-5 text-sm">
            {(["l1", "l2", "l3", "l4", "l5", "l6"] as const).map((k) => (
              <li key={k}>{t(`about.limits.${k}`)}</li>
            ))}
          </ul>
        </section>
        <section className={card}>
          <h2 className="font-semibold">{t("about.statusTitle")}</h2>
          <ul className="mt-2 space-y-2 text-sm">
            {ANSWER.map((s) => (
              <li key={s} className="flex flex-wrap items-center gap-2">
                <StatusBadge status={s} /> <span>{t(`status.answerHelp.${s}`)}</span>
              </li>
            ))}
            {CHECK.map((s) => (
              <li key={s}>
                <CheckStatusBadge status={s} />
              </li>
            ))}
            {VERIF.map((s) => (
              <li key={s}>
                <VerificationBadge status={s} />
              </li>
            ))}
            {VERSION.map((s) => (
              <li key={s}>
                <VersionStatusBadge status={s} />
              </li>
            ))}
          </ul>
        </section>
        <section className={card}>
          <h2 className="font-semibold">{t("about.samplesTitle")}</h2>
          <ul className="mt-1 list-disc pl-5 text-sm">
            {SAMPLE_QUESTIONS.map((q) => (
              <li key={q}>{q}</li>
            ))}
          </ul>
        </section>
        <section className={card}>
          <h2 className="font-semibold">{t("about.privacyTitle")}</h2>
          <p className="mt-1 text-sm">{t("about.privacy")}</p>
        </section>
      </div>
    </>
  );
}
