import { AlertTriangle } from "lucide-react";
import { useTranslation } from "react-i18next";
import { isApiError } from "@/api/errors";
import { btn } from "@/lib/ui";
import { errorKey } from "./errorKey";
import { RequestIdTag } from "./RequestIdTag";

export function ErrorState({
  error,
  onRetry,
  className = "",
}: {
  error: unknown;
  onRetry?: () => void;
  className?: string;
}) {
  const { t } = useTranslation();
  const api = isApiError(error) ? error : null;
  return (
    <div role="alert" className={`rounded-xl border border-danger-line bg-danger-tint p-4 ${className}`}>
      <p className="flex items-start gap-2 font-semibold text-danger">
        <AlertTriangle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
        <span>{t(errorKey(error))}</span>
      </p>
      {api && api.message && api.code !== "network_error" ? (
        <p className="mt-1 text-sm text-ink-soft">{api.message}</p>
      ) : null}
      {api?.code === "network_error" ? (
        <p className="mt-1 text-sm text-ink-soft">{t("errors.corsHint")}</p>
      ) : null}
      <div className="mt-2 flex flex-wrap items-center gap-3">
        {onRetry ? (
          <button type="button" className={btn} onClick={onRetry}>
            {t("common.retry")}
          </button>
        ) : null}
        <RequestIdTag requestId={api?.requestId} />
      </div>
    </div>
  );
}
