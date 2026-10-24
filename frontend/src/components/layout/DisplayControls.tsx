import { Contrast, Moon, RotateCcw, Sun, Type } from "lucide-react";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useTranslation } from "react-i18next";
import { displayStore, type Display } from "@/lib/display";

const SIZE_LABEL = ["A", "A", "A"] as const;
const SIZE_CLS = ["text-sm", "text-base", "text-xl"] as const;

/** Text size, theme and high contrast: the accessibility controls government portals are expected to offer. Sits on dark or light bars. */
export function DisplayControls() {
  const { t } = useTranslation();
  const d = useSyncExternalStore(displayStore.subscribe, displayStore.getSnapshot);
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", away);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  const seg = (on: boolean) => `inline-flex min-h-tap min-w-tap flex-1 items-center justify-center gap-1.5 rounded-lg px-3 font-semibold transition-colors ${on ? "bg-white text-[#1c1f26]" : "text-ink-soft hover:bg-white/10 hover:text-ink"}`;
  const set = (p: Partial<Display>) => displayStore.set(p);

  return (
    <div ref={box} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={t("disp.open")}
        title={t("disp.open")}
        className="inline-flex min-h-tap min-w-tap items-center justify-center gap-1 rounded-xl border border-white/15 bg-white/5 px-2.5 text-sm font-bold text-white hover:bg-white/10"
      >
        <Type aria-hidden="true" className="h-4 w-4" />
        <span aria-hidden="true">Aa</span>
      </button>
      {open ? (
        <div role="dialog" aria-label={t("disp.title")} className="theme-dark absolute right-0 top-full z-50 mt-2 w-72 space-y-4 rounded-2xl border border-line-strong bg-surface p-4 text-sm text-ink shadow-pop">
          <section>
            <h3 className="mb-1.5 text-xs font-bold uppercase tracking-wide text-ink-faint">{t("disp.textSize")}</h3>
            <div role="group" aria-label={t("disp.textSize")} className="flex gap-1 rounded-xl bg-surface-sunken p-1">
              {([0, 1, 2] as const).map((s) => (
                <button key={s} type="button" aria-pressed={d.scale === s} aria-label={t(`disp.size${s}`)} onClick={() => set({ scale: s })} className={`${seg(d.scale === s)} ${SIZE_CLS[s]}`}>
                  {SIZE_LABEL[s]}
                </button>
              ))}
            </div>
          </section>
          <section>
            <h3 className="mb-1.5 text-xs font-bold uppercase tracking-wide text-ink-faint">{t("disp.theme")}</h3>
            <div role="group" aria-label={t("disp.theme")} className="flex gap-1 rounded-xl bg-surface-sunken p-1">
              <button type="button" aria-pressed={d.theme === "light"} onClick={() => set({ theme: "light" })} className={seg(d.theme === "light")}>
                <Sun aria-hidden="true" className="h-4 w-4" />
                {t("disp.light")}
              </button>
              <button type="button" aria-pressed={d.theme === "dark"} onClick={() => set({ theme: "dark" })} className={seg(d.theme === "dark")}>
                <Moon aria-hidden="true" className="h-4 w-4" />
                {t("disp.dark")}
              </button>
            </div>
          </section>
          <section>
            <button type="button" role="switch" aria-checked={d.contrast} onClick={() => set({ contrast: !d.contrast })} className="flex min-h-tap w-full items-center justify-between gap-3 rounded-xl bg-surface-sunken px-3 font-semibold">
              <span className="inline-flex items-center gap-2">
                <Contrast aria-hidden="true" className="h-4 w-4" />
                {t("disp.contrast")}
              </span>
              <span aria-hidden="true" className={`relative inline-block h-6 w-11 rounded-full transition-colors ${d.contrast ? "bg-brand" : "bg-line-strong"}`}>
                <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-[left] ${d.contrast ? "left-[1.375rem]" : "left-0.5"}`} />
              </span>
            </button>
          </section>
          <button type="button" onClick={() => displayStore.reset()} className="inline-flex min-h-tap items-center gap-1.5 text-xs font-semibold text-ink-soft underline-offset-2 hover:text-ink hover:underline">
            <RotateCcw aria-hidden="true" className="h-3.5 w-3.5" />
            {t("disp.reset")}
          </button>
        </div>
      ) : null}
    </div>
  );
}
