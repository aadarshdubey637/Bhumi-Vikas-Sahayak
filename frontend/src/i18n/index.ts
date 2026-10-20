import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import en from "./en.json";
import hi from "./hi.json";

export const SUPPORTED_LANGUAGES = ["en", "hi"] as const;
export type UiLanguage = (typeof SUPPORTED_LANGUAGES)[number];

// The only thing persisted across sessions is this UI-language choice (never the access key). The Workbench additionally keeps its inputs and
// answered turns in sessionStorage (this tab only, cleared when the tab closes or on Reset); nothing is ever written to localStorage except this choice.
const LANG_STORAGE_KEY = "ns.ui-language";

export function storedLanguage(): UiLanguage {
  try {
    const v = window.localStorage.getItem(LANG_STORAGE_KEY);
    return v === "hi" ? "hi" : "en";
  } catch {
    return "en"; // storage blocked (private mode, policy): fall back silently
  }
}

/** Switch language, keep <html lang> in sync (fonts/hyphenation/screen readers) and remember the choice. */
export function setUiLanguage(l: UiLanguage): void {
  void i18n.changeLanguage(l);
  document.documentElement.lang = l;
  try {
    window.localStorage.setItem(LANG_STORAGE_KEY, l);
  } catch {
    /* not persisted */
  }
}

const initial = storedLanguage();
void i18n.use(initReactI18next).init({
  resources: { en: { translation: en }, hi: { translation: hi } },
  lng: initial,
  fallbackLng: "en",
  interpolation: { escapeValue: false }, // React escapes; backend text is never rendered as HTML
});
if (typeof document !== "undefined") document.documentElement.lang = initial;

export default i18n;
