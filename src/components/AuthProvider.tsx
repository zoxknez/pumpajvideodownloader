/* eslint-disable react-refresh/only-export-components */
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { API_BASE } from '../lib/api';

 export type Plan = 'FREE' | 'PREMIUM';
 export type Policy = {
  plan: Plan; maxHeight: number; maxAudioKbps: number; playlistMax: number; batchMax: number; concurrentJobs: number;
  allowSubtitles: boolean; allowChapters: boolean; allowMetadata: boolean; speedLimitKbps?: number;
};
 type User = { id: string; email?: string; username?: string; plan: Plan } | null;

const POLICY_DEFAULTS: Record<Plan, Policy> = {
  FREE: { plan: 'FREE', maxHeight: 720, maxAudioKbps: 128, playlistMax: 10, batchMax: 2, concurrentJobs: 1, allowSubtitles: false, allowChapters: false, allowMetadata: false, speedLimitKbps: 1500 },
  PREMIUM: { plan: 'PREMIUM', maxHeight: 4320, maxAudioKbps: 320, playlistMax: 300, batchMax: 10, concurrentJobs: 4, allowSubtitles: true, allowChapters: true, allowMetadata: true },
};

type AuthCtx = {
  me: User;
  policy: Policy | null;
  token: string | null;
  login: (username: string, email: string) => Promise<void>;
  logout: () => void;
  setToken: (tok: string | null) => void;
};

const Ctx = createContext<AuthCtx | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null;
    try { return localStorage.getItem('app:token'); } catch { return null; }
  });
  const [me, setMe] = useState<User>(null);
  const [policy, setPolicy] = useState<Policy | null>(null);

  const fetchMe = useCallback(async (tok: string) => {
    const res = await fetch(`${API_BASE}/api/me`, { headers: { Authorization: `Bearer ${tok}` } });
    if (!res.ok) throw new Error('Unauthorized');
    const data = await res.json();
    const apiPolicy = data.policy as Policy | undefined;
    const serverPlan = (data.user?.plan === 'PREMIUM') ? 'PREMIUM' : 'FREE';
    const u: User = data.user
      ? {
          id: String(data.user.id || 'me'),
          email: data.user.email || undefined,
          username: data.user.username || undefined,
          plan: serverPlan,
        }
      : { id: 'me', plan: serverPlan };
    setMe(u);
  if (apiPolicy) setPolicy(apiPolicy);
  else setPolicy(POLICY_DEFAULTS[serverPlan]);
  }, []);

  useEffect(() => {
    if (!token) { setMe(null); setPolicy(null); return; }
    // Local token in IPC mode: token starting with 'local:' means offline login
    const isIpc = typeof (globalThis as any).window !== 'undefined' && (window as any).api;
    if (isIpc && token.startsWith('local:')) {
      const payload = token.slice('local:'.length) || '';
      let email: string | undefined;
      let username: string | undefined;
      if (payload.includes('|')) {
        const [rawName, rawEmail] = payload.split('|');
        try { username = decodeURIComponent(rawName || ''); } catch { username = rawName || ''; }
        try { email = decodeURIComponent(rawEmail || ''); } catch { email = rawEmail || ''; }
      } else {
        try { email = decodeURIComponent(payload); } catch { email = payload; }
      }
      if (username === '') username = undefined;
      if (email === '') email = undefined;
      setMe({ id: 'local', email, username, plan: 'FREE' });
  setPolicy(POLICY_DEFAULTS.FREE);
      return;
    }
        fetchMe(token).catch(() => {
          setToken(null);
          try { localStorage.removeItem('app:token'); } catch {}
        });
  }, [token, fetchMe]);

  const login = useCallback(async (username: string, email: string) => {
    const isIpc = typeof (globalThis as any).window !== 'undefined' && (window as any).api;
    const desiredUsername = String(username ?? '').trim();
    const desiredEmail = String(email ?? '').trim();
    const fallbackUsername = desiredUsername || `korisnik-${Date.now()}`;
    const fallbackEmail = desiredEmail || `user${Date.now()}@pumpaj.local`;
    if (isIpc) {
      const nameInputRaw = desiredUsername || prompt('Unesi korisničko ime') || '';
      const emailInputRaw = desiredEmail || prompt('Unesi email adresu') || '';
      const nameInput = nameInputRaw.trim() || fallbackUsername;
      const emailInput = emailInputRaw.trim() || fallbackEmail;
      const payload = `${encodeURIComponent(nameInput)}|${encodeURIComponent(emailInput)}`;
      const tok = `local:${payload}`;
  setToken(tok);
  try { localStorage.setItem('app:token', tok); } catch {}
  try { localStorage.setItem('app:lastUsername', nameInput); } catch {}
  try { localStorage.setItem('app:lastEmail', emailInput); } catch {}
      setMe({ id: 'local', email: emailInput || undefined, username: nameInput || undefined, plan: 'FREE' });
  setPolicy(POLICY_DEFAULTS.FREE);
      return;
    }
    // Web/server mode
    const res = await fetch(`${API_BASE}/auth/exchange`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: desiredUsername || fallbackUsername, email: desiredEmail || fallbackEmail }),
    });
    if (!res.ok) throw new Error('Login failed');
    const data = await res.json();
    setToken(data.token);
    try { localStorage.setItem('app:token', data.token); } catch {}
    try { localStorage.setItem('app:lastUsername', desiredUsername); } catch {}
    try { localStorage.setItem('app:lastEmail', desiredEmail); } catch {}
    await fetchMe(data.token);
  }, [fetchMe]);

  const logout = useCallback(() => {
    try {
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('pumpaj:auth:logout'));
      }
    } catch {}
    setToken(null); setMe(null); setPolicy(null);
    try { localStorage.removeItem('app:token'); } catch {}
  }, []);

  const value = useMemo(() => ({ me, policy, token, login, logout, setToken }), [me, policy, token, login, logout]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAuth must be used within AuthProvider');
  return v;
}

