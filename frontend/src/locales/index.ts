import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { en, TranslationKey } from "./en";
import { es } from "./es";

export type Locale = "es" | "en";

const STORAGE_KEY = "locale";
const DEFAULT_LOCALE: Locale = "es";

const translations: Record<Locale, Record<TranslationKey, string>> = { en, es };

/** Replace {placeholder} patterns in a string. */
function interpolate(str: string, params?: Record<string, string | number>): string {
  if (!params) return str;
  return Object.entries(params).reduce(
    (s, [k, v]) => s.split(`{${k}}`).join(String(v)),
    str
  );
}

function readStoredLocale(): Locale {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === "en" || v === "es") return v;
  } catch {
    // localStorage unavailable (private browsing) → default
  }
  return DEFAULT_LOCALE;
}

// ── Context ───────────────────────────────────────────────────────────────────

interface LocaleContextValue {
  locale: Locale;
  setLocale: (l: Locale) => void;
  t: (key: TranslationKey, params?: Record<string, string | number>) => string;
}

const LocaleContext = createContext<LocaleContextValue>({
  locale: DEFAULT_LOCALE,
  setLocale: () => {},
  t: (key) => en[key],
});

// ── Provider ──────────────────────────────────────────────────────────────────

export function LocaleProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(readStoredLocale);

  const setLocale = useCallback((l: Locale) => {
    setLocaleState(l);
    try { localStorage.setItem(STORAGE_KEY, l); } catch { /* ignore */ }
  }, []);

  const t = useCallback(
    (key: TranslationKey, params?: Record<string, string | number>): string => {
      const dict = translations[locale];
      // Fallback to Spanish if key missing in current locale
      const str = dict[key] ?? es[key] ?? key;
      return interpolate(str, params);
    },
    [locale]
  );

  return React.createElement(
    LocaleContext.Provider,
    { value: { locale, setLocale, t } },
    children
  );
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useLocale() {
  return useContext(LocaleContext);
}

export type { TranslationKey };
