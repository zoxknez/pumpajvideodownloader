'use client'

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'

// ---- Types
export type Theme = 'light' | 'dark' | 'system'
export type Language = 'en' | 'sr'

export type AppSettings = {
  // General
  theme: Theme
  language: Language
  showNotifications: boolean
  openFolderAfterSave: boolean

  // Downloads
  maxConcurrentDownloads: number // client UI hint
  maxRetries: number
  connectionTimeoutSec: number
  autoResume: boolean
  autoStart: boolean

  // Network
  useProxy: boolean
  proxyUrl: string
  limitRateKbps: number // 0 = unlimited

  // Privacy
  clearHistoryOnExit: boolean
  incognitoMode: boolean

  // Advanced (UI/runtime flags)
  enableLogging: boolean
  debugMode: boolean
}

// ---- Defaults
export const DEFAULT_SETTINGS: AppSettings = {
  theme: 'dark',
  language: 'en',
  showNotifications: true,
  openFolderAfterSave: false,

  maxConcurrentDownloads: 3,
  maxRetries: 3,
  connectionTimeoutSec: 30,
  autoResume: true,
  autoStart: true,

  useProxy: false,
  proxyUrl: '',
  limitRateKbps: 0,

  clearHistoryOnExit: false,
  incognitoMode: false,

  enableLogging: true,
  debugMode: false,
}

const STORAGE_KEY = 'pumpaj:settings:v1'

function coerceSettings(raw: unknown): AppSettings {
  const d = DEFAULT_SETTINGS
  const s = (typeof raw === 'object' && raw) ? raw as Partial<AppSettings> : {}
  return {
    theme: s.theme === 'light' || s.theme === 'system' ? s.theme : 'dark',
    language: s.language === 'sr' ? 'sr' : 'en',
    showNotifications: typeof s.showNotifications === 'boolean' ? s.showNotifications : d.showNotifications,
    openFolderAfterSave: typeof s.openFolderAfterSave === 'boolean' ? s.openFolderAfterSave : d.openFolderAfterSave,

    maxConcurrentDownloads: Number.isFinite(s.maxConcurrentDownloads as number) ? Math.max(1, Math.min(8, Number(s.maxConcurrentDownloads))) : d.maxConcurrentDownloads,
    maxRetries: Number.isFinite(s.maxRetries as number) ? Math.max(0, Math.min(10, Number(s.maxRetries))) : d.maxRetries,
    connectionTimeoutSec: Number.isFinite(s.connectionTimeoutSec as number) ? Math.max(5, Math.min(120, Number(s.connectionTimeoutSec))) : d.connectionTimeoutSec,
    autoResume: typeof s.autoResume === 'boolean' ? s.autoResume : d.autoResume,
    autoStart: typeof s.autoStart === 'boolean' ? s.autoStart : d.autoStart,

    useProxy: typeof s.useProxy === 'boolean' ? s.useProxy : d.useProxy,
    proxyUrl: typeof s.proxyUrl === 'string' ? s.proxyUrl : d.proxyUrl,
    limitRateKbps: Number.isFinite(s.limitRateKbps as number) ? Math.max(0, Number(s.limitRateKbps)) : d.limitRateKbps,

    clearHistoryOnExit: typeof s.clearHistoryOnExit === 'boolean' ? s.clearHistoryOnExit : d.clearHistoryOnExit,
    incognitoMode: typeof s.incognitoMode === 'boolean' ? s.incognitoMode : d.incognitoMode,

    enableLogging: typeof s.enableLogging === 'boolean' ? s.enableLogging : d.enableLogging,
    debugMode: typeof s.debugMode === 'boolean' ? s.debugMode : d.debugMode,
  }
}

export type SettingsContextValue = {
  settings: AppSettings
  setSettings: (patch: Partial<AppSettings> | ((s: AppSettings) => Partial<AppSettings>)) => void
  reset: () => void
  exportJson: () => string
  importJson: (json: string) => void
}

const SettingsCtx = createContext<SettingsContextValue | null>(null)

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const loadInitial = (): AppSettings => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (!raw) return DEFAULT_SETTINGS
      return coerceSettings(JSON.parse(raw))
    } catch {
      return DEFAULT_SETTINGS
    }
  }

  const [settings, setSettingsState] = useState<AppSettings>(DEFAULT_SETTINGS)
  const firstLoad = useRef(true)
  const saveTimer = useRef<number | null>(null)

  useEffect(() => { setSettingsState(loadInitial()) }, [])

  useEffect(() => {
    if (firstLoad.current) { firstLoad.current = false; return }
    if (saveTimer.current) window.clearTimeout(saveTimer.current)
    saveTimer.current = window.setTimeout(() => {
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(settings)) } catch {}
    }, 250)
    return () => { if (saveTimer.current) window.clearTimeout(saveTimer.current) }
  }, [settings])

  const setSettings = useCallback((patch: Partial<AppSettings> | ((s: AppSettings) => Partial<AppSettings>)) => {
    setSettingsState(prev => ({ ...prev, ...(typeof patch === 'function' ? patch(prev) : patch) }))
  }, [])

  const reset = useCallback(() => setSettingsState(DEFAULT_SETTINGS), [])

  const exportJson = useCallback(() => JSON.stringify(settings, null, 2), [settings])

  const importJson = useCallback((json: string) => {
    try { setSettingsState(coerceSettings(JSON.parse(json))) } catch {}
  }, [])

  const value = useMemo<SettingsContextValue>(() => ({ settings, setSettings, reset, exportJson, importJson }), [settings, setSettings, reset, exportJson, importJson])

  return <SettingsCtx.Provider value={value}>{children}</SettingsCtx.Provider>
}

export function useClientSettings(): SettingsContextValue {
  const ctx = useContext(SettingsCtx)
  if (!ctx) throw new Error('useClientSettings must be used within <SettingsProvider>')
  return ctx
}
