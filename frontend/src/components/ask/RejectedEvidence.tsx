import { useTranslation } from "react-i18next";
import type { RejectedEvidence as Rej } from "@/api/types";

export function RejectedEvidence({ items }: { items: Rej[] }) {
  const { t } = useTranslation();
  if (items.length === 0) return null;
  return (
    <details className="glass rounded-xl p-3">
      <summary className="min-h-tap cursor-pointer text-sm font-semibold">
        {t("rejected.title", { count: items.length })}
      </summary>
      <ul className="mt-2 space-y-1 text-sm">
        {items.map((r) => (
          <li key={r.evidence_id}>
            <code className="font-mono text-xs">{r.evidence_id}</code> — {r.reason}
          </li>
        ))}
      </ul>
    </details>
  );
}
