'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

type ToastKind = 'success' | 'error' | 'info';

type ToastPayload = {
  message: string;
  title?: string;
  kind?: ToastKind;
  durationMs?: number;
};

type ToastContextValue = {
  success: (message: string, title?: string, options?: Partial<Pick<ToastPayload, 'durationMs'>>) => void;
  error: (message: string, title?: string, options?: Partial<Pick<ToastPayload, 'durationMs'>>) => void;
  info: (message: string, title?: string, options?: Partial<Pick<ToastPayload, 'durationMs'>>) => void;
};

type InternalToast = ToastPayload & { id: number; kind: ToastKind };

const ToastContext = createContext<ToastContextValue | null>(null);

const DEFAULT_DURATION = 4000;

function useToastQueue() {
  const [items, setItems] = useState<InternalToast[]>([]);
  const counterRef = useRef(0);
  const timersRef = useRef<Map<number, number>>(new Map());

  const remove = useCallback((id: number) => {
    setItems((prev) => prev.filter((item) => item.id !== id));
    const timerId = timersRef.current.get(id);
    if (timerId) {
      window.clearTimeout(timerId);
      timersRef.current.delete(id);
    }
  }, []);

  const push = useCallback((payload: ToastPayload & { kind: ToastKind }) => {
    counterRef.current += 1;
    const id = counterRef.current;
    const duration = Math.max(1000, payload.durationMs ?? DEFAULT_DURATION);

    setItems((prev) => [...prev, { ...payload, id }]);

    const timerId = window.setTimeout(() => remove(id), duration);
    timersRef.current.set(id, timerId);
  }, [remove]);

  useEffect(() => () => {
    for (const timerId of timersRef.current.values()) {
      window.clearTimeout(timerId);
    }
    timersRef.current.clear();
  }, []);

  return { items, push, remove } as const;
}

const kindStyles: Record<ToastKind, string> = {
  success: 'border-emerald-400/40 bg-emerald-500/20 text-emerald-100',
  error: 'border-rose-400/40 bg-rose-500/25 text-rose-50',
  info: 'border-blue-400/40 bg-blue-500/25 text-blue-50',
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const { items, push, remove } = useToastQueue();

  const contextValue = useMemo<ToastContextValue>(() => ({
    success: (message, title, options) => push({ message, title, kind: 'success', durationMs: options?.durationMs }),
    error: (message, title, options) => push({ message, title, kind: 'error', durationMs: options?.durationMs }),
    info: (message, title, options) => push({ message, title, kind: 'info', durationMs: options?.durationMs }),
  }), [push]);

  return (
    <ToastContext.Provider value={contextValue}>
      {children}
      <div className="pointer-events-none fixed bottom-4 right-4 z-[2000] flex w-full max-w-sm flex-col gap-3">
        {items.map((toast) => (
          <div
            key={toast.id}
            className={`pointer-events-auto overflow-hidden rounded-2xl border bg-slate-950/80 backdrop-blur px-4 py-3 shadow-2xl transition ${kindStyles[toast.kind]}`}
          >
            <div className="flex items-start gap-3">
              <div className="flex-1 min-w-0">
                {toast.title && <div className="text-sm font-semibold leading-tight">{toast.title}</div>}
                <div className="text-xs leading-snug opacity-90 break-words">{toast.message}</div>
              </div>
              <button
                type="button"
                onClick={() => remove(toast.id)}
                className="text-[11px] font-semibold uppercase tracking-wide text-white/70 hover:text-white"
              >
                zatvori
              </button>
            </div>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error('useToast must be used inside ToastProvider');
  }
  return ctx;
}
