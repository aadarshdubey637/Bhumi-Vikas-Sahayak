import { useCallback, useEffect, useRef, useState } from "react";

// Minimal typings: the Web Speech API is not in lib.dom for every TypeScript version.
interface RecognitionEvent {
  results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }>;
}
interface Recognition {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((e: RecognitionEvent) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}
type RecognitionCtor = new () => Recognition;

const ctor = (): RecognitionCtor | null => {
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
};

/**
 * Browser speech-to-text for the question box. Availability depends on the browser (Chrome/Edge/Safari); in Chrome the audio is
 * processed by the browser vendor's service, not by this application. Nothing is recorded or stored by NirmaanSetu. The text is
 * only placed in the input: the user reviews and sends it.
 */
export function useSpeechInput(lang: "hi-IN" | "en-IN", onText: (text: string) => void) {
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const rec = useRef<Recognition | null>(null);
  const cb = useRef(onText);
  cb.current = onText;
  const supported = typeof window !== "undefined" && ctor() !== null;

  const stop = useCallback(() => rec.current?.stop(), []);
  const start = useCallback(() => {
    const C = ctor();
    if (!C) return;
    setError(null);
    const r = new C();
    r.lang = lang;
    r.interimResults = false;
    r.continuous = false;
    r.onresult = (e) => {
      const text = Array.from(e.results)
        .map((x) => x[0]?.transcript ?? "")
        .join(" ")
        .trim();
      if (text) cb.current(text);
    };
    r.onerror = (e) => setError(e.error);
    r.onend = () => setListening(false);
    rec.current = r;
    try {
      r.start();
      setListening(true);
    } catch {
      setListening(false);
    }
  }, [lang]);

  useEffect(() => () => rec.current?.abort(), []);
  return { supported, listening, error, start, stop };
}
