import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { btn } from "@/lib/ui";
import { useToast } from "./toastContext";

export function CopyButton({ text, label, compact }: { text: string; label?: string; compact?: boolean }) {
  const { t } = useTranslation();
  const toast = useToast();
  const [done, setDone] = useState(false);
  const onClick = async () => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(t("toast.copied"));
      setDone(true);
      window.setTimeout(() => setDone(false), 1500);
    } catch {
      /* clipboard unavailable: nothing to do */
    }
  };
  const Icon = done ? Check : Copy;
  const text_ = done ? t("common.copied") : (label ?? t("common.copy"));
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        compact ? "inline-flex min-h-tap min-w-tap items-center justify-center gap-1 text-xs text-brand" : btn
      }
      aria-label={label ?? t("common.copy")}
    >
      <Icon aria-hidden="true" className="h-4 w-4" />
      <span>{text_}</span>
    </button>
  );
}
