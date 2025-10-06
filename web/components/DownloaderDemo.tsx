"use client";
import { useEffect, useMemo, useRef, useState } from 'react';
import { getSupabase, isSupabaseConfigured } from '@/lib/supabaseClient';
import type { AuthChangeEvent, Session } from '@supabase/supabase-js';
import { apiUrl, postJSON, downloadJobFile } from '@/lib/api';
// Toast system is now in web/components
import { useToast } from '@/components/ToastProvider';

export default function DownloaderDemo() {
  const [url, setUrl] = useState('');
  const [title, setTitle] = useState('video');
  const [jobId, setJobId] = useState<string | null>(null);
  const [progress, setProgress] = useState<number>(0);
  const [stage, setStage] = useState<string>('idle');
  const [token, setToken] = useState<string>('');
  const [session, setSession] = useState<Session | null>(null);
  const [message, setMessage] = useState('');
  // URL history (local, last 10 distinct)
  const [history, setHistory] = useState<string[]>([]);
  const supabaseEnabled = isSupabaseConfigured();
  const sseRef = useRef<{ close: () => void } | null>(null);
  const { success, error: toastError } = useToast();

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

  // Load persisted URL history
  useEffect(() => {
    try {
      const raw = localStorage.getItem('pumpaj:web:urlHistory');
      if (raw) {
        const arr = JSON.parse(raw);
        if (Array.isArray(arr)) setHistory(arr.filter((x) => typeof x === 'string'));
      }
    } catch {/* ignore */}
  }, []);

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

  function persistUrl(u: string) {
    try {
      setHistory((prev) => {
        const next = [u, ...prev.filter((p) => p !== u)].slice(0, 10);
        localStorage.setItem('pumpaj:web:urlHistory', JSON.stringify(next));
        return next;
      });
    } catch {/* ignore */}
  }

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
    let resp: { id: string } | null = null;
    // Retry logic with exponential backoff for transient errors
    const maxAttempts = 3;
    let attempt = 0;
    while (attempt < maxAttempts && !resp) {
      attempt++;
      try {
        resp = await postJSON<{ id: string }>('/api/job/start/best', { url, title });
      } catch (err: any) {
        const msg = (err?.message || '').toLowerCase();
        const transient = /timeout|fetch|network|temporar|503|502|504/.test(msg);
        if (attempt < maxAttempts && transient) {
          // backoff 250ms, 750ms
          const waitMs = 250 * attempt * (attempt === 1 ? 1 : 3);
          toastError(`Privremeni problem sa serverom. Pokušavam ponovo (${attempt}/${maxAttempts})…`, 'Ponovni pokušaj');
          await new Promise((r) => setTimeout(r, waitMs)); // 250, 750
          continue;
        }
        setStage('error');
        setMessage(err?.message || 'Pokretanje posla nije uspelo.');
        toastError(err?.message || 'Pokretanje posla nije uspelo.', 'Greška');
        return;
      }
    }
    if (!resp) {
      setStage('error');
      setMessage('Nije moguće pokrenuti posao nakon više pokušaja.');
      toastError('Nije moguće pokrenuti posao nakon više pokušaja.', 'Greška');
      return;
    }
    setJobId(resp.id);
    persistUrl(url.trim());
    const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
    const endpoint = apiUrl(`/api/progress/${resp.id}`);
    const { sseSubscribe } = await import('@/utils/sseFetch');
    // Blagi auto-retry za SSE subscribe (npr. kratki mrežni prekid)
    const maxSseAttempts = 3;
    let sseAttempt = 0;
    async function trySubscribe(): Promise<void> {
      sseAttempt++;
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
        if (sseAttempt < maxSseAttempts) {
          const delay = Math.min(1000 * sseAttempt, 3000);
          toastError(`Veza je prekinuta. Pokušaj ${sseAttempt + 1}/${maxSseAttempts} za ${delay}ms…`, 'Ponovno povezivanje');
          await new Promise((r) => setTimeout(r, delay));
          return trySubscribe();
        }
        setStage('error');
        setMessage(err?.message || 'Greška u komunikaciji sa serverom.');
        toastError(err?.message || 'Greška u komunikaciji sa serverom.', 'Greška');
      }
    }
    await trySubscribe();
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

  // Toasts on stage transitions
  useEffect(() => {
    if (stage === 'ended' && jobId) {
      success('Fajl je spreman za preuzimanje.', 'Preuzimanje završeno');
    } else if (stage === 'error') {
      toastError(message || 'Došlo je do greške.', 'Greška');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage, jobId]);

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
            list="url-history"
          />
          {history.length > 0 && (
            <datalist id="url-history">
              {history.map((h) => (
                <option key={h} value={h} />
              ))}
            </datalist>
          )}
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
          <button
            className="pumpaj-button"
            onClick={() => {
              void downloadJobFile(jobId);
            }}
            style={{ alignSelf: 'flex-start' }}
          >
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
