'use client';

import { createContext, useContext, useMemo, useState } from 'react';

type Settings = {
  autoDownload: boolean;
  smartMode: boolean;
  askBeforeDelete: boolean;
};

type SettingsContextValue = {
  settings: Settings;
  setSetting: <K extends keyof Settings>(key: K, value: Settings[K]) => void;
};

const DEFAULT_SETTINGS: Settings = {
  autoDownload: false,
  smartMode: true,
  askBeforeDelete: true,
};

const SettingsContext = createContext<SettingsContextValue | null>(null);

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);

  const value = useMemo<SettingsContextValue>(() => ({
    settings,
    setSetting: (key, value) => {
      setSettings((prev) => ({ ...prev, [key]: value }));
    },
  }), [settings]);

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings(): SettingsContextValue {
  const ctx = useContext(SettingsContext);
  if (!ctx) {
    throw new Error('useSettings must be used inside SettingsProvider');
  }
  return ctx;
}
