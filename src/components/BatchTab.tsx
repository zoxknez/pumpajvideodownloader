import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Clipboard, Trash2, Play, Music2, CheckCircle2, AlertTriangle, Loader2, Square, Download, Upload, XCircle } from 'lucide-react';
import { createBatch, getBatch, cancelBatch, type BatchSummary } from '../lib/api';
import { usePolicy } from './AuthProvider';
import { useToast } from './ToastProvider';
import { openPremiumUpgrade } from '../lib/premium';

type BatchItem = { url: string; title?: string };
type JobState = 'pending' | 'started' | 'completed' | 'failed' | 'canceled';

export const BatchTab: React.FC = () => {
  const policy = usePolicy();
  const { error: toastError } = useToast();
  const [input, setInput] = useState('');
  const [jobs, setJobs] = useState<Record<string, JobState>>({});
  const [activeBatchId, setActiveBatchId] = useState<string | null>(null);
  const [batchSummary, setBatchSummary] = useState<BatchSummary | null>(null);
  const [creating, setCreating] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  // const api = API_BASE || ''; // not needed currently
  // Server-driven batching only (placeholder for desktop integration)
  const jobsRef = useRef(jobs);
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
  const overLimit = items.length > policy.batchMax;
  const limitLabel = `Max ${policy.batchMax} URL${policy.batchMax === 1 ? '' : 'a'} po batch-u`;

  // Load/save input from localStorage for persistence
  useEffect(() => {
    const saved = localStorage.getItem('batch.input');
    if (saved) setInput(saved);
  }, []);
  useEffect(() => {
    localStorage.setItem('batch.input', input);
  }, [input]);

  // Poll active batch summary
  useEffect(() => {
    let timer: any;
    let aborted = false;
    async function loop() {
      if (!activeBatchId) return;
  // start polling
      try {
        const summary = await getBatch(activeBatchId);
        if (aborted) return;
        setBatchSummary(summary);
        const newJobs: Record<string, JobState> = {};
        for (const it of summary.items) {
          const st = it.status as string;
          if (st === 'completed' || st === 'failed' || st === 'canceled') newJobs[it.jobId] = st as JobState;
          else if (st === 'in-progress') newJobs[it.jobId] = 'started';
          else if (st === 'queued') newJobs[it.jobId] = 'pending';
        }
        setJobs(newJobs);
        const allDone = summary.total === (summary.completed + summary.failed + summary.canceled);
        if (!allDone) timer = setTimeout(loop, 2000);
      } catch {
        // stop polling on 404 or auth
      } finally {
  // done polling cycle
      }
    }
    loop();
    return () => { aborted = true; if (timer) clearTimeout(timer); };
  }, [activeBatchId]);

  const clearAll = () => { setInput(''); setJobs({}); setBatchSummary(null); setActiveBatchId(null); };

  const pasteFromClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText();
      setInput((prev) => (prev ? prev + '\n' + text : text));
    } catch {}
  };

  const startSeq = async (mode: 'video' | 'audio') => {
    if (!items.length) return;
    if (overLimit) {
      toastError(
        `Plan ${policy.plan} dozvoljava do ${policy.batchMax} URL-a po batch-u. Ukloni ${items.length - policy.batchMax} link${items.length - policy.batchMax === 1 ? '' : 'ova'} ili nadogradi.`,
        'Batch limit',
        { actionLabel: 'Upgrade', onAction: () => openPremiumUpgrade('batch-limit') }
      );
      return;
    }
    setCreating(true);
    try {
      const resp = await createBatch(items.map(i => i.url), mode, 'm4a');
      setActiveBatchId(resp.batchId);
      setJobs({});
      setBatchSummary(null);
    } catch (e) {
      // TODO: surface toast
      console.error('Batch create failed', e);
    } finally {
      setCreating(false);
    }
  };

  const completedCount = useMemo(() => items.filter((i) => jobs[i.url] === 'completed').length, [items, jobs]);
  const total = batchSummary ? batchSummary.total : items.length;
  const done = batchSummary ? batchSummary.completed : completedCount;

  // Limit list to avoid inner scroll in fixed panels
  const MAX_BATCH_LIST = 10;
  const renderItems = items.slice(0, MAX_BATCH_LIST);

  return (
    <div className="max-w-6xl mx-auto">
  {/* Server-driven batch: no iframe required */}

      {/* Input & tools card */}
      <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-md p-5 mb-5">
        <div className="flex items-center justify-between mb-3">
          <div className="text-white/70 text-sm">Batch input</div>
            <div className="flex items-center gap-3 text-xs">
              <div className={`inline-flex items-center px-2 py-0.5 rounded-full border ${overLimit ? 'bg-rose-500/10 border-rose-400/40 text-rose-200' : 'bg-white/10 border-white/15 text-white'}`}>
                Valid {items.length}
              </div>
              <span className={`${overLimit ? 'text-rose-200' : 'text-white/70'}`}>{limitLabel}</span>
            </div>
        </div>
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={`https://www.youtube.com/watch?v=...\nhttps://vimeo.com/...`}
          className="w-full h-44 bg-white/10 border border-white/20 rounded-xl p-4 text-white placeholder-white/40 focus:border-purple-500 focus:ring-2 focus:ring-purple-500/25 outline-none"
        />
        {overLimit && (
          <div className="mt-2 text-xs text-rose-200 bg-rose-500/10 border border-rose-400/30 rounded-lg px-3 py-2">
            Dodatno: ukloni {items.length - policy.batchMax} URL{items.length - policy.batchMax === 1 ? '' : 'a'} da pokreneš batch ili pređi na Premium.
          </div>
        )}

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
          disabled={!items.length || creating || Boolean(activeBatchId) || overLimit}
          onClick={() => startSeq('video')}
          className={`${btnBase} ${btnPrimary} disabled:opacity-50 bg-gradient-to-r from-emerald-600 to-green-600`}
        >
          {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />} {activeBatchId ? 'Batch Running' : 'Start Video Batch'}
        </button>
        <button
          disabled={!items.length || creating || Boolean(activeBatchId) || overLimit}
          onClick={() => startSeq('audio')}
          className={`${btnBase} ${btnPrimary} disabled:opacity-50 bg-gradient-to-r from-purple-600 to-pink-600`}
        >
          {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Music2 className="w-4 h-4" />} {activeBatchId ? 'Batch Running' : 'Start Audio Batch'}
        </button>
        {activeBatchId && (
          <button
            disabled={!activeBatchId || !batchSummary || (batchSummary.completed + batchSummary.failed + batchSummary.canceled) === batchSummary.total}
            onClick={async () => { if (!activeBatchId) return; try { await cancelBatch(activeBatchId); } catch (e) { console.error(e); } }}
            className={`${btnBase} bg-gradient-to-r from-red-600 to-rose-600 text-white disabled:opacity-50`}
          >
            <Square className="w-4 h-4" /> Cancel Batch
          </button>
        )}
        {activeBatchId && (
          <button
            onClick={() => { setActiveBatchId(null); setBatchSummary(null); setJobs({}); }}
            className={`${btnBase} bg-gradient-to-r from-slate-600 to-slate-700 text-white`}
          >
            <XCircle className="w-4 h-4" /> Close
          </button>
        )}
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
        {activeBatchId && batchSummary ? (
          batchSummary.items.slice(0, 25).map(it => {
            const st = it.status;
            return (
              <div key={it.jobId} className="flex items-center gap-3 bg-white/5 border border-white/10 rounded-xl p-3">
                <div className={`w-2 h-2 rounded-full ${
                    st === 'completed' ? 'bg-emerald-400' :
                    st === 'failed' ? 'bg-rose-400' :
                    st === 'canceled' ? 'bg-slate-500' :
                    st === 'in-progress' ? 'bg-blue-400 animate-pulse' : 'bg-slate-400'
                  }`} />
                <div className="text-xs text-white/50 w-16 tabular-nums">{Math.round(it.progress || 0)}%</div>
                <div className="text-sm text-white/90 truncate flex-1" title={it.url}>{it.url}</div>
                <div className="text-xs text-white/60 capitalize">{st.replace('-', ' ')}</div>
              </div>
            );
          })
        ) : (
          renderItems.map((it) => {
            const st = jobs[it.url] || 'pending';
            return (
              <div key={it.url} className="flex items-center gap-3 bg-white/5 border border-white/10 rounded-xl p-3">
                <div className={`w-2 h-2 rounded-full ${
                    st === 'completed' ? 'bg-emerald-400' :
                    st === 'failed' ? 'bg-rose-400' :
                    st === 'started' ? 'bg-blue-400 animate-pulse' : 'bg-slate-400'
                  }`} />
                <div className="text-sm text-white/90 truncate flex-1">{it.url}</div>
                <div className="text-xs text-white/60 capitalize">{st.replace('-', ' ')}</div>
              </div>
            );
          })
        )}
        {!items.length && !activeBatchId && (
          <div className="text-center text-white/50 text-sm py-10">Unesi bar jedan URL (po jedan po liniji).</div>
        )}
        {activeBatchId && !batchSummary && (
          <div className="text-center text-white/60 text-sm py-10 flex items-center justify-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Kreiranje batch-a...</div>
        )}
      </div>
    </div>
  );
};
