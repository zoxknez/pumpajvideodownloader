'use client';

import { useEffect } from 'react';
import type { Session } from '@supabase/supabase-js';
import { getSupabase } from '@/lib/supabaseClient';
import { useAuth } from '../../src/components/AuthProvider';

type SupabaseTokenBridgeProps = {
  onSessionResolved?: (session: Session | null) => void;
};

export function SupabaseTokenBridge({ onSessionResolved }: SupabaseTokenBridgeProps) {
  const { setToken } = useAuth();

  useEffect(() => {
    const supabase = getSupabase();
    let mounted = true;

    const applySession = (session: Session | null) => {
      if (!mounted) return;
      const token = session?.access_token || null;
      try {
        if (token) {
          localStorage.setItem('app:token', token);
          setToken(token);
        } else {
          localStorage.removeItem('app:token');
          setToken(null);
        }
      } catch {
        // ignore storage failures (private mode, etc.)
      }
      onSessionResolved?.(session);
    };

    supabase.auth.getSession().then(({ data }) => applySession(data.session ?? null));
    const { data: subscription } = supabase.auth.onAuthStateChange((_event, session) => applySession(session));

    const handleAppLogout = () => {
      supabase.auth.signOut().catch(() => {});
      applySession(null);
    };

    window.addEventListener('pumpaj:auth:logout', handleAppLogout);

    return () => {
      mounted = false;
      subscription.subscription.unsubscribe();
      window.removeEventListener('pumpaj:auth:logout', handleAppLogout);
    };
  }, [onSessionResolved, setToken]);

  return null;
}
