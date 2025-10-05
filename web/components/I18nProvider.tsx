'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

export type AppLocale = 'sr' | 'en';

type I18nContextValue = {
  locale: AppLocale;
  setLocale: (next: string | AppLocale) => void;
};

const SUPPORTED_LOCALES: AppLocale[] = ['sr', 'en'];

function normalizeLocale(raw?: string | null): AppLocale {
  if (!raw) return 'en';
  const base = raw.split(',')[0]?.split('-')[0]?.toLowerCase() ?? 'en';
  return (SUPPORTED_LOCALES.includes(base as AppLocale) ? base : 'en') as AppLocale;
}

const I18nCtx = createContext<I18nContextValue | null>(null);

export default function I18nProvider({
  initialLocale,
  children,
}: {
  initialLocale: string;
  children: React.ReactNode;
}) {
  const [locale, setLocaleState] = useState<AppLocale>(() => normalizeLocale(initialLocale));

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const storedRaw = localStorage.getItem('app:lang');
      if (!storedRaw) {
        localStorage.setItem('app:lang', 'en');
        return;
      }
      const stored = normalizeLocale(storedRaw);
      if (stored !== locale) {
        setLocaleState(stored);
      }
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (typeof document !== 'undefined') {
      const maxAge = 60 * 60 * 24 * 365; // 1 year
      document.cookie = `locale=${locale}; path=/; max-age=${maxAge}`;
    }
    try {
      localStorage.setItem('app:lang', locale);
    } catch {}
  }, [locale]);

  const setLocale = useCallback((next: string | AppLocale) => {
    setLocaleState(normalizeLocale(next));
  }, []);

  const value = useMemo<I18nContextValue>(() => ({ locale, setLocale }), [locale, setLocale]);

  return <I18nCtx.Provider value={value}>{children}</I18nCtx.Provider>;
}

export function useI18n() {
  const ctx = useContext(I18nCtx);
  if (!ctx) throw new Error('useI18n must be used within I18nProvider');
  return ctx;
}
