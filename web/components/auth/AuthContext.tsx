'use client';

/* eslint-disable react-refresh/only-export-components */
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';

import { API_BASE } from '../../lib/api';
import { getSupabase } from '../../lib/supabaseClient';

export type Plan = 'FREE' | 'PREMIUM';

export type Policy = {
  plan: Plan;
  maxHeight: number;
  maxAudioKbps: number;
  playlistMax: number;
  batchMax: number;
  concurrentJobs: number;
  allowSubtitles: boolean;
  allowChapters: boolean;
  allowMetadata: boolean;
  speedLimitKbps?: number;
};

export type AppUser = {
  id: string;
  email?: string;
  username?: string;
  plan: Plan;
  guest?: boolean;
};

export type User = AppUser | null;

type LoginPayload = { username: string; password: string };
type RegisterPayload = { username: string; password: string; email?: string };

type AuthCtx = {
  me: User;
  policy: Policy | null;
  token: string | null;
  loading: boolean;
  login: (payload: LoginPayload) => Promise<void>;
  register: (payload: RegisterPayload) => Promise<void>;
  loginGuest: () => Promise<void>;
  logout: () => Promise<void>;
  setToken: (value: string | null) => void;
};

const POLICY_DEFAULTS: Record<Plan, Policy> = {
  FREE: {
    plan: 'FREE',
    maxHeight: 720,
    maxAudioKbps: 128,
    playlistMax: 10,
    batchMax: 2,
    concurrentJobs: 1,
    allowSubtitles: false,
    allowChapters: false,
    allowMetadata: false,
  },
  PREMIUM: {
    plan: 'PREMIUM',
    maxHeight: 4320,
    maxAudioKbps: 320,
    playlistMax: 300,
    batchMax: 10,
    concurrentJobs: 4,
    allowSubtitles: true,
    allowChapters: true,
    allowMetadata: true,
  },
};

const AuthContext = createContext<AuthCtx | null>(null);

type StoredToken = {
  token: string | null;
  setToken: (value: string | null) => void;
};

function useStoredToken(isBrowser: boolean): StoredToken {
  const [token, setTokenState] = useState<string | null>(() => {
    if (!isBrowser) return null;
    try {
      return localStorage.getItem('app:token');
    } catch {
      return null;
    }
  });

  const setToken = useCallback(
    (value: string | null) => {
      setTokenState(value);
      if (!isBrowser) return;
      try {
        if (value) localStorage.setItem('app:token', value);
        else localStorage.removeItem('app:token');
      } catch {
        // ignore storage errors
      }
    },
    [isBrowser],
  );

  return { token, setToken };
}

type SupabaseBridgeConfig = {
  onSignedIn: (user: AppUser) => void;
  onSignedOut: () => void;
  onError: (error: unknown) => void;
  setLoading: (value: boolean) => void;
};

function useSupabaseAuthBridge({ onSignedIn, onSignedOut, onError, setLoading }: SupabaseBridgeConfig) {
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    const supabase = getSupabase();
    if (!supabase) {
      setChecked(true);
      return;
    }

    let cancelled = false;

    const checkSession = async () => {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (!cancelled && session?.user) {
          onSignedIn(supabaseUserToUser(session.user));
          setLoading(false);
          setChecked(true);
          return;
        }
      } catch (err) {
        if (!cancelled) onError(err);
      }

      if (!cancelled) setChecked(true);
    };

    checkSession();

    return () => {
      cancelled = true;
    };
  }, [onError, onSignedIn, setLoading]);

  useEffect(() => {
    const supabase = getSupabase();
    if (!supabase) return;

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' && session?.user) {
        onSignedIn(supabaseUserToUser(session.user));
        setLoading(false);
      } else if (event === 'SIGNED_OUT') {
        onSignedOut();
      } else if (event === 'INITIAL_SESSION' && session?.user) {
        onSignedIn(supabaseUserToUser(session.user));
        setLoading(false);
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [onSignedIn, onSignedOut, setLoading]);

  return checked;
}

type DesktopBridgeConfig = {
  isIpc: boolean;
  setMe: React.Dispatch<React.SetStateAction<User>>;
  setPolicy: React.Dispatch<React.SetStateAction<Policy | null>>;
  setLoading: (value: boolean) => void;
};

