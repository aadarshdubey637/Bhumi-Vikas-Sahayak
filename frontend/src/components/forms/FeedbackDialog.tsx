import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { useCallback, useMemo, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { FeedbackCtx } from "./FeedbackDialogContext";
import { FeedbackForm, type FeedbackPrefill } from "./FeedbackForm";

export function FeedbackDialogProvider({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const [state, setState] = useState<{ prefill?: FeedbackPrefill; key: number } | null>(null);
  const openFeedback = useCallback(
    (prefill?: FeedbackPrefill) => setState((s) => ({ prefill, key: (s?.key ?? 0) + 1 })),
    [],
  );
  const api = useMemo(() => ({ openFeedback }), [openFeedback]);
  return (
    <FeedbackCtx.Provider value={api}>
      {children}
      <Dialog.Root open={state !== null} onOpenChange={(o) => !o && setState(null)}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-[60] bg-ink/40 print:hidden" />
          <Dialog.Content
            aria-describedby={undefined}
            className="fixed left-1/2 top-1/2 z-[70] max-h-[90vh] w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl bg-white p-5 shadow-pop print:hidden"
          >
            <div className="mb-3 flex items-center justify-between">
              <Dialog.Title className="text-lg font-semibold">{t("feedback.dialogTitle")}</Dialog.Title>
              <Dialog.Close
                className="inline-flex min-h-tap min-w-tap items-center justify-center rounded hover:bg-surface-sunken"
                aria-label={t("common.close")}
              >
                <X aria-hidden="true" className="h-5 w-5" />
              </Dialog.Close>
            </div>
            {state ? <FeedbackForm key={state.key} prefill={state.prefill} onDone={() => undefined} /> : null}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </FeedbackCtx.Provider>
  );
}
