'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getSupabase } from '@/lib/supabaseClient';

type Mode = 'login' | 'register';

export default function Login() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [messageTone, setMessageTone] = useState<'neutral' | 'success' | 'error'>('neutral');
  const [nextPath, setNextPath] = useState('/');

  useEffect(() => {
    const resolved = (() => {
      if (typeof window === 'undefined') return '/';
      const qs = new URLSearchParams(window.location.search);
      const n = qs.get('next');
      return n && n.startsWith('/') ? n : '/';
    })();
    setNextPath(resolved);
    const supabase = getSupabase();
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) router.replace(resolved);
    });
  }, [router]);

  const formTitle = mode === 'login' ? 'Dobrodošao nazad' : 'Kreiraj nalog';
  const formSubtitle = mode === 'login'
    ? 'Unesi e-mail i lozinku povezane sa Supabase nalogom.'
    : 'Popuni osnovne podatke i potvrdi registraciju preko e-maila.';

  const canSubmit = useMemo(() => {
    if (!email.trim() || !password.trim()) return false;
    if (mode === 'register') {
      return password.length >= 8 && password === confirm;
    }
    return true;
  }, [email, password, confirm, mode]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canSubmit || loading) return;
    setLoading(true);
    setMessage('');
    setMessageTone('neutral');
    const supabase = getSupabase();
    try {
      if (mode === 'login') {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        router.replace(nextPath);
      } else {
        if (password.length < 8) throw new Error('Lozinka mora imati najmanje 8 karaktera.');
        if (password !== confirm) throw new Error('Lozinke se ne poklapaju.');
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        setMode('login');
        setMessage('Uspešno! Proveri e-mail i potvrdi registraciju pre prve prijave.');
        setMessageTone('success');
        setPassword('');
        setConfirm('');
      }
    } catch (err: any) {
      setMessage(err?.message || 'Dogodila se greška prilikom obrade zahteva.');
      setMessageTone('error');
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async () => {
    if (!email.trim()) {
      setMessage('Unesi e-mail adresu da bismo poslali link za resetovanje.');
      setMessageTone('neutral');
      return;
    }
    setLoading(true);
    setMessage('');
    setMessageTone('neutral');
    try {
      const supabase = getSupabase();
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: typeof window === 'undefined' ? undefined : `${window.location.origin}/login`,
      });
      if (error) throw error;
      setMessage('Link za reset lozinke je poslat na uneti e-mail.');
      setMessageTone('success');
    } catch (err: any) {
      setMessage(err?.message || 'Ne možemo da pošaljemo reset link u ovom trenutku.');
      setMessageTone('error');
    } finally {
      setLoading(false);
    }
  };

  const switchMode = () => {
    setMode((prev) => (prev === 'login' ? 'register' : 'login'));
    setMessage('');
    setMessageTone('neutral');
  };

  return (
    <main className="relative min-h-screen overflow-hidden bg-gradient-to-br from-slate-950 via-blue-950 to-slate-950">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute top-[-10%] left-[-10%] h-[420px] w-[420px] rounded-full bg-pink-500/30 blur-[160px]" />
        <div className="absolute bottom-[-10%] right-[-5%] h-[480px] w-[480px] rounded-full bg-blue-500/25 blur-[180px]" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(148,163,246,0.08),transparent_55%)]" />
      </div>

      <div className="relative z-10 flex min-h-screen items-center justify-center px-6 py-12">
  <div className="w-full max-w-5xl grid gap-10 rounded-[36px] border border-white/10 bg-white/5 bg-clip-padding p-10 backdrop-blur-2xl md:grid-cols-[1.1fr_0.9fr]">
          <aside className="flex flex-col justify-between">
            <div className="space-y-8">
              <div className="inline-flex items-center gap-2 rounded-full border border-rose-400/40 bg-rose-400/10 px-4 py-1 text-sm font-semibold text-rose-100">
                Pumpaj Web • Supabase Auth
              </div>
              <div className="space-y-4">
                <img src="/pumpaj-logo.svg" alt="Pumpaj" className="w-20 drop-shadow-[0_35px_60px_rgba(244,63,94,0.45)]" />
                <h1 className="text-4xl font-bold leading-tight text-white">
                  Pristupi svom Pumpaj iskustvu direktno iz pregledača
                </h1>
                <p className="text-base leading-relaxed text-slate-200/80">
                  Uloguj se da bi se desktop funkcionalnosti sinhronizovale sa Supabase sesijom.
                  Sve što uradiš preuzima se preko istog backend-a kao i desktop aplikacija.
                </p>
              </div>
            </div>

            <ul className="space-y-3 text-sm text-slate-200/70">
              <li className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-emerald-400" />
                Sigurna prijava i token bridge ka Express serveru
              </li>
              <li className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-sky-400" />
                Isti UI/UX kao desktop izdanje, optimizovan za web
              </li>
              <li className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-amber-400" />
                Automatska sinhronizacija Supabase naloga i JWT tokena
              </li>
            </ul>
          </aside>

          <section className="flex flex-col justify-center rounded-[28px] border border-white/15 bg-slate-950/50 p-8 shadow-[0_25px_60px_rgba(15,23,42,0.55)]">
            <div className="mb-6 flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-semibold text-white">{formTitle}</h2>
                <p className="mt-1 text-sm text-slate-300/70">{formSubtitle}</p>
              </div>
              <button
                type="button"
                onClick={switchMode}
                className="text-sm font-medium text-rose-200 hover:text-rose-100"
              >
                {mode === 'login' ? 'Nemaš nalog? Registruj ga.' : 'Već postoji nalog? Prijavi se.'}
              </button>
            </div>

            <form className="space-y-5" onSubmit={handleSubmit}>
              <label className="block space-y-2">
                <span className="text-sm font-medium text-slate-200">E-mail</span>
                <input
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-white placeholder:text-slate-400 focus:border-rose-400 focus:ring-2 focus:ring-rose-400/40"
                  placeholder="korisnik@domena.com"
                />
              </label>

              <label className="block space-y-2">
                <span className="text-sm font-medium text-slate-200">Lozinka</span>
                <input
                  type="password"
                  required
                  autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-white placeholder:text-slate-400 focus:border-rose-400 focus:ring-2 focus:ring-rose-400/40"
                  placeholder={mode === 'login' ? '••••••••' : 'Najmanje 8 karaktera'}
                />
              </label>

              {mode === 'register' && (
                <label className="block space-y-2">
                  <span className="text-sm font-medium text-slate-200">Potvrdi lozinku</span>
                  <input
                    type="password"
                    required
                    autoComplete="new-password"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-white placeholder:text-slate-400 focus:border-rose-400 focus:ring-2 focus:ring-rose-400/40"
                    placeholder="Ponovi lozinku"
                  />
                </label>
              )}

              {mode === 'login' && (
                <button
                  type="button"
                  className="text-left text-sm font-medium text-sky-200 hover:text-sky-100"
                  onClick={handleResetPassword}
                >
                  Zaboravljena lozinka? Pošalji link za reset.
                </button>
              )}

              {message && (
                <div
                  className={`rounded-2xl border px-4 py-3 text-sm ${
                    messageTone === 'error'
                      ? 'border-rose-500/40 bg-rose-500/15 text-rose-100'
                      : messageTone === 'success'
                      ? 'border-emerald-500/35 bg-emerald-500/15 text-emerald-100'
                      : 'border-slate-500/30 bg-slate-500/10 text-slate-100'
                  }`}
                >
                  {message}
                </div>
              )}

              <button
                type="submit"
                disabled={!canSubmit || loading}
                className="w-full rounded-2xl bg-gradient-to-r from-rose-500 to-purple-500 px-6 py-3 text-base font-semibold text-white shadow-[0_20px_45px_rgba(244,63,94,0.45)] transition hover:from-rose-400 hover:to-purple-400 disabled:cursor-not-allowed disabled:opacity-60 disabled:shadow-none"
              >
                {loading ? 'Obrada u toku…' : mode === 'login' ? 'Prijavi se' : 'Registruj nalog'}
              </button>
            </form>

            <p className="mt-6 text-center text-xs text-slate-400">
              Supabase koristi e-mail verifikaciju. Ako ne vidiš poruku, proveri spam ili pokušaj sa drugom adresom.
            </p>
          </section>
        </div>
      </div>
    </main>
  );
}
