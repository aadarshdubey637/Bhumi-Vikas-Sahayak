import { Mic, MicOff } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useSpeechInput } from "@/hooks/useSpeechInput";

/** Mic button for the question box. Unlike the shared VoiceButton it stays visible when unsupported and explains why. */
export function VoiceInputButton({ onText }: { onText: (text: string) => void }) {
  const { t, i18n } = useTranslation();
  const sp = useSpeechInput(i18n.language === "hi" ? "hi-IN" : "en-IN", onText);
  const label = !sp.supported ? t("wb.voice.unsupported") : sp.listening ? t("voice.stop") : t("voice.start");
  const msg = sp.error
    ? sp.error === "not-allowed" || sp.error === "service-not-allowed"
      ? t("wb.voice.denied")
      : sp.error === "no-speech"
        ? t("wb.voice.noSpeech")
        : t("voice.error", { code: sp.error })
    : sp.listening
      ? t("wb.voice.listening")
      : "";
  return (
    <>
      <button
        type="button"
        disabled={!sp.supported}
        onClick={sp.listening ? sp.stop : sp.start}
        aria-pressed={sp.listening}
        aria-label={label}
        title={sp.supported ? `${label} — ${t("voice.privacy")}` : label}
        className={`inline-flex min-h-tap min-w-tap items-center justify-center rounded-xl border transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
          sp.listening ? "border-danger-line bg-danger-tint text-danger motion-safe:animate-pulse" : "border-line-strong bg-surface/60 text-ink-soft hover:border-brand-ring hover:text-brand"
        }`}
      >
        {sp.listening || !sp.supported ? <MicOff aria-hidden="true" className="h-5 w-5" /> : <Mic aria-hidden="true" className="h-5 w-5" />}
      </button>
      <span role="status" aria-live="polite" className={msg ? "basis-full text-xs text-ink-soft" : "sr-only"}>
        {msg}
      </span>
    </>
  );
}
