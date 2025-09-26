'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { AppShell } from '@/components/AppShell';
import { SupabaseTokenBridge } from '@/components/SupabaseTokenBridge';
import { ErrorBoundary } from '../../src/components/ErrorBoundary';
import { SettingsProvider } from '../../src/components/SettingsContext';
import { ToastProvider } from '../../src/components/ToastProvider';
import { AuthProvider } from '../../src/components/AuthProvider';
import { initRandomSingleBounce } from '../../src/lib/singleBounce';

function AttentionAnimator() {
  useEffect(() => {
    const dispose = initRandomSingleBounce('.attention-icon', 3200);
    return () => dispose();
  }, []);
  return null;
}

function LoadingState() {
  return (
    <div className="relative min-h-screen">
      <div className="pointer-events-none absolute inset-0 opacity-40">
        <div className="absolute left-10 top-20 h-52 w-52 rounded-full bg-purple-500/40 blur-3xl" />
        <div className="absolute right-12 bottom-24 h-60 w-60 rounded-full bg-rose-500/35 blur-3xl" />
      </div>
      <div className="relative z-10 flex min-h-screen flex-col items-center justify-center gap-6 px-6 text-center text-white">
  <div className="h-16 w-16 animate-spin rounded-full border-2 border-white/20 border-t-rose-400" />
        <div className="max-w-md text-lg font-medium">
          Povezivanje sa Supabase nalogom…
        </div>
        <p className="max-w-lg text-sm text-slate-200/70">
          Usklađujemo web sesiju i pripremamo Pumpaj interfejs. Ovo obično traje samo nekoliko sekundi.
        </p>
      </div>
    </div>
  );
}

function SignInPrompt() {
  return (
    <div className="relative min-h-screen">
      <div className="pointer-events-none absolute inset-0 opacity-40">
        <div className="absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-white/10 via-transparent" />
      </div>
      <div className="relative z-10 flex min-h-screen flex-col items-center justify-center px-6 text-center">
        <div className="max-w-xl rounded-[32px] border border-white/15 bg-white/5 p-12 text-white shadow-[0_45px_95px_rgba(15,23,42,0.55)] backdrop-blur-xl">
          <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-3xl bg-gradient-to-br from-rose-500 to-purple-600 shadow-lg shadow-rose-500/35">
            <img src="/pumpaj-logo.svg" alt="Pumpaj" className="h-10 w-10" />
          </div>
          <h1 className="text-3xl font-semibold tracking-tight">Prijava je potrebna</h1>
          <p className="mt-4 text-sm text-slate-200/75">
            Pumpaj Web koristi Supabase autentifikaciju. Nakon prijave, tvoj Supabase token se automatski premošćava na Express server koji pokreće Pumpaj desktop funkcije u pregledaču.
          </p>
          <div className="mt-8 flex flex-col items-center gap-3">
            <Link
              href="/login"
              className="inline-flex items-center justify-center rounded-full bg-gradient-to-r from-rose-500 to-purple-500 px-6 py-3 text-sm font-semibold text-white shadow-[0_18px_45px_rgba(244,63,94,0.45)] transition hover:from-rose-400 hover:to-purple-400"
            >
              Idi na prijavu
            </Link>
            <span className="text-xs text-slate-200/60">
              Nemaš nalog? Registruj se u dva koraka, direktno na login strani.
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function HomePage() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);

  const handleSessionResolved = (next: Session | null) => {
    setSession(next ?? null);
  };

  const content = session === undefined
    ? <LoadingState />
    : session
      ? <AppShell />
      : <SignInPrompt />;

  return (
    <ErrorBoundary>
      <AuthProvider>
        <SupabaseTokenBridge onSessionResolved={handleSessionResolved} />
        <SettingsProvider>
          <ToastProvider>
            <AttentionAnimator />
            {content}
          </ToastProvider>
        </SettingsProvider>
      </AuthProvider>
    </ErrorBoundary>
  );
}
