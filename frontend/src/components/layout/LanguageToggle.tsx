import { useTranslation } from "react-i18next";
import { SUPPORTED_LANGUAGES, setUiLanguage } from "@/i18n";

/** EN / हिं switch, shared by the app header, the landing page and the sign-in screens. Sits on a dark surface. */
export function LanguageToggle({ tone = "dark", long = false }: { tone?: "dark" | "light"; long?: boolean }) {
  const { t, i18n } = useTranslation();
  return (
    <div role="group" aria-label={t("common.language")} className={`inline-flex shrink-0 overflow-hidden rounded-lg border ${tone === "dark" ? "border-white/15 bg-white/5" : "border-line bg-surface"}`}>
      {SUPPORTED_LANGUAGES.map((l) => (
        <button
          key={l}
          type="button"
          lang={l}
          aria-pressed={i18n.language === l}
          onClick={() => setUiLanguage(l)}
          className={`h-[2.125rem] min-w-[2.5rem] whitespace-nowrap px-2.5 text-sm font-semibold transition-colors ${i18n.language === l ? (tone === "dark" ? "bg-white text-[#10131c]" : "bg-surface-sunken text-ink ring-1 ring-inset ring-line-strong") : (tone === "dark" ? "text-white/80 hover:bg-white/10 hover:text-white" : "text-ink-soft hover:bg-surface-sunken hover:text-ink")}`}
        >
          {l === "en" ? (long ? <><span className="sm:hidden">EN</span><span className="hidden sm:inline">English</span></> : "EN") : long ? <><span className="sm:hidden">हिं</span><span className="hidden sm:inline">हिंदी</span></> : "हिं"}
        </button>
      ))}
    </div>
  );
}