export function usePolicy(defaultPlan: Plan = 'FREE') {
  const { policy } = useAuth();
  return policy ?? POLICY_DEFAULTS[defaultPlan];
}

export function LoginGate({ children }: { children: React.ReactNode }) {
  const { me, login } = useAuth();
  const [username, setUsername] = useState<string>(() => {
    if (typeof window === 'undefined') return '';
    try { return localStorage.getItem('app:lastUsername') || ''; } catch { return ''; }
  });
  const [email, setEmail] = useState<string>(() => {
    if (typeof window === 'undefined') return '';
    try { return localStorage.getItem('app:lastEmail') || ''; } catch { return ''; }
  });
  const [error, setError] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const onSubmit = async () => {
    setError('');
    const name = String(username || '').trim();
    const em = String(email || '').trim();
    setLoading(true);
    try {
      await login(name, em);
    } catch {
      setError('Prijava nije uspela. Pokušaj ponovo.');
    } finally {
      setLoading(false);
    }
  };
  if (!me) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-blue-900 to-purple-900 p-4">
        <div className="w-full max-w-md bg-white/5 backdrop-blur-md rounded-2xl p-6 border border-white/10 shadow-xl">
          <h2 className="text-2xl font-bold text-white text-center mb-2">Prijava</h2>
          <p className="text-white/70 text-sm text-center mb-6">Unesi korisničko ime i email (može bilo šta) da nastaviš.</p>
          <div className="space-y-3">
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') onSubmit(); }}
              placeholder="korisničko ime"
              className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder-white/40 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/25 outline-none"
            />
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') onSubmit(); }}
              placeholder="email@domena.com"
              className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder-white/40 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/25 outline-none"
            />
            {error && <div className="text-red-300 text-sm bg-red-500/10 border border-red-500/30 rounded-xl px-3 py-2">{error}</div>}
            <button
              onClick={onSubmit}
              disabled={loading}
              className="w-full px-4 py-3 rounded-xl bg-gradient-to-r from-blue-600 to-purple-600 text-white font-medium hover:from-blue-500 hover:to-purple-500 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {loading ? 'Prijavljivanje…' : 'Prijavi se'}
            </button>
          </div>
        </div>
      </div>
    );
  }
  return <>{children}</>;
}

export function FeatureGuard({ children, plan = 'FREE', fallback }: { children: React.ReactNode; plan?: Plan; fallback?: React.ReactNode }) {
  const { policy } = useAuth();
  const currentPlan = policy?.plan ?? 'FREE';
  if (plan === 'FREE') return <>{children}</>;
  if (currentPlan === 'PREMIUM') return <>{children}</>;
  return <>{fallback ?? null}</>;
}
