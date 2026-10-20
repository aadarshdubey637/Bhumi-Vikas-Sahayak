import { Mic, MicOff } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useSpeechInput } from "@/hooks/useSpeechInput";

/** Mic button that dictates into a text field. Renders nothing when the browser has no speech recognition. */
export function VoiceButton({
  onText,
  className = "",
}: {
  onText: (text: string) => void;
  className?: string;
}) {
  const { t, i18n } = useTranslation();
  const speech = useSpeechInput(i18n.language === "hi" ? "hi-IN" : "en-IN", onText);
  if (!speech.supported) return null;
  const label = speech.listening ? t("voice.stop") : t("voice.start");
  return (
    <>
      <button
        type="button"
        onClick={speech.listening ? speech.stop : speech.start}
        aria-pressed={speech.listening}
        aria-label={label}
        title={`${label} — ${t("voice.privacy")}`}
        className={`inline-flex min-h-tap min-w-tap items-center justify-center rounded-lg border transition-colors ${
          speech.listening
            ? "border-danger-line bg-danger-tint text-danger motion-safe:animate-pulse"
            : "border-line-strong bg-surface text-ink-soft hover:border-brand-ring hover:text-brand"
        } ${className}`}
      >
        {speech.listening ? <MicOff aria-hidden="true" className="h-5 w-5" /> : <Mic aria-hidden="true" className="h-5 w-5" />}
      </button>
      {speech.error ? (
        <span role="status" className="sr-only">
          {t("voice.error", { code: speech.error })}
        </span>
      ) : null}
    </>
  );
}