function useDesktopBridge({ isIpc, setMe, setPolicy, setLoading }: DesktopBridgeConfig) {
  useEffect(() => {
    if (!isIpc) return;

    let cancelled = false;
    setLoading(true);

    (async () => {
      try {
        const result = await (window as any).api?.auth?.whoami?.();
        if (cancelled) return;

        if (result?.ok && result.user) {
          const user = normalizeUser(result.user);
          setMe(user);
          setPolicy(user ? derivePolicy(user.plan) : null);
        } else {
          setMe(null);
          setPolicy(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    const unsubscribe = (window as any).api?.auth?.onState?.((payload: any) => {
      if (cancelled) return;
      const user = normalizeUser(payload?.user) || null;
      setMe(user);
      setPolicy(user ? derivePolicy(user.plan) : null);
    });

    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [isIpc, setLoading, setMe, setPolicy]);
}

type BackendBridgeConfig = {
  enabled: boolean;
  token: string | null;
  supabaseChecked: boolean;
  me: User;
  fetchMeBearer: (token: string) => Promise<void>;
  fetchMeCookie: () => Promise<void>;
  clearUser: () => void;
  setLoading: (value: boolean) => void;
};

function useBackendAuth({
  enabled,
  token,
  supabaseChecked,
  me,
  fetchMeBearer,
  fetchMeCookie,
  clearUser,
  setLoading,
}: BackendBridgeConfig) {
  useEffect(() => {
    if (!enabled) return;
    if (!supabaseChecked) return;

    let cancelled = false;

    if (me) {
      setLoading(false);
      return;
    }

    const run = async () => {
      setLoading(true);
      try {
        if (token) await fetchMeBearer(token);
        else await fetchMeCookie();
      } catch {
        if (!cancelled) clearUser();
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    run();

    return () => {
      cancelled = true;
    };
  }, [enabled, supabaseChecked, me, token, fetchMeBearer, fetchMeCookie, clearUser, setLoading]);
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const isBrowser = typeof window !== 'undefined';
  const isIpc = isBrowser && Boolean((window as any).api?.auth);

  const { token, setToken } = useStoredToken(isBrowser);

  const [me, setMe] = useState<User>(null);
  const [policy, setPolicy] = useState<Policy | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  const applyUser = useCallback((data: any) => {
    const user = normalizeUser(data?.user) || null;
    setMe(user);
    if (data?.policy) setPolicy(data.policy as Policy);
    else setPolicy(derivePolicy(user?.plan));
  }, []);

  const clearUser = useCallback(() => {
    setMe(null);
    setPolicy(null);
  }, []);

  const fetchMeBearer = useCallback(
    async (tok: string) => {
      const res = await fetch(`${API_BASE}/api/me`, {
        headers: { Authorization: `Bearer ${tok}` },
      });
      if (!res.ok) throw new Error('unauthorized');
      const data = await res.json();
      applyUser(data);
    },
    [applyUser],
  );

  const fetchMeCookie = useCallback(async () => {
    const res = await fetch(`${API_BASE}/api/me`, { credentials: 'include' });
    if (!res.ok) throw new Error('unauthorized');
    const data = await res.json();
    applyUser(data);
  }, [applyUser]);

  const handleSupabaseSignedIn = useCallback(
    (user: AppUser) => {
      setMe(user);
      setPolicy(POLICY_DEFAULTS.PREMIUM);
    },
    [],
  );

  const supabaseChecked = useSupabaseAuthBridge({
    onSignedIn: handleSupabaseSignedIn,
    onSignedOut: clearUser,
    onError: (err) => {
      console.error('Supabase session check error:', err);
    },
    setLoading,
  });

  useDesktopBridge({ isIpc, setMe, setPolicy, setLoading });

  useBackendAuth({
    enabled: !isIpc,
    token,
    supabaseChecked,
    me,
    fetchMeBearer,
    fetchMeCookie,
    clearUser,
    setLoading,
  });

  const login = useCallback(
    async ({ username, password }: LoginPayload) => {
      const name = String(username || '').trim();
      const pwd = String(password || '');
      if (!name || !pwd) throw new Error('missing_credentials');

      if (isIpc) {
        const result = await (window as any).api?.auth?.login?.({ username: name, password: pwd });
        if (!result?.ok) throw new Error(result?.error || 'login_failed');
        const user = normalizeUser(result.user);
        setMe(user);
        setPolicy(derivePolicy(user?.plan));
        try {
          localStorage.setItem('app:lastUsername', name);
        } catch {
          // ignore storage errors
        }
        return;
      }

      const res = await fetch(authUrl('/login'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ username: name, password: pwd }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error || `login_failed_${res.status}`);
      }

      const data = await res.json().catch(() => ({}));
      if (data?.token) {
        setToken(data.token);
        await fetchMeBearer(data.token);
      } else {
        await fetchMeCookie();
      }
      try {
        localStorage.setItem('app:lastUsername', name);
      } catch {
        // ignore storage errors
      }
    },
    [isIpc, fetchMeBearer, fetchMeCookie, setToken],
  );

  const loginGuest = useCallback(async () => {
    if (isIpc) {
      const api = (window as any).api?.auth;
      if (!api?.guest) throw new Error('guest_not_supported');
      const result = await api.guest();
      if (!result?.ok) throw new Error(result?.error || 'guest_failed');
      const user = normalizeUser(result.user);
      setMe(user);
      setPolicy(user ? derivePolicy(user.plan) : null);
      if (result.token) setToken(result.token);
      return;
    }

    const res = await fetch(authUrl('/guest'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data?.error || `guest_failed_${res.status}`);
    }

    const data = await res.json().catch(() => ({}));
    if (data?.token) setToken(data.token);
    if (data?.user || data?.policy) {
      applyUser(data);
      return;
    }
    if (data?.token) {
      await fetchMeBearer(data.token);
    } else {
      await fetchMeCookie();
    }
  }, [isIpc, setToken, applyUser, fetchMeBearer, fetchMeCookie]);

  const register = useCallback(
    async ({ username, password, email }: RegisterPayload) => {
      const name = String(username || '').trim();
      const mail = email ? String(email).trim() : undefined;
      const pwd = String(password || '');
      if (!name || !pwd) throw new Error('missing_credentials');
      if (pwd.length < 6) throw new Error('password_too_short');

      if (isIpc) {
        const result = await (window as any).api?.auth?.register?.({ username: name, password: pwd, email: mail });
        if (!result?.ok) throw new Error(result?.error || 'register_failed');
        await login({ username: name, password: pwd });
        if (mail) {
          try {
            localStorage.setItem('app:lastEmail', mail);
          } catch {
            // ignore storage errors
          }
        }
        return;
      }

      const res = await fetch(authUrl('/register'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ username: name, password: pwd, email: mail }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error || `register_failed_${res.status}`);
      }

      const data = await res.json().catch(() => ({}));
      if (data?.token) {
        setToken(data.token);
        await fetchMeBearer(data.token);
      } else {
        await login({ username: name, password: pwd });
      }

      try {
        localStorage.setItem('app:lastUsername', name);
        if (mail) localStorage.setItem('app:lastEmail', mail);
      } catch {
        // ignore storage errors
      }
    },
    [isIpc, login, fetchMeBearer, setToken],
  );

  const logout = useCallback(async () => {
    const supabase = getSupabase();
    if (supabase) {
      try {
        await supabase.auth.signOut();
      } catch (err) {
        console.error('Supabase logout error:', err);
      }
    }

    if (isIpc) {
      try {
        await (window as any).api?.auth?.logout?.();
      } catch {
        // ignore desktop logout errors
      }
    } else {
      try {
        await fetch(authUrl('/logout'), { method: 'POST', credentials: 'include' });
      } catch {
        // ignore network errors
      }
    }

    setToken(null);
    clearUser();
  }, [isIpc, setToken, clearUser]);

  const value = useMemo(
    () => ({ me, policy, token, loading, login, register, loginGuest, logout, setToken }),
    [me, policy, token, loading, login, register, loginGuest, logout, setToken],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

export function usePolicy(defaultPlan: Plan = 'PREMIUM') {
  const { policy } = useAuth();
  return policy ?? POLICY_DEFAULTS[defaultPlan];
}

export function derivePolicy(plan: Plan | null | undefined): Policy {
  return POLICY_DEFAULTS[plan === 'FREE' ? 'FREE' : 'PREMIUM'];
}

export function normalizeUser(raw: any): User {
  if (!raw) return null;
  const plan: Plan = raw.plan === 'FREE' ? 'FREE' : 'PREMIUM';
  return {
    id: String(raw.id ?? 'me'),
    email: raw.email || undefined,
    username: raw.username || undefined,
    plan,
    guest: raw.guest ? Boolean(raw.guest) : undefined,
  };
}

export const authUrl = (path: string) => {
  const suffix = path.startsWith('/') ? path : `/${path}`;
  return `${API_BASE}/auth${suffix}`;
};

function supabaseUserToUser(sessionUser: { id: string; email?: string | null }): AppUser {
  return {
    id: sessionUser.id,
    email: sessionUser.email ?? undefined,
    username: sessionUser.email?.split('@')[0] || 'user',
    plan: 'PREMIUM',
  };
}
