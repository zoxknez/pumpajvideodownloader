"use client";
import { useEffect, useRef, useState } from 'react';
import { getSupabase } from '@/lib/supabaseClient';
import type { AuthChangeEvent, Session } from '@supabase/supabase-js';
import { postJSON, downloadJobFile } from '@/lib/api';

export default function DownloaderDemo() {
  const [url, setUrl] = useState('');
  const [title, setTitle] = useState('video');
  const [jobId, setJobId] = useState<string | null>(null);
  const [progress, setProgress] = useState<number>(0);
  const [stage, setStage] = useState<string>('idle');
  const [token, setToken] = useState<string>('');
  const [session, setSession] = useState<Session | null>(null);
  const [message, setMessage] = useState('');
  const sseRef = useRef<{ close: () => void } | null>(null);

  useEffect(() => {
    const supabase = getSupabase();
    supabase.auth.getSession().then(({ data }: { data: { session: Session | null } }) => {
      const sess = data.session;
      setSession(sess || null);
      if (sess?.access_token) setToken(sess.access_token);
    });
    const { data: subscription } = supabase.auth.onAuthStateChange((_e: AuthChangeEvent, sess: Session | null) => {
      setSession(sess || null);
      setToken(sess?.access_token || '');
      if (!sess) {
        setJobId(null);
        setStage('idle');
        setProgress(0);
      }
    });
    return () => {
      subscription.subscription.unsubscribe();
      sseRef.current?.close();
    };
  }, []);

  async function startJob() {
    if (!token) {
      setMessage('Morate biti prijavljeni.');
      return;
    }
    setMessage('');
    setProgress(0);
    setStage('queued');
    setJobId(null);
    sseRef.current?.close();
    let resp: { id: string };
    try {
      resp = await postJSON<{ id: string }>('/api/job/start/best', { url, title });
    } catch (err: any) {
      setStage('error');
      setMessage(err?.message || 'Pokretanje posla nije uspelo.');
      return;
    }
    setJobId(resp.id);
    const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
    const endpoint = `${process.env.NEXT_PUBLIC_API}/api/progress/${resp.id}`;
    const { sseSubscribe } = await import('@/utils/sseFetch');
    try {
      const handle = await sseSubscribe(
        endpoint,
        headers,
        (msg) => {
          if (typeof msg.progress === 'number') setProgress(msg.progress);
          if (msg.stage) setStage(msg.stage);
        },
        () => {
          setStage('ended');
          setProgress(100);
        }
      );
      sseRef.current = handle;
    } catch (err: any) {
      setStage('error');
      setMessage(err?.message || 'Greška u komunikaciji sa serverom.');
    }
  }

  async function logout() {
    try {
      setMessage('');
      sseRef.current?.close();
      const supabase = getSupabase();
      await supabase.auth.signOut();
    } catch (err: any) {
      setMessage(err?.message || 'Odjava nije uspela.');
    }
  }

  return (
    <div className="max-w-xl mx-auto p-4 space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-sm opacity-80">
          {session ? (
            <span>Prijavljeni: <strong>{session.user.email}</strong></span>
          ) : (
            <span className="text-red-600">Niste prijavljeni</span>
          )}
        </div>
        <div className="flex gap-2">
          {!session && (
            <a href="/login" className="text-blue-600 underline">Prijava / Registracija</a>
          )}
          {session && (
            <button className="px-3 py-1 rounded bg-gray-200 hover:bg-gray-300" onClick={logout}>Odjava</button>
          )}
        </div>
      </div>
      <input className="w-full border rounded p-2" placeholder="https://…" value={url} onChange={e=>setUrl(e.target.value)} />
      <input className="w-full border rounded p-2" placeholder="Naziv fajla bez ekstenzije" value={title} onChange={e=>setTitle(e.target.value)} />
      <div className="flex items-center gap-2">
        <button className="px-4 py-2 rounded bg-blue-600 text-white" onClick={startJob} disabled={!url || !token}>
          Start
        </button>
        <div className="text-sm opacity-80">Stage: {stage} | {Math.floor(progress)}%</div>
      </div>
      {jobId && stage === 'ended' && (
        <button className="px-4 py-2 rounded bg-green-600 text-white" onClick={()=>downloadJobFile(jobId)}>
          Download
        </button>
      )}
      {!token && <div className="text-sm text-red-600">Uloguj se da bi startovao job.</div>}
      {message && <div className="text-sm text-orange-600">{message}</div>}
    </div>
  );
}
