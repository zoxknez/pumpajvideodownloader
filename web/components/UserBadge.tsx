'use client';

import { useState } from 'react';
import { LogOut, Settings } from 'lucide-react';
import { useAuth } from '@/components/AuthProvider';

export function UserBadge() {
  const { me, logout } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  if (!me) return null;

  const initials = (me.username || me.email || me.id || '?')
    .split(/\s+/)
    .map((part) => part[0]?.toUpperCase())
    .join('')
    .slice(0, 2);

  const handleLogout = async () => {
    if (busy) return;
    setBusy(true);
    try {
      logout();
    } finally {
      setBusy(false);
      setMenuOpen(false);
    }
  };

  const openSettings = () => {
    try {
      window.dispatchEvent(new CustomEvent('navigate-main-tab', { detail: 'settings' }));
      setMenuOpen(false);
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setMenuOpen((prev) => !prev)}
        className="flex items-center gap-3 rounded-full border border-white/15 bg-white/10 px-4 py-2 text-sm font-medium text-white shadow-lg shadow-slate-950/40 backdrop-blur"
      >
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-purple-500 to-blue-600 text-sm font-semibold text-white">
          {initials}
        </span>
        <span className="text-left">
          <span className="block text-xs text-slate-200/70">{me.plan ?? 'FREE'}</span>
          <span className="block text-sm font-semibold text-white truncate max-w-[160px]">
            {me.username || me.email || 'Korisnik'}
          </span>
        </span>
      </button>

      {menuOpen && (
        <div className="absolute right-0 mt-3 w-60 rounded-2xl border border-white/10 bg-slate-950/95 p-3 text-sm text-white shadow-2xl shadow-slate-950/50 backdrop-blur">
          <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 px-3 py-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-purple-600 text-base font-semibold">
              {initials}
            </div>
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold text-white">{me.username || me.email || 'Korisnik'}</div>
              {me.email && <div className="truncate text-xs text-slate-300/80">{me.email}</div>}
            </div>
          </div>

          <button
            type="button"
            onClick={openSettings}
            className="mt-3 flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-slate-200 hover:bg-white/10"
          >
            <Settings className="h-4 w-4" />
            Podešavanja
          </button>

          <button
            type="button"
            onClick={handleLogout}
            disabled={busy}
            className="mt-2 flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-rose-200 hover:bg-rose-500/15 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <LogOut className="h-4 w-4" />
            {busy ? 'Odjava…' : 'Odjavi se'}
          </button>
        </div>
      )}
    </div>
  );
}
