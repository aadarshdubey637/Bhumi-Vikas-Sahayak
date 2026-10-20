import { useTranslation } from "react-i18next";
import { CopyButton } from "./CopyButton";

export function RequestIdTag({ requestId }: { requestId: string | null | undefined }) {
  const { t } = useTranslation();
  if (!requestId) return null;
  return (
    <span className="inline-flex flex-wrap items-center gap-1 text-xs text-ink-faint">
      {t("common.requestId")}: <code className="font-mono">{requestId}</code>
      <CopyButton text={requestId} compact />
    </span>
  );
}
