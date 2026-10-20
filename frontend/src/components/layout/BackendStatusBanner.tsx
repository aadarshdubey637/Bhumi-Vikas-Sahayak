import { useTranslation } from "react-i18next";
import { InfoBox } from "@/components/common/States";
import type { BackendState } from "@/hooks/useBackendReadiness";
import { btn } from "@/lib/ui";
import type { ReadyOut } from "@/api/types";

export function BackendStatusBanner({
  state,
  ready,
  onRetry,
}: {
  state: BackendState;
  ready: ReadyOut | undefined;
  onRetry: () => void;
}) {
  const { t } = useTranslation();
  if (state === "ok") return null;
  return (
    <div className="mx-auto w-full max-w-6xl px-3 pt-3 sm:px-6 print:hidden" aria-live="polite">
      {state === "warming" ? <InfoBox tone="info">{t("backend.warming")}</InfoBox> : null}
      {state === "unreachable" ? (
        <InfoBox tone="danger">
          <p className="font-semibold">{t("backend.unreachable")}</p>
          <p className="mt-1">{t("errors.corsHint")}</p>
          <button type="button" className={`${btn} mt-2`} onClick={onRetry}>
            {t("common.retry")}
          </button>
        </InfoBox>
      ) : null}
      {state === "not_ready" ? (
        <InfoBox tone="pending">
          <p className="font-semibold">{t("backend.notReady")}</p>
          {ready?.notes.length ? (
            <ul className="mt-1 list-disc pl-5">
              {ready.notes.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
          ) : null}
        </InfoBox>
      ) : null}
      {state === "no_rules" ? (
        <div
          role="alert"
          className="rounded border-2 border-pending bg-pending-tint p-3 text-sm font-semibold text-ink"
        >
          {t("backend.noRules")}
        </div>
      ) : null}
    </div>
  );
}
