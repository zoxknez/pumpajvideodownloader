import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Clipboard, Trash2, Play, Music2, CheckCircle2, AlertTriangle, Loader2, Pause, Square, Download, Upload } from 'lucide-react';
import { API_BASE } from '../lib/api';

type BatchItem = { url: string; title?: string };
type JobState = 'pending' | 'started' | 'completed' | 'failed' | 'canceled';

export const BatchTab: React.FC = () => {
  const [input, setInput] = useState('');
  const [jobs, setJobs] = useState<Record<string, JobState>>({});
  const [running, setRunning] = useState(false);
  const [paused, setPaused] = useState(false);
  const [stopRequested, setStopRequested] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const api = API_BASE || '';
  const token = useMemo(() => localStorage.getItem('app:token') || '', []);
  const isIpc = typeof window !== 'undefined' && Boolean((window as any).api?.start);
  const unsubRef = useRef<null | (() => void)>(null);

  // live refs for control flags
  const pausedRef = useRef(paused);
  const stopRef = useRef(stopRequested);
  const jobsRef = useRef(jobs);
  useEffect(() => { pausedRef.current = paused; }, [paused]);
  useEffect(() => { stopRef.current = stopRequested; }, [stopRequested]);
  useEffect(() => { jobsRef.current = jobs; }, [jobs]);

  // UI helpers (consistent look & feel)
  const btnBase = 'h-10 px-4 rounded-xl border transition-all duration-200 flex items-center gap-2 text-sm';
  const btnSurface = 'bg-slate-800/70 hover:bg-slate-800 border-white/15 text-white shadow-sm hover:shadow';
  const btnPrimary = 'text-white shadow-lg hover:shadow-xl';

  const items: BatchItem[] = useMemo(() => {
    const lines = input.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    const uniq = Array.from(new Set(lines));
    return uniq.filter((u) => /^https?:\/\//i.test(u)).map((u) => ({ url: u }));
  }, [input]);

  // Load/save input from localStorage for persistence
  useEffect(() => {
    const saved = localStorage.getItem('batch.input');
    if (saved) setInput(saved);
  }, []);
  useEffect(() => {
    localStorage.setItem('batch.input', input);
  }, [input]);

  // Progress wiring in IPC mode
  useEffect(() => {
    if (!isIpc) return;
    try {
      unsubRef.current?.();
      const offP = (window as any).api.onProgress?.((p: any) => {
        const id = p?.id;
        if (!id) return;
        // id is url in our usage
        setJobs((prev) => ({ ...prev, [id]: prev[id] || 'started' }));
      });
      const offD = (window as any).api.onDone?.((p: any) => {
        const id = p?.id; const code = p?.code;
        if (!id) return;
        setJobs((prev) => ({ ...prev, [id]: code === 0 ? 'completed' : 'failed' }));
      });
      unsubRef.current = () => { try { offP?.(); offD?.(); } catch {} };
    } catch {}
    return () => { try { unsubRef.current?.(); } catch {} };
  }, [isIpc]);

  const clearAll = () => { setInput(''); setJobs({}); };

  const pasteFromClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText();
      setInput((prev) => (prev ? prev + '\n' + text : text));
    } catch {}
  };

  const sleep = (ms: number) => new Promise((res) => setTimeout(res, ms));
  async function waitFor(predicate: () => boolean, ms = 120000, step = 500) {
    const started = Date.now();
    while (Date.now() - started < ms) {
      if (predicate()) return true;
      await sleep(step);
    }
    return false;
  }

  const startSeq = async (mode: 'video' | 'audio') => {
    if (!items.length || running) return;
    setRunning(true);
    setPaused(false);
    setStopRequested(false);
    try {
      for (const it of items) {
        if (stopRef.current) break;
        // wait while paused
        while (pausedRef.current) { if (stopRef.current) break; await sleep(250); }
        if (stopRef.current) break;

        // mark started
        setJobs((prev) => ({ ...prev, [it.url]: prev[it.url] || 'started' }));
        if (isIpc) {
          // Start via IPC and wait until done
          try {
            await (window as any).api.start?.({ id: it.url, url: it.url, outDir: mode === 'audio' ? 'Audio' : 'Video', mode, audioFormat: 'm4a' });
          } catch {}
          // wait for completion / failure signaled by onDone
          await waitFor(() => {
            const st = jobsRef.current[it.url];
            return stopRef.current || st === 'completed' || st === 'failed' || st === 'canceled';
          }, 180000, 600);
        } else {
          // Legacy server flow via hidden iframe + history polling
          const u = new URL(`${api}/api/download/${mode === 'video' ? 'best' : 'audio'}`);
          u.searchParams.set('url', it.url);
          if (mode === 'audio') u.searchParams.set('format', 'm4a');
          if (token) u.searchParams.set('token', token);
          u.searchParams.set('ts', String(Date.now()));
          if (iframeRef.current) iframeRef.current.src = u.toString();
          await waitFor(() => {
            const st = jobsRef.current[it.url];
            return stopRef.current || st === 'completed' || st === 'failed';
          }, 180000, 600);
        }
        if (stopRef.current) break;
        // brief gap before next
        await sleep(400);
      }
    } finally {
      setRunning(false);
      setPaused(false);
      setStopRequested(false);
    }
  };

  const total = items.length;
  const done = useMemo(() => items.filter((i) => jobs[i.url] === 'completed').length, [items, jobs]);

  // Limit list to avoid inner scroll in fixed panels
  const MAX_BATCH_LIST = 10;
  const renderItems = items.slice(0, MAX_BATCH_LIST);

  return (
    <div className="max-w-6xl mx-auto">
  {/* Hidden iframe for legacy server downloads (unused in IPC mode) */}
  <iframe ref={iframeRef} title="batch-downloader" style={{ display: isIpc ? 'none' : 'none' }} />

      {/* Input & tools card */}
      <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-md p-5 mb-5">
        <div className="flex items-center justify-between mb-3">
          <div className="text-white/70 text-sm">Batch input</div>
          <div className="text-xs text-white/70">Valid <span className="ml-1 inline-flex items-center px-2 py-0.5 rounded-full bg-white/10 border border-white/15 text-white">{items.length}</span></div>
        </div>
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={`https://www.youtube.com/watch?v=...\nhttps://vimeo.com/...`}
          className="w-full h-44 bg-white/10 border border-white/20 rounded-xl p-4 text-white placeholder-white/40 focus:border-purple-500 focus:ring-2 focus:ring-purple-500/25 outline-none"
        />

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button onClick={pasteFromClipboard} className={`${btnBase} ${btnSurface}`}>
            <Clipboard className="w-4 h-4" /> Paste
          </button>
          <button onClick={clearAll} className={`${btnBase} ${btnSurface}`}>
            <Trash2 className="w-4 h-4" /> Clear
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".txt,.csv,.json"
            className="hidden"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              const text = await file.text().catch(() => '');
              if (!text) return;
              let urls: string[] = [];
              const trimmed = text.trim();
              if (trimmed.startsWith('[')) {
                try {
                  const arr = JSON.parse(trimmed);
                  if (Array.isArray(arr)) {
                    urls = arr
                      .map((x: any) => (typeof x === 'string' ? x : x && typeof x.url === 'string' ? x.url : ''))
                      .filter(Boolean);
                  }
                } catch {}
              }
              if (!urls.length) {
                urls = trimmed.split(/[\r\n,]+/).map((s) => s.trim()).filter(Boolean);
              }
              const merged = Array.from(new Set([...(input ? input.split(/\r?\n/).filter(Boolean) : []), ...urls]));
              setInput(merged.join('\n'));
              if (fileInputRef.current) fileInputRef.current.value = '';
            }}
          />
          <button onClick={() => fileInputRef.current?.click()} className={`${btnBase} ${btnSurface}`}>
            <Upload className="w-4 h-4" /> Import
          </button>
          <button
            onClick={() => {
              const blob = new Blob([JSON.stringify(items.map((i) => i.url), null, 2)], { type: 'application/json' });
              const a = document.createElement('a');
              a.href = URL.createObjectURL(blob);
              a.download = 'batch-urls.json';
              a.click();
              URL.revokeObjectURL(a.href);
            }}
            className={`${btnBase} ${btnSurface}`}
          >
            <Download className="w-4 h-4" /> Export JSON
          </button>
          <button
            onClick={() => {
              const blob = new Blob([items.map((i) => i.url).join('\n')], { type: 'text/csv' });
              const a = document.createElement('a');
              a.href = URL.createObjectURL(blob);
              a.download = 'batch-urls.csv';
              a.click();
              URL.revokeObjectURL(a.href);
            }}
            className={`${btnBase} ${btnSurface}`}
          >
            <Download className="w-4 h-4" /> Export CSV
          </button>
        </div>
      </div>

      {/* Call-to-action row */}
      <div className="flex flex-wrap gap-3 mb-6 items-center">
        <button
          disabled={!items.length || running}
          onClick={() => startSeq('video')}
          className={`${btnBase} ${btnPrimary} disabled:opacity-50 bg-gradient-to-r from-emerald-600 to-green-600`}
        >
          {running ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />} Start Video (Best MP4)
        </button>
        <button
          disabled={!items.length || running}
          onClick={() => startSeq('audio')}
          className={`${btnBase} ${btnPrimary} disabled:opacity-50 bg-gradient-to-r from-purple-600 to-pink-600`}
        >
          {running ? <Loader2 className="w-4 h-4 animate-spin" /> : <Music2 className="w-4 h-4" />} Start Audio (M4A)
        </button>
        <button
          disabled={!running}
          onClick={() => setPaused((p) => !p)}
          className={`${btnBase} bg-gradient-to-r from-blue-600 to-indigo-600 text-white disabled:opacity-50`}
        >
          {paused ? <Play className="w-4 h-4" /> : <Pause className="w-4 h-4" />} {paused ? 'Resume' : 'Pause'}
        </button>
        <button
          disabled={!running}
          onClick={() => { setStopRequested(true); setPaused(false); }}
          className={`${btnBase} bg-gradient-to-r from-red-600 to-rose-600 text-white disabled:opacity-50`}
        >
          <Square className="w-4 h-4" /> Stop
        </button>
        <div className="text-white/85 flex items-center gap-2 ml-auto text-sm">
          {done === total && total > 0 ? (
            <>
              <CheckCircle2 className="w-5 h-5 text-emerald-400" /> Completed: {done}/{total}
            </>
          ) : (
            <>
              <AlertTriangle className="w-5 h-5 text-yellow-400" /> Progress: {done}/{total}
            </>
          )}
        </div>
      </div>

      {/* Items list */}
      <div className="space-y-2">
        {renderItems.map((it) => {
          const st = jobs[it.url] || 'pending';
          return (
            <div key={it.url} className="flex items-center gap-3 bg-white/5 border border-white/10 rounded-xl p-3">
              <div
                className={`w-2 h-2 rounded-full ${
                  st === 'completed' ? 'bg-emerald-400' :
                  st === 'failed' ? 'bg-rose-400' :
                  st === 'started' ? 'bg-blue-400 animate-pulse' : 'bg-slate-400'
                }`}
              />
              <div className="text-sm text-white/90 truncate flex-1">{it.url}</div>
              <div className="text-xs text-white/60 capitalize">{st.replace('-', ' ')}</div>
            </div>
          );
        })}
        {!items.length && (
          <div className="text-center text-white/50 text-sm py-10">Unesi bar jedan URL (po jedan po liniji).</div>
        )}
      </div>
    </div>
  );
};
