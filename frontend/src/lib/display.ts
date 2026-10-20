// Display preferences: theme, text size and high contrast. Kept on this device; applied to <html> so every page follows.
export type Theme = "light" | "dark";
export interface Display {
  theme: Theme;
  /** 0 = standard, 1 = large (112.5 %), 2 = largest (125 %) */
  scale: 0 | 1 | 2;
  contrast: boolean;
}
export const DEFAULT_DISPLAY: Display = { theme: "light", scale: 0, contrast: false };
const KEY = "ns.display.v2";
export const SCALES = [1, 1.125, 1.25] as const;

const listeners = new Set<() => void>();
let current: Display = DEFAULT_DISPLAY;
let loaded = false;

function read(): Display {
  try {
    const v = JSON.parse(window.localStorage.getItem(KEY) ?? "null") as Partial<Display> | null;
    if (!v) return DEFAULT_DISPLAY;
    return {
      theme: v.theme === "dark" ? "dark" : "light",
      scale: v.scale === 1 || v.scale === 2 ? v.scale : 0,
      contrast: v.contrast === true,
    };
  } catch {
    return DEFAULT_DISPLAY;
  }
}

export function applyDisplay(d: Display): void {
  const root = document.documentElement;
  root.dataset.theme = d.theme;
  root.style.setProperty("--text-scale", String(SCALES[d.scale]));
  root.classList.toggle("hc", d.contrast);
}

export const displayStore = {
  subscribe(l: () => void): () => void {
    listeners.add(l);
    return () => void listeners.delete(l);
  },
  getSnapshot(): Display {
    if (!loaded) {
      current = read();
      loaded = true;
    }
    return current;
  },
  set(patch: Partial<Display>): void {
    current = { ...displayStore.getSnapshot(), ...patch };
    try {
      window.localStorage.setItem(KEY, JSON.stringify(current));
    } catch {
      /* not remembered */
    }
    applyDisplay(current);
    listeners.forEach((l) => l());
  },
  reset(): void {
    displayStore.set(DEFAULT_DISPLAY);
  },
};

/** Call once before the first render so there is no flash of the wrong theme or size. */
export function initDisplay(): void {
  applyDisplay(displayStore.getSnapshot());
}
