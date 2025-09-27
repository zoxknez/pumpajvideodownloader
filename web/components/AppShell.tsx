'use client';

import { useEffect, useMemo, useState } from 'react';
import type { ComponentType } from 'react';
import {
  Download,
  ListChecks,
  History,
  Settings as SettingsIcon,
  Activity,
  WifiOff,
  Wifi as WifiIcon,
} from 'lucide-react';
import DesktopApp from './DesktopApp';
import { UserBadge } from './UserBadge';
// Koristimo web varijantu API utila umesto desktop src putanje
import { API_BASE, apiUrl } from '@/lib/api';
import { getSupabase } from '@/lib/supabaseClient';
import { ApiBaseOverride } from './ApiBaseOverride';
import { LogViewer } from './LogViewer';
import { HealthPanel } from './HealthPanel';

type MainTab = 'download' | 'queue' | 'history' | 'batch' | 'settings';

type Metrics = {
  running: number;
  queued: number;
  maxConcurrent?: number;
};

type ApiStatus = 'checking' | 'online' | 'offline';

const tabs: Array<{ id: MainTab; label: string; icon: ComponentType<{ className?: string }> }> = [
  { id: 'download', label: 'Preuzimanja', icon: Download },
  { id: 'queue', label: 'Red', icon: ListChecks },
  { id: 'history', label: 'Istorija', icon: History },
  { id: 'batch', label: 'Batch', icon: Activity },
  { id: 'settings', label: 'Podešavanja', icon: SettingsIcon },
];


