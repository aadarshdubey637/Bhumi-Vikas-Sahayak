import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

export function LoadingSkeleton({ lines = 3, label }: { lines?: number; label?: string }) {
  const { t } = useTranslation();
  return (
    <div role="status" aria-live="polite" aria-busy="true" className="space-y-2">
      <span className="sr-only">{label ?? t("common.loading")}</span>
      {Array.from({ length: lines }, (_, i) => (
        <div
          key={i}
          className="h-4 animate-pulse rounded-full bg-gradient-to-r from-surface-sunken via-white to-surface-sunken"
          style={{ width: `${90 - i * 12}%` }}
        />
      ))}
    </div>
  );
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="glass rounded-2xl border-dashed border-line-strong p-8 text-center">
      <p className="font-semibold text-ink">{title}</p>
      {children ? <div className="mt-2 text-sm text-ink-soft">{children}</div> : null}
    </div>
  );
}

export function InfoBox({
  tone = "info",
  children,
}: {
  tone?: "info" | "pending" | "muted" | "danger";
  children: ReactNode;
}) {
  const cls = {
    info: "border-info-line bg-info-tint text-ink",
    pending: "border-pending-line bg-pending-tint text-ink",
    muted: "border-muted-line bg-muted-tint text-ink",
    danger: "border-danger-line bg-danger-tint text-ink",
  }[tone];
  return (
    <div role="note" className={`rounded-xl border p-3.5 text-sm ${cls}`}>
      {children}
    </div>
  );
}
