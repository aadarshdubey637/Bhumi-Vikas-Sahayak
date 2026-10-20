import { Pause, Play, Square, Volume2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { voiceFor, useSpeechOutput } from "@/hooks/useSpeechOutput";
import type { AnswerLang } from "@/lib/answerView";

const btn =
  "inline-flex min-h-tap items-center gap-1.5 rounded-xl border border-line-strong bg-surface/60 px-3 text-sm font-semibold text-ink hover:border-brand-ring hover:text-brand disabled:cursor-not-allowed disabled:opacity-50";

/** Read-aloud controls for one answer: listen, pause/resume, stop. Needs the browser's speech synthesis. */
export function SpeakButton({ id, text, lang }: { id: string; text: string; lang: AnswerLang }) {
  const { t } = useTranslation();
  const sp = useSpeechOutput(id);
  const bcp = lang === "hi" ? "hi-IN" : "en-IN";
  if (!sp.supported) {
    return (
      <span role="note" className="text-xs text-ink-faint">
        {t("wb.tts.unsupported")}
      </span>
    );
  }
  const noVoice = sp.state === "idle" && voiceFor(bcp) === null && (window.speechSynthesis?.getVoices().length ?? 0) > 0;
  return (
    <div className="flex flex-wrap items-center gap-2" role="group" aria-label={t("wb.tts.group")}>
      {sp.state === "idle" ? (
        <button type="button" className={btn} onClick={() => sp.play(text, bcp)}>
          <Volume2 aria-hidden="true" className="h-4 w-4" />
          {t("wb.tts.listen")}
        </button>
      ) : (
        <>
          {sp.state === "playing" ? (
            <button type="button" className={btn} onClick={sp.pause}>
              <Pause aria-hidden="true" className="h-4 w-4" />
              {t("wb.tts.pause")}
            </button>
          ) : (
            <button type="button" className={btn} onClick={sp.resume}>
              <Play aria-hidden="true" className="h-4 w-4" />
              {t("wb.tts.resume")}
            </button>
          )}
          <button type="button" className={btn} onClick={sp.stop}>
            <Square aria-hidden="true" className="h-4 w-4" />
            {t("wb.tts.stop")}
          </button>
        </>
      )}
      <span role="status" className="sr-only">
        {sp.state === "playing" ? t("wb.tts.playing") : sp.state === "paused" ? t("wb.tts.paused") : ""}
      </span>
      {noVoice ? (
        <span role="note" className="text-xs text-pending">
          {t(lang === "hi" ? "wb.tts.noVoiceHi" : "wb.tts.noVoiceEn")}
        </span>
      ) : null}
    </div>
  );
}
