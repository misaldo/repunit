import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import en from "./locales/en.json";
import cs from "./locales/cs.json";
import sk from "./locales/sk.json";
import de from "./locales/de.json";
import pl from "./locales/pl.json";
import es from "./locales/es.json";
import { detectRequestCountry } from "./detect-country";

export const LANGUAGES = ["en", "cs", "sk", "de", "pl", "es"] as const;
export type Language = (typeof LANGUAGES)[number];
type TranslationKey = keyof typeof en;
const dictionaries = { en, cs, sk, de, pl, es } satisfies Record<Language, Record<TranslationKey, string>>;
const STORAGE_KEY = "repunit.language";
const MANUAL_KEY = "repunit.language.manual";
const countryLanguage: Record<string, Language> = { CZ: "cs", SK: "sk", DE: "de", AT: "de", CH: "de", PL: "pl", ES: "es", MX: "es", AR: "es", CO: "es", CL: "es" };

function browserLanguage(): Language {
  if (typeof navigator === "undefined") return "en";
  const candidates = navigator.languages?.length ? navigator.languages : [navigator.language];
  for (const candidate of candidates) {
    const code = candidate.toLowerCase().split("-")[0];
    if (LANGUAGES.includes(code as Language)) return code as Language;
  }
  return "en";
}

type I18nContextValue = { language: Language; setLanguage: (language: Language) => void; t: (key: TranslationKey) => string };
const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>("en");

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    const manual = localStorage.getItem(MANUAL_KEY) === "true";
    if (saved && LANGUAGES.includes(saved as Language) && manual) {
      setLanguageState(saved as Language);
      return;
    }

    let active = true;
    void detectRequestCountry()
      .catch(() => null)
      .then((country) => {
        if (!active) return;
        const detected = country ? countryLanguage[country] : undefined;
        const selected = detected ?? browserLanguage();
        setLanguageState(selected);
        localStorage.setItem(STORAGE_KEY, selected);
        localStorage.setItem(MANUAL_KEY, "false");
      });

    return () => { active = false; };
  }, []);

  const setLanguage = useCallback((next: Language) => {
    setLanguageState(next);
    localStorage.setItem(STORAGE_KEY, next);
    localStorage.setItem(MANUAL_KEY, "true");
  }, []);

  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  const value = useMemo<I18nContextValue>(() => ({
    language,
    setLanguage,
    t: (key) => dictionaries[language][key] ?? dictionaries.en[key],
  }), [language, setLanguage]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const context = useContext(I18nContext);
  if (!context) throw new Error("useI18n must be used inside I18nProvider");
  return context;
}

export const LANGUAGE_LABELS: Record<Language, TranslationKey> = {
  en: "english", cs: "czech", sk: "slovak", de: "german", pl: "polish", es: "spanish",
};
