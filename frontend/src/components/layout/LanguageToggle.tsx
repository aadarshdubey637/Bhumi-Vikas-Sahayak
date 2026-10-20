import { useTranslation } from "react-i18next";
import { SUPPORTED_LANGUAGES, setUiLanguage } from "@/i18n";

/** EN / हिं switch, shared by the app header, the landing page and the sign-in screens. Sits on a dark surface. */
export function LanguageToggle({ tone = "dark" }: { tone?: "dark" | "light" }) {
  const { t, i18n } = useTranslation();
  return (
    <div role="group" aria-label={t("common.language")} className={`inline-flex shrink-0 overflow-hidden rounded-xl border ${tone === "dark" ? "border-white/15 bg-white/5" : "border-line-strong bg-surface"}`}>
      {SUPPORTED_LANGUAGES.map((l) => (
        <button
          key={l}
          type="button"
          lang={l}
          aria-pressed={i18n.language === l}
          onClick={() => setUiLanguage(l)}
          className={`min-h-tap min-w-tap px-3 text-sm font-semibold transition-colors ${i18n.language === l ? (tone === "dark" ? "bg-white text-[#0b2a5b]" : "bg-brand text-white") : (tone === "dark" ? "text-white/80 hover:bg-white/10 hover:text-white" : "text-ink-soft hover:bg-surface-sunken hover:text-ink")}`}
        >
          {l === "en" ? "EN" : "हिं"}
        </button>
      ))}
    </div>
  );
}
