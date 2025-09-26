"use client";
import { useEffect, useMemo, useRef, useState } from 'react';
import { getSupabase, isSupabaseConfigured } from '@/lib/supabaseClient';
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
  const supabaseEnabled = isSupabaseConfigured();
  const sseRef = useRef<{ close: () => void } | null>(null);

  const isWorking = useMemo(() => ['queued', 'running', 'processing', 'downloading'].includes(stage), [stage]);
  const stageLabel = useMemo(() => {
    const mapping: Record<string, string> = {
      idle: 'Idle • awaiting URL',
      queued: 'Queued • waiting for an available slot',
      running: 'Downloading • gathering chunks',
      processing: 'Processing • finishing touches',
      downloading: 'Downloading',
      ended: 'Finished • ready to download',
      error: 'Error',
    };
    return mapping[stage] ?? stage;
  }, [stage]);
  const canStart = Boolean(token && url.trim());

  useEffect(() => {
    if (!supabaseEnabled) {
      setMessage('Supabase autentikacija nije konfigurisana za web verziju. Obrati se administratoru ili koristi desktop aplikaciju.');
      setToken('');
      setSession(null);
      setStage('idle');
      return;
    }

    const supabase = getSupabase();
    if (!supabase) {
      setMessage('Supabase autentikacija nije dostupna.');
      return;
    }
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
  }, [supabaseEnabled]);

  async function startJob() {
    if (!supabaseEnabled) {
      setMessage('Web autentikacija nije dostupna. Molimo koristi desktop aplikaciju ili kontaktiraj podršku.');
      return;
    }
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
      if (!supabase) return;
      await supabase.auth.signOut();
    } catch (err: any) {
      setMessage(err?.message || 'Odjava nije uspela.');
    }
  }

  return (
    <div className="pumpaj-card">
      <section className="pumpaj-hero">
        <img src="/pumpaj-heart.svg" alt="Pumpaj" />
        <div>
          <h1 className="pumpaj-title">Pumpaj Media Downloader</h1>
          <p className="pumpaj-subtitle">
            Premium web companion za tvoje Railway backend procese. Analiziraj YouTube URL, isprati napredak u realnom vremenu
            i preuzmi gotove fajlove iz pregledača.
          </p>
        </div>
        <div className="pumpaj-status">
          <span>{session ? `Signed in as ${session.user.email}` : 'You are not signed in'}</span>
        </div>
        <div className="pumpaj-footer">
          {session ? (
            <button onClick={logout} className="pumpaj-button" style={{ padding: '0.7rem 1.8rem', width: 'fit-content' }}>
              Sign out
            </button>
          ) : (
            <a href="/login">Sign in to start a job</a>
          )}
        </div>
      </section>

      <section className="pumpaj-form" aria-live="polite">
        <label className="pumpaj-label">
          Video URL
          <input
            className="pumpaj-input"
            placeholder="https://www.youtube.com/watch?v=..."
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            inputMode="url"
          />
        </label>
        <label className="pumpaj-label">
          Output name (without extension)
          <input
            className="pumpaj-input"
            placeholder="my-video"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </label>

        <div className="pumpaj-actions">
          <button className="pumpaj-button" onClick={startJob} disabled={!canStart || isWorking}>
            {isWorking ? 'Working…' : 'Start download'}
          </button>
          <div className="pumpaj-progress" role="status">
            <span className="pumpaj-progress-pill">{stageLabel}</span>
            <div className="pumpaj-progress-bar" aria-hidden="true">
              <div className="pumpaj-progress-fill" style={{ width: `${Math.max(0, Math.min(100, progress))}%` }} />
            </div>
            <span style={{ fontSize: '0.9rem', color: 'rgba(248,250,252,0.75)' }}>{Math.floor(progress)}%</span>
          </div>
        </div>

        {jobId && stage === 'ended' && (
          <button className="pumpaj-button" onClick={() => downloadJobFile(jobId)} style={{ alignSelf: 'flex-start' }}>
            Download ready file
          </button>
        )}

        {!token && (
          <div className="pumpaj-message error">
            Please sign in to Supabase before starting a job.
          </div>
        )}

        {message && (
          <div className={`pumpaj-message ${stage === 'error' ? 'error' : 'success'}`}>{message}</div>
        )}

        <div className="pumpaj-footer">
          Having trouble? Check Railway logs or verify that yt-dlp/ffmpeg binaries are available in the server image.
        </div>
      </section>
    </div>
  );
}
