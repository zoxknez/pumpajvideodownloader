/* eslint-disable react-refresh/only-export-components */
import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { useClientSettings } from './SettingsContext';

type ToastType = 'success' | 'error' | 'info' | 'warning';
export type ToastOptions = {
  id?: string;
  title?: string;
  message: string;
  type?: ToastType;
  durationMs?: number;
  actionLabel?: string;
  onAction?: () => void;
};

type ToastItem = {
  id: string;
  title: string;
  message: string;
  type: ToastType;
  durationMs: number;
  actionLabel?: string;
  onAction?: () => void;
};

const ToastCtx = createContext<{
  show: (opts: ToastOptions) => string;
  dismiss: (id: string) => void;
} | null>(null);

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { settings } = useClientSettings();
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const show = useCallback((opts: ToastOptions) => {
    // respect user settings
    if (settings && settings.showNotifications === false) return Math.random().toString(36).slice(2);
    const id = opts.id || Math.random().toString(36).slice(2);
    const item: ToastItem = {
      id,
      title: opts.title || '',
      message: opts.message,
      type: opts.type || 'info',
      durationMs: Math.max(1500, Math.min(10000, opts.durationMs ?? 4000)),
      actionLabel: opts.actionLabel,
      onAction: opts.onAction,
    };
    setToasts((prev) => [...prev, item]);
    // auto dismiss
    setTimeout(() => dismiss(id), item.durationMs);
    return id;
  }, [dismiss, settings]);

  const value = useMemo(() => ({ show, dismiss }), [show, dismiss]);

  const color = (t: ToastType) =>
    t === 'success' ? 'from-emerald-600 to-green-600 border-emerald-500/40' :
    t === 'error' ? 'from-rose-600 to-red-600 border-red-500/40' :
    t === 'warning' ? 'from-amber-600 to-yellow-600 border-amber-500/40' :
    'from-blue-600 to-cyan-600 border-blue-500/40';

  return (
    <ToastCtx.Provider value={value}>
      {children}
      <div className="fixed top-4 right-4 z-[1000] space-y-3">
        {toasts.map((t) => (
          <div key={t.id} className={`relative min-w-[260px] max-w-[380px] p-4 rounded-xl shadow-xl text-white bg-gradient-to-br border ${color(t.type)} backdrop-blur`}>
            {t.title && <div className="font-semibold mb-1 pr-6">{t.title}</div>}
            <div className="text-sm opacity-95 pr-6">{t.message}</div>
            {t.actionLabel && (
              <button
                onClick={() => {
                  try { t.onAction?.(); } catch {}
                  dismiss(t.id);
                }}
                className="mt-3 inline-flex items-center justify-center rounded-lg bg-white/20 px-3 py-1 text-xs font-medium text-white hover:bg-white/30 transition"
              >
                {t.actionLabel}
              </button>
            )}
            <button onClick={() => dismiss(t.id)} className="absolute top-1.5 right-2 text-white/70 hover:text-white text-xs">✕</button>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
};

export function useToast() {
  const ctx = useContext(ToastCtx);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  const { show, dismiss } = ctx;
  return {
    toast: show,
    dismiss,
    success: (message: string, title = 'Success', opts?: Partial<Omit<ToastOptions, 'message' | 'title' | 'type'>>) => show({ message, title, type: 'success', ...opts }),
    error: (message: string, title = 'Error', opts?: Partial<Omit<ToastOptions, 'message' | 'title' | 'type'>>) => show({ message, title, type: 'error', ...opts }),
    info: (message: string, title = 'Info', opts?: Partial<Omit<ToastOptions, 'message' | 'title' | 'type'>>) => show({ message, title, type: 'info', ...opts }),
    warning: (message: string, title = 'Warning', opts?: Partial<Omit<ToastOptions, 'message' | 'title' | 'type'>>) => show({ message, title, type: 'warning', ...opts }),
  };
}
