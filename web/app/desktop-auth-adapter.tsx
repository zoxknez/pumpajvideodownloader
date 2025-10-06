'use client';

/**
 * Desktop Auth Adapter
 * Maps desktop AuthProvider API to web Supabase AuthProvider
 */

import React, { createContext, useContext, useMemo } from 'react';
import { useAuth as useSupabaseAuth } from '@/components/AuthProvider';

// Desktop types (from deskkgui/src/components/AuthProvider.tsx)
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

type User = { id: string; email?: string; username?: string; plan: Plan } | null;
type LoginPayload = { username: string; password: string };
type RegisterPayload = { username: string; password: string; email?: string };

const POLICY_PREMIUM: Policy = {
  plan: 'PREMIUM',
  maxHeight: 4320,
  maxAudioKbps: 320,
  playlistMax: 300,
  batchMax: 10,
  concurrentJobs: 4,
  allowSubtitles: true,
  allowChapters: true,
  allowMetadata: true,
};

type AuthCtx = {
  me: User;
  policy: Policy | null;
  token: string | null;
  loading: boolean;
  login: (payload: LoginPayload) => Promise<void>;
  register: (payload: RegisterPayload) => Promise<void>;
  logout: () => Promise<void>;
  setToken: (value: string | null) => void;
};

const DesktopAuthContext = createContext<AuthCtx | null>(null);

/**
 * Desktop Auth Provider - wraps Supabase auth
 */
export function DesktopAuthProvider({ children }: { children: React.ReactNode }) {
  const supabaseAuth = useSupabaseAuth();

  const desktopAuthValue = useMemo<AuthCtx>(() => {
    // Map Supabase user to desktop user format
    const me: User | null = supabaseAuth.me ? {
      id: supabaseAuth.me.id,
      email: supabaseAuth.me.email || '',
      username: supabaseAuth.me.username || supabaseAuth.me.email || '',
      plan: (supabaseAuth.me.plan as Plan) || 'FREE',
    } : null;

    return {
      me,
      policy: me ? POLICY_PREMIUM : null,
      token: null, // Web uses Supabase session, not custom token
      loading: supabaseAuth.loading,
      login: async () => {
        // Desktop login not used in web (Supabase OAuth)
        console.warn('Desktop login() not implemented - use Supabase OAuth');
      },
      register: async () => {
        // Desktop register not used in web
        console.warn('Desktop register() not implemented - use Supabase');
      },
      logout: supabaseAuth.logout,
      setToken: () => {
        // Not used in web
      },
    };
  }, [supabaseAuth]);

  return (
    <DesktopAuthContext.Provider value={desktopAuthValue}>
      {children}
    </DesktopAuthContext.Provider>
  );
}

/**
 * Desktop useAuth hook - compatible with desktop components
 */
export function useAuth(): AuthCtx {
  const ctx = useContext(DesktopAuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within DesktopAuthProvider');
  }
  return ctx;
}

/**
 * Desktop usePolicy hook
 */
export function usePolicy(): Policy | null {
  const { policy } = useAuth();
  return policy;
}
