'use client';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabaseClient';
import type { AuthChangeEvent, Session } from '@supabase/supabase-js';
import { postJSON, downloadJobFile } from '@/lib/api';

export default function DownloaderDemo() {
  const [url, setUrl] = useState('');
  const [title, setTitle] = useState('video');
  const [jobId, setJobId] = useState<string | null>(null);
  const [progress, setProgress] = useState<number>(0);
  const [stage, setStage] = useState<string>('idle');
  const [token, setToken] = useState<string>('');

  useEffect(() => {
    supabase.auth.getSession().then(({ data }: { data: { session: Session | null } }) => {
      const t = data.session?.access_token;
      if (t) setToken(t);
    });
    const sub = supabase.auth.onAuthStateChange((_e: AuthChangeEvent, session: Session | null) => {
      setToken(session?.access_token || '');
    });
    return () => { sub.data.subscription.unsubscribe(); };
  }, []);

  async function startJob() {
    setProgress(0); setStage('queued'); setJobId(null);
    const resp = await postJSON<{id:string}>('/api/job/start/best', { url, title });
    setJobId(resp.id);
  const headers: Record<string,string> = token ? { Authorization: `Bearer ${token}` } : {};
    const endpoint = `${process.env.NEXT_PUBLIC_API}/api/progress/${resp.id}`;
    const { sseSubscribe } = await import('@/utils/sseFetch');
    sseSubscribe(endpoint, headers,
      (msg) => {
        if (typeof msg.progress === 'number') setProgress(msg.progress);
        if (msg.stage) setStage(msg.stage);
      },
      (_end) => { setStage('ended'); setProgress(100); }
    ).catch(() => setStage('error'));
  }

  return (
    <div className="max-w-xl mx-auto p-4 space-y-3">
      <div className="flex gap-2 justify-end">
        <a href="/login" className="text-blue-600 underline">Login</a>
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
    </div>
  );
}
