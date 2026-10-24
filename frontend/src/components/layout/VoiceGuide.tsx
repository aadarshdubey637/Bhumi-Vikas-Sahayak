import { Headphones, Square } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useSpeechOutput } from "@/hooks/useSpeechOutput";

/** Reads a short spoken tour of the page aloud (browser text-to-speech, in the interface language). Hidden when the browser has no speech support. */
export function VoiceGuide() {
  const { t, i18n } = useTranslation();
  const sp = useSpeechOutput("voice-guide");
  if (!sp.supported) return null;
  const on = sp.state !== "idle";
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={() => (on ? sp.stop() : sp.play(t("vguide.script"), i18n.language === "hi" ? "hi-IN" : "en-IN"))}
      className={`inline-flex h-[2.125rem] shrink-0 items-center gap-2 whitespace-nowrap rounded-lg border px-3.5 text-sm font-bold transition-colors ${on ? "border-accent bg-accent/20 text-accent" : "border-accent/70 bg-accent/5 text-accent hover:bg-accent/15"}`}
    >
      {on ? <Square aria-hidden="true" className="h-3.5 w-3.5 fill-current" /> : <Headphones aria-hidden="true" className="h-4 w-4" />}
      <span className="hidden sm:inline">{on ? t("vguide.stop") : t("vguide.start")}</span>
    </button>
  );
}
