/* eslint-disable react-refresh/only-export-components */
import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';

export type ClientSettings = {
  showNotifications: boolean;
  openFolderAfterSave: boolean;
};

const defaultSettings: ClientSettings = {
  showNotifications: true,
  openFolderAfterSave: false,
};

const Ctx = createContext<{ settings: ClientSettings; setSettings: (s: Partial<ClientSettings>) => void } | null>(null);

export const SettingsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [settings, setLocal] = useState<ClientSettings>(() => {
    try {
      const raw = localStorage.getItem('client:settings');
      return raw ? { ...defaultSettings, ...JSON.parse(raw) } : defaultSettings;
    } catch { return defaultSettings; }
  });

  useEffect(() => {
    try { localStorage.setItem('client:settings', JSON.stringify(settings)); } catch {}
  }, [settings]);

  const value = useMemo(() => ({
    settings,
    setSettings: (s: Partial<ClientSettings>) => setLocal((prev) => ({ ...prev, ...s })),
  }), [settings]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
};

export function useClientSettings() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useClientSettings must be used within SettingsProvider');
  return ctx;
}
