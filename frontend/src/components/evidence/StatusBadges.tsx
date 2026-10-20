import { useTranslation } from "react-i18next";
import { Badge } from "@/components/common/Badge";
import {
  ANSWER_VIEW,
  CHECK_VIEW,
  OVERALL_VIEW,
  VERIFICATION_VIEW,
  VERSION_VIEW,
  viewFor,
} from "@/lib/status";

export function StatusBadge({ status }: { status: string }) {
  const { t } = useTranslation();
  const v = viewFor(ANSWER_VIEW, status);
  return (
    <Badge tone={v.tone} icon={v.icon}>
      {t(`status.answer.${status}`, { defaultValue: status })}
    </Badge>
  );
}

export function CheckStatusBadge({ status }: { status: string }) {
  const { t } = useTranslation();
  const v = viewFor(CHECK_VIEW, status);
  return (
    <Badge tone={v.tone} icon={v.icon}>
      {t(`status.check.${status}`, { defaultValue: status })}
    </Badge>
  );
}

export function OverallStatusBadge({ status }: { status: string }) {
  const { t } = useTranslation();
  const v = viewFor(OVERALL_VIEW, status);
  return (
    <Badge tone={v.tone} icon={v.icon}>
      {t(`status.overall.${status}`, { defaultValue: status })}
    </Badge>
  );
}

export function VerificationBadge({ status }: { status: string }) {
  const { t } = useTranslation();
  const v = viewFor(VERIFICATION_VIEW, status);
  return (
    <Badge
      tone={v.tone}
      icon={v.icon}
      outline={status === "unverified"}
      title={status === "unverified" ? t("status.unverifiedHelp") : undefined}
    >
      {t(`status.verification.${status}`, { defaultValue: status })}
    </Badge>
  );
}

export function VersionStatusBadge({ status }: { status: string }) {
  const { t } = useTranslation();
  const v = viewFor(VERSION_VIEW, status);
  return (
    <Badge tone={v.tone} icon={v.icon}>
      {t(`status.version.${status}`, { defaultValue: status })}
    </Badge>
  );
}