export function AppShell() {
  const [activeTab, setActiveTab] = useState<MainTab>('download');
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [apiStatus, setApiStatus] = useState<ApiStatus>('checking');
  const [lastChecked, setLastChecked] = useState<number | null>(null);

  useEffect(() => {
    try {
      const saved = localStorage.getItem('app:activeTab');
      if (saved && ['download', 'queue', 'history', 'batch', 'settings'].includes(saved)) {
        setActiveTab(saved as MainTab);
      }
    } catch {
      /* ignore */
    }

    const handleTabChange = (event: Event) => {
      try {
        const detail = (event as CustomEvent<MainTab>).detail;
        if (detail) setActiveTab(detail);
      } catch {
        /* ignore */
      }
    };

    window.addEventListener('pumpaj:active-tab', handleTabChange);
    return () => {
      window.removeEventListener('pumpaj:active-tab', handleTabChange);
    };
  }, []);

  useEffect(() => {
    let disposed = false;
    let consecutive401 = 0;

    const fetchStatus = async () => {
      // Health
      try {
  const health = await fetch(apiUrl('/health'), { cache: 'no-store' });
        if (!disposed) {
          setApiStatus(health.ok ? 'online' : 'offline');
          setLastChecked(Date.now());
        }
      } catch {
        if (!disposed) setApiStatus('offline');
      }

      // Metrics (zahtev traži auth token ako je korisnik prijavljen)
      try {
        const supabase = getSupabase();
        let token: string | undefined;
        if (supabase) {
          const { data } = await supabase.auth.getSession();
          token = data.session?.access_token || undefined;
        }
        if (!token) {
          // nema tokena => preskačemo metrics i resetujemo brojač 401
          consecutive401 = 0;
          return;
        }
  const res = await fetch(apiUrl('/api/jobs/metrics'), {
          cache: 'no-store',
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (res.ok) {
          const data = await res.json();
          if (!disposed) {
            setMetrics({
              running: Number(data.running || 0),
              queued: Number(data.queued || 0),
              maxConcurrent: typeof data.maxConcurrent === 'number' ? data.maxConcurrent : undefined,
            });
          }
          consecutive401 = 0;
        } else if (res.status === 401) {
          consecutive401++;
          // After 3 consecutive unauthorized responses, slow down polling for metrics
          if (consecutive401 >= 3) {
            return; // leave health polling intact; metrics will retry on next interval after user logs in
          }
        }
      } catch {
        /* metrics mogu da padnu bez kvara UI-a */
      }
    };

    fetchStatus();
    const id = window.setInterval(fetchStatus, 7000);
    return () => {
      disposed = true;
      window.clearInterval(id);
    };
  }, []);

  const statusLabel = useMemo(() => {
    if (apiStatus === 'checking') return 'Proveravam…';
    if (apiStatus === 'online') return 'Server online';
    return 'Server offline';
  }, [apiStatus]);

  const StatusIcon = apiStatus === 'online' ? WifiIcon : WifiOff;

  const navigate = (target: MainTab) => {
    try {
      window.dispatchEvent(new CustomEvent('navigate-main-tab', { detail: target }));
      setActiveTab(target);
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="relative min-h-screen text-white">
      <header className="sticky top-0 z-40 border-b border-white/10 bg-slate-950/70 backdrop-blur-xl">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-6 py-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-rose-500 to-purple-500 shadow-lg shadow-rose-500/40">
              <img src="/pumpaj-logo.svg" alt="Pumpaj" className="h-7 w-7" />
            </div>
            <div>
              <div className="text-lg font-semibold">Pumpaj Web</div>
              <div className="text-xs text-slate-300/70">Supabase bridge · yt-dlp backend</div>
            </div>
            <span
              className={`ml-3 inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium ${
                apiStatus === 'online'
                  ? 'border border-emerald-400/40 bg-emerald-500/15 text-emerald-100'
                  : apiStatus === 'checking'
                  ? 'border border-slate-400/40 bg-slate-500/15 text-slate-100'
                  : 'border border-rose-400/40 bg-rose-500/15 text-rose-100'
              }`}
            >
              <StatusIcon className="h-3.5 w-3.5" />
              <span>{statusLabel}</span>
            </span>
          </div>

          <nav className="flex flex-wrap gap-2">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const active = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => navigate(tab.id)}
                  className={`flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition ${
                    active
                      ? 'bg-gradient-to-r from-rose-500 to-purple-500 shadow-lg shadow-rose-500/30'
                      : 'border border-white/10 bg-white/5 text-slate-200 hover:border-white/20 hover:bg-white/10'
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {tab.label}
                </button>
              );
            })}
          </nav>

          <div className="flex flex-wrap items-center gap-3">
            {metrics && (
              <div className="flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-4 py-2 text-xs text-slate-100">
                <span className="inline-flex items-center gap-1 text-emerald-200">
                  <Activity className="h-3.5 w-3.5" />
                  {metrics.running} aktivnih
                </span>
                <span className="inline-flex items-center gap-1 text-sky-200">
                  <ListChecks className="h-3.5 w-3.5" />
                  {metrics.queued} u redu
                </span>
                {typeof metrics.maxConcurrent === 'number' && (
                  <span className="hidden items-center gap-1 text-amber-200 sm:inline-flex">
                    Max {metrics.maxConcurrent}
                  </span>
                )}
              </div>
            )}
            <UserBadge />
          </div>
        </div>
        {lastChecked && (
          <div className="border-t border-white/5 bg-slate-950/60 px-6 py-2 text-center text-[11px] text-slate-400">
            Poslednja provera: {new Date(lastChecked).toLocaleTimeString()}
          </div>
        )}
      </header>

      {/* Upozorenje ako API_BASE nije setovan (pomaže kod 404 ka Vercel /api) */}
      {!API_BASE && (
        <div className="bg-amber-600/20 text-amber-100 border-b border-amber-400/30 text-xs px-4 py-2 text-center">
          API_BASE nije eksplicitno postavljen (NEXT_PUBLIC_API ili ?apiBase=). Ako vidiš 404 na /api/* rutama, dodaj ?apiBase=https://tvoj-backend.up.railway.app ili postavi env varijablu.
        </div>
      )}
      <main className="pt-6 lg:pt-10 space-y-6">
        <ApiBaseOverride />
        <DesktopApp />
        {activeTab === 'settings' && (
          <>
            <HealthPanel />
            <LogViewer />
          </>
        )}
      </main>
    </div>
  );
}
