'use client';
import { useEffect, useState } from 'react';
import { getSupabase } from '@/lib/supabaseClient';
import { useRouter } from 'next/navigation';

type Mode = 'login' | 'register';

export default function Login() {
  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const router = useRouter();
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

  async function onSubmit() {
    setLoading(true);
    setMessage('');
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
        setMessage('Proveri e-mail za potvrdu naloga. Nakon potvrde, prijavi se.');
        setMode('login');
      }
    } catch (err: any) {
      setMessage(err?.message || 'Došlo je do greške.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-sm mx-auto p-6 space-y-4">
      <h1 className="text-xl font-semibold text-center">{mode === 'login' ? 'Prijava' : 'Registracija'}</h1>
      <input
        className="w-full border rounded p-2"
        placeholder="Email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        type="email"
        autoComplete="email"
      />
      <input
        className="w-full border rounded p-2"
        type="password"
        placeholder="Lozinka"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
      />
      {mode === 'register' && (
        <input
          className="w-full border rounded p-2"
          type="password"
          placeholder="Potvrdi lozinku"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          autoComplete="new-password"
        />
      )}
      <button
        className="px-4 py-2 rounded bg-blue-600 text-white w-full disabled:opacity-70"
        onClick={onSubmit}
        disabled={loading}
      >
        {loading ? 'Obrada…' : mode === 'login' ? 'Prijavi se' : 'Registruj se'}
      </button>
      <button
        type="button"
        className="w-full text-sm text-blue-600 underline"
        onClick={() => {
          setMode(mode === 'login' ? 'register' : 'login');
          setMessage('');
        }}
      >
        {mode === 'login' ? 'Nemaš nalog? Registruj se.' : 'Već imaš nalog? Prijavi se.'}
      </button>
      {message && <div className="text-sm text-center text-orange-600">{message}</div>}
    </div>
  );
}
