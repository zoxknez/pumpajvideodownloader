import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Clock, Play, Trash2, ArrowUp, ArrowDown, RefreshCw, ChevronsUp, ChevronsDown, FastForward, Sparkles } from 'lucide-react';
import { useToast } from './ToastProvider';
import { usePolicy } from './AuthProvider';
import { PolicyBadge } from './PolicyBadge';
import { openPremiumUpgrade } from '../lib/premium';

type QItem = { position: number; id: string; title: string; url: string; mode: string; format: string };

export const QueueTab: React.FC = () => {
  const isIpc = typeof window !== 'undefined' && !!(window as any).api;
  const { info, error } = useToast();
  const policy = usePolicy();
  const [items, setItems] = useState<QItem[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [metrics, setMetrics] = useState<{ running: number; queued: number; maxConcurrent: number } | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const selectedIndex = useMemo(() => items.findIndex(i => i.id === selected), [items, selected]);

  const load = useCallback(async () => {
    if (!isIpc) return;
    try {
      const r = await (window as any).api?.queueList?.();
      if (r?.ok && Array.isArray(r.items)) setItems(r.items.map((q: any) => ({ position: Number(q.position||0), id: String(q.id), title: String(q.title || q.url || q.id), url: String(q.url||''), mode: String(q.mode||'video'), format: String(q.format||'') })));
    } catch {}
  }, [isIpc]);

  useEffect(() => {
    if (!isIpc) return;
    load();
    const id = window.setInterval(load, 4000);
    return () => window.clearInterval(id);
  }, [isIpc, load]);

  useEffect(() => {
    if (!isIpc) return;
    let disposed = false;
    const tick = async () => {
      try {
        const r = await (window as any).api?.jobsMetrics?.();
        if (!disposed && r) {
          setMetrics({
            running: Number(r.running || 0),
            queued: Number(r.queued || 0),
            maxConcurrent: Number(r.maxConcurrent || policy.concurrentJobs),
          });
        }
      } catch {}
    };
    tick();
    const id = window.setInterval(tick, 4000);
    return () => {
      disposed = true;
      window.clearInterval(id);
    };
  }, [isIpc, policy.concurrentJobs]);

  const startNow = useCallback(async (id?: string) => {
    if (!isIpc) return;
    const target = id || selected;
    if (!target) return;
    try { const r = await (window as any).api?.queueStartNow?.(target); if (r?.ok) { info('Started'); load(); } else error('Failed'); } catch { error('Failed'); }
  }, [isIpc, selected, info, error, load]);
  const remove = useCallback(async (id?: string) => {
    if (!isIpc) return;
    const target = id || selected;
    if (!target) return;
    try { const r = await (window as any).api?.queueRemove?.(target); if (r?.ok) { info('Removed'); load(); } else error('Failed'); } catch { error('Failed'); }
  }, [isIpc, selected, info, error, load]);
  const move = useCallback(async (delta: number) => {
    if (!isIpc || !selected) return;
    const idx = items.findIndex(i => i.id === selected);
    if (idx < 0) return;
    const to = Math.max(0, Math.min(items.length - 1, idx + delta));
    if (to === idx) return;
    try { const r = await (window as any).api?.queueMove?.(selected, to); if (!r?.ok) error('Move failed'); else load(); } catch { error('Move failed'); }
  }, [isIpc, selected, items, error, load]);
  const moveTo = useCallback(async (to: number) => {
    if (!isIpc || !selected) return;
    const idx = items.findIndex(i => i.id === selected);
    if (idx < 0 || to === idx) return;
    const clamped = Math.max(0, Math.min(items.length - 1, to));
    try { const r = await (window as any).api?.queueMove?.(selected, clamped); if (!r?.ok) error('Move failed'); else load(); } catch { error('Move failed'); }
  }, [isIpc, selected, items, error, load]);
  const clearAll = useCallback(async () => {
    if (!isIpc) return;
    if (items.length === 0) return;
    const yes = window.confirm(`Remove all ${items.length} queued items?`);
    if (!yes) return;
    try {
      for (const it of items) { try { await (window as any).api?.queueRemove?.(it.id); } catch {} }
      info('Queue cleared');
      setSelected(null);
      load();
    } catch { error('Failed to clear'); }
  }, [isIpc, items, info, load, error]);
  const startTop = useCallback(async () => {
    if (!isIpc) return;
    if (items.length === 0) return;
    try { const id = items[0].id; const r = await (window as any).api?.queueStartNow?.(id); if (r?.ok) { info('Started top'); load(); } else error('Failed'); } catch { error('Failed'); }
  }, [isIpc, items, info, error, load]);

  // Keyboard controls
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!document.body.contains(listRef.current as any)) return;
      // Enter = start selected
      if (e.key === 'Enter' && !e.ctrlKey && !e.altKey) { e.preventDefault(); startNow(); return; }
      // Delete/Backspace = remove selected; if none, clear all
      if ((e.key === 'Delete' || e.key === 'Backspace') && !e.ctrlKey && !e.altKey) { e.preventDefault(); if (selected) remove(); else clearAll(); return; }
      // Alt+Up/Down = move up/down
      if (e.altKey && !e.ctrlKey && !e.shiftKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) { e.preventDefault(); move(e.key === 'ArrowUp' ? -1 : 1); return; }
      // Alt+Home/End = move to top/bottom
      if (e.altKey && !e.ctrlKey && !e.shiftKey && (e.key === 'Home' || e.key === 'End')) { e.preventDefault(); moveTo(e.key === 'Home' ? 0 : items.length - 1); return; }
      // Arrow Up/Down = change selection
      if (!e.ctrlKey && !e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
        e.preventDefault();
        let next = selectedIndex;
        if (next < 0) next = 0;
        else next = Math.max(0, Math.min(items.length - 1, next + (e.key === 'ArrowUp' ? -1 : 1)));
        const id = items[next]?.id; if (id) setSelected(id);
        return;
      }
      // Home/End = jump selection to edges
      if (!e.ctrlKey && !e.altKey && (e.key === 'Home' || e.key === 'End')) { e.preventDefault(); const id = items[e.key === 'Home' ? 0 : items.length - 1]?.id; if (id) setSelected(id); return; }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [items, selected, selectedIndex, startNow, remove, clearAll, move, moveTo]);

  const onRowClick = (id: string) => {
    setSelected(id);
  };

  return (
    <div className="max-w-5xl mx-auto">
      <div className="mb-5 grid gap-4 rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-md lg:grid-cols-[260px_1fr]">
        <PolicyBadge />
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
            <div className="rounded-xl border border-white/10 bg-black/20 p-3 text-white/80">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-white/60">Aktivni poslovi</div>
              <div className="text-2xl font-bold text-white">{metrics?.running ?? 0}</div>
            </div>
            <div className="rounded-xl border border-white/10 bg-black/20 p-3 text-white/80">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-white/60">U redu</div>
              <div className="text-2xl font-bold text-white">{metrics?.queued ?? items.length}</div>
            </div>
            <div className="rounded-xl border border-white/10 bg-black/20 p-3 text-white/80">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-white/60">Limit plana</div>
              <div className="text-2xl font-bold text-white">{policy.concurrentJobs}</div>
            </div>
          </div>
          {policy.plan !== 'PREMIUM' && (
            <button
              onClick={() => openPremiumUpgrade('queue-header')}
              className="inline-flex w-fit items-center gap-2 rounded-xl bg-gradient-to-r from-purple-600 to-pink-600 px-4 py-2 text-sm font-semibold text-white shadow-lg hover:from-purple-500 hover:to-pink-500"
            >
              <Sparkles className="h-4 w-4" />
              Premium povećava paralelne poslove
            </button>
          )}
        </div>
      </div>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2 text-white/80">
          <Clock className="w-5 h-5" />
          <span className="font-semibold">Queued Items</span>
          <span className="text-white/50 text-xs">{items.length}</span>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={async () => { try { const r = await (window as any).api?.queueStartAll?.(); if (r?.ok) info('Queue draining'); else error('Failed'); } catch { error('Failed'); } }} disabled={items.length === 0} className="px-3 py-1.5 text-xs rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-200 border border-emerald-500/30 disabled:opacity-50 disabled:cursor-not-allowed"><FastForward className="w-3.5 h-3.5 inline mr-1"/>Start all</button>
      <button onClick={() => startTop()} disabled={items.length === 0} className="px-3 py-1.5 text-xs rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-200 border border-emerald-500/30 disabled:opacity-50 disabled:cursor-not-allowed"><FastForward className="w-3.5 h-3.5 inline mr-1"/>Start top</button>
      <button onClick={() => startNow()} disabled={!selected} className="px-3 py-1.5 text-xs rounded-lg bg-green-500/20 hover:bg-green-500/30 text-green-200 border border-green-500/30 disabled:opacity-50 disabled:cursor-not-allowed"><Play className="w-3.5 h-3.5 inline mr-1"/>Start selected</button>
          <button onClick={() => remove()} disabled={!selected} className="px-3 py-1.5 text-xs rounded-lg bg-red-500/20 hover:bg-red-500/30 text-red-200 border border-red-500/30 disabled:opacity-50 disabled:cursor-not-allowed"><Trash2 className="w-3.5 h-3.5 inline mr-1"/>Remove</button>
      <button onClick={() => move(-1)} disabled={!selected} className="px-3 py-1.5 text-xs rounded-lg bg-white/10 hover:bg-white/20 text-white/80 border border-white/20 disabled:opacity-50 disabled:cursor-not-allowed"><ArrowUp className="w-3.5 h-3.5 inline mr-1"/>Up</button>
      <button onClick={() => move(1)} disabled={!selected} className="px-3 py-1.5 text-xs rounded-lg bg-white/10 hover:bg-white/20 text-white/80 border border-white/20 disabled:opacity-50 disabled:cursor-not-allowed"><ArrowDown className="w-3.5 h-3.5 inline mr-1"/>Down</button>
      <button onClick={() => moveTo(0)} disabled={!selected} className="px-3 py-1.5 text-xs rounded-lg bg-white/10 hover:bg-white/20 text-white/80 border border-white/20 disabled:opacity-50 disabled:cursor-not-allowed"><ChevronsUp className="w-3.5 h-3.5 inline mr-1"/>Top</button>
      <button onClick={() => moveTo(items.length - 1)} disabled={!selected} className="px-3 py-1.5 text-xs rounded-lg bg-white/10 hover:bg-white/20 text-white/80 border border-white/20 disabled:opacity-50 disabled:cursor-not-allowed"><ChevronsDown className="w-3.5 h-3.5 inline mr-1"/>Bottom</button>
          <button onClick={async () => { try { const r = await (window as any).api?.queueClear?.(); if (r?.ok) { info('Cleared'); setSelected(null); load(); } else error('Failed'); } catch { error('Failed'); } }} disabled={items.length === 0} className="px-3 py-1.5 text-xs rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-200 border border-red-500/30 disabled:opacity-50 disabled:cursor-not-allowed">Clear all</button>
          <button onClick={load} className="px-3 py-1.5 text-xs rounded-lg bg-white/10 hover:bg-white/20 text-white/80 border border-white/20"><RefreshCw className="w-3.5 h-3.5 inline mr-1"/>Refresh</button>
        </div>
      </div>
      <div ref={listRef} className="space-y-2">
        {items.length === 0 && (<div className="text-white/60 text-sm">No queued items.</div>)}
        {items.map((q) => (
          <div key={q.id} onClick={() => onRowClick(q.id)} className={`rounded-lg border px-3 py-2 flex items-center gap-3 cursor-pointer ${selected === q.id ? 'border-blue-400/40 bg-blue-400/10' : 'border-white/10 bg-white/5 hover:bg-white/10'}`}>
            <div className="text-white/60 text-xs w-6 text-center">{q.position + 1}</div>
            <div className="flex-1 min-w-0">
              <div className="text-white text-sm truncate">{q.title}</div>
              <div className="text-white/60 text-xs truncate">{q.mode === 'audio' ? (q.format || 'm4a') : (q.format || 'best')}</div>
            </div>
            <div className="flex items-center gap-1">
              <button onClick={(e) => { e.stopPropagation(); startNow(q.id); }} className="px-2 py-1 text-xs rounded bg-green-500/20 border border-green-500/30 text-green-200 hover:bg-green-500/30">Start</button>
              <button onClick={(e) => { e.stopPropagation(); remove(q.id); }} className="px-2 py-1 text-xs rounded bg-red-500/20 border border-red-500/30 text-red-200 hover:bg-red-500/30">Remove</button>
            </div>
          </div>
        ))}
      </div>
    <div className="mt-4 text-white/50 text-xs">Shortcuts: Enter = Start selected, Delete = Remove (none = Clear all), Alt+Up/Down = Move, Alt+Home/End = Top/Bottom, Arrow Up/Down = Select prev/next.</div>
    </div>
  );
};
