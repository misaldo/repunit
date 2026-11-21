import { createContext, useContext, useMemo, type ReactNode } from "react";
import en from "./locales/en.json";

export const LANGUAGES = ["en", "cs", "sk", "de", "pl", "es"] as const;
export type Language = (typeof LANGUAGES)[number];
type TranslationKey = keyof typeof en;

type I18nContextValue = {
  language: Language;
  setLanguage: (language: Language) => void;
  t: (key: TranslationKey) => string;
};
const I18nContext = createContext<I18nContextValue | null>(null);

// REPUNIT is English-first for the initial release. Locale detection and the
// language switcher are intentionally deferred until the core product is stable.
export function I18nProvider({ children }: { children: ReactNode }) {
  const value = useMemo<I18nContextValue>(() => ({
    language: "en",
    setLanguage: () => undefined,
    t: (key) => en[key],
  }), []);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const context = useContext(I18nContext);
  if (!context) throw new Error("useI18n must be used inside I18nProvider");
  return context;
}

export const LANGUAGE_LABELS = {
  en: "english", cs: "czech", sk: "slovak", de: "german", pl: "polish", es: "spanish",
} as const;
