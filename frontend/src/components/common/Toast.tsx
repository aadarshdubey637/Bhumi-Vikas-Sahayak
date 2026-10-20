import { CheckCircle2, X } from "lucide-react";
import { useCallback, useMemo, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { ToastContext } from "./toastContext";

interface ToastItem {
  id: number;
  message: string;
}

const LIFETIME_MS = 3500;

export function ToastProvider({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const [items, setItems] = useState<ToastItem[]>([]);
  const nextId = useRef(1);
  const dismiss = useCallback((id: number) => setItems((xs) => xs.filter((x) => x.id !== id)), []);
  const success = useCallback(
    (message: string) => {
      const id = nextId.current++;
      setItems((xs) => [...xs.slice(-2), { id, message }]);
      window.setTimeout(() => dismiss(id), LIFETIME_MS);
    },
    [dismiss],
  );
  const api = useMemo(() => ({ success }), [success]);
  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        role="status"
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-4 z-[60] flex flex-col items-center gap-2 px-4 sm:items-end sm:pr-6 print:hidden"
      >
        {items.map((it) => (
          <div
            key={it.id}
            className="pointer-events-auto flex max-w-sm items-center gap-3 rounded-lg border border-verified-line bg-surface px-4 py-3 text-sm text-ink shadow-pop motion-safe:animate-toast-in"
          >
            <CheckCircle2 aria-hidden="true" className="h-5 w-5 shrink-0 text-verified" />
            <span className="min-w-0 flex-1">{it.message}</span>
            <button
              type="button"
              onClick={() => dismiss(it.id)}
              aria-label={t("toast.dismiss")}
              className="inline-flex min-h-tap min-w-tap items-center justify-center rounded text-ink-soft hover:bg-surface-sunken"
            >
              <X aria-hidden="true" className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
