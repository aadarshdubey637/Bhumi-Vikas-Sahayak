import { useCallback, useEffect, useSyncExternalStore } from "react";
import { speechChunks } from "@/lib/answerView";

// Browser text-to-speech (Web Speech API). One shared player so only one answer is read at a time. The text never leaves
// the browser through this application; some browsers use an online voice, which is the browser's own behaviour.
export type SpeechState = "idle" | "playing" | "paused";
interface Snap {
  activeId: string | null;
  state: SpeechState;
}
let snap: Snap = { activeId: null, state: "idle" };
let token = 0;
const listeners = new Set<() => void>();
const set = (next: Snap) => {
  snap = next;
  listeners.forEach((l) => l());
};
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => void listeners.delete(l);
};
const synth = (): SpeechSynthesis | null => (typeof window !== "undefined" && "speechSynthesis" in window ? window.speechSynthesis : null);

export const speechSupported = (): boolean => synth() !== null && typeof SpeechSynthesisUtterance !== "undefined";

/** Best installed voice for the language, or null when none is installed (the browser would then read it with the wrong voice). */
export function voiceFor(lang: "hi-IN" | "en-IN"): SpeechSynthesisVoice | null {
  const voices = synth()?.getVoices() ?? [];
  const base = lang.slice(0, 2).toLowerCase();
  return (
    voices.find((v) => v.lang.replace("_", "-").toLowerCase() === lang.toLowerCase()) ??
    voices.find((v) => v.lang.toLowerCase().startsWith(base)) ??
    null
  );
}

export function stopSpeech(): void {
  token++;
  synth()?.cancel();
  set({ activeId: null, state: "idle" });
}

export function playSpeech(id: string, text: string, lang: "hi-IN" | "en-IN"): void {
  const s = synth();
  if (!s || !speechSupported()) return;
  s.cancel();
  const my = ++token;
  const chunks = speechChunks(text);
  if (chunks.length === 0) return;
  const voice = voiceFor(lang);
  chunks.forEach((chunk, i) => {
    const u = new SpeechSynthesisUtterance(chunk);
    u.lang = voice?.lang ?? lang;
    if (voice) u.voice = voice;
    u.rate = 0.95;
    if (i === chunks.length - 1) u.onend = () => my === token && set({ activeId: null, state: "idle" });
    u.onerror = (e) => {
      if (my !== token || e.error === "canceled" || e.error === "interrupted") return;
      set({ activeId: null, state: "idle" });
    };
    s.speak(u);
  });
  set({ activeId: id, state: "playing" });
}

export function pauseSpeech(): void {
  const s = synth();
  if (!s || snap.state !== "playing") return;
  s.pause();
  set({ ...snap, state: "paused" });
}
export function resumeSpeech(): void {
  const s = synth();
  if (!s || snap.state !== "paused") return;
  s.resume();
  set({ ...snap, state: "playing" });
}

/** State of the shared player as seen by one answer (`id`). */
export function useSpeechOutput(id: string) {
  const s = useSyncExternalStore(subscribe, () => snap);
  // Voices load asynchronously in Chrome; re-render when they arrive so the "no voice installed" hint is accurate.
  useEffect(() => {
    const sy = synth();
    if (!sy) return;
    const bump = () => set({ ...snap });
    sy.addEventListener?.("voiceschanged", bump);
    return () => sy.removeEventListener?.("voiceschanged", bump);
  }, []);
  const mine = s.activeId === id;
  const play = useCallback((text: string, lang: "hi-IN" | "en-IN") => playSpeech(id, text, lang), [id]);
  return {
    supported: speechSupported(),
    state: mine ? s.state : ("idle" as SpeechState),
    play,
    pause: pauseSpeech,
    resume: resumeSpeech,
    stop: stopSpeech,
  };
}

// Never keep talking after the page is left or reloaded.
if (typeof window !== "undefined") window.addEventListener("pagehide", () => synth()?.cancel());
