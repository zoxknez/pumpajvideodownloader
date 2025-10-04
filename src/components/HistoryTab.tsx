import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { History as HistoryIcon, RefreshCw, Play, Trash2, RotateCcw, Clock, FileType, HardDrive, AlertCircle, CheckCircle, XCircle, Search, Copy, Download } from '../lib/icons';
import { useToast } from './ToastProvider';
import { desktopHistoryList, desktopHistoryClear, desktopHistoryRemove, revealPath, openPath } from '../lib/downloader';
import { API_BASE } from '../lib/api';

interface DownloadHistoryItem {
  id: string;
  title: string;
  url: string;
  thumbnail: string;
  type: 'video' | 'audio' | 'playlist';
  format: string;
  quality: string;
  size: string;
  downloadDate: string;
  status: 'completed' | 'failed' | 'in-progress' | 'canceled' | 'queued';
  progress?: number;
  stage?: string;
  speed?: string;
  eta?: string;
  filepath?: string;
}

export const HistoryTab: React.FC = () => {
  const api = API_BASE || 'http://127.0.0.1:5176';
  const isIpc = typeof window !== 'undefined' && !!(window as any).api;
  const { success, error: toastError, info } = useToast();
  const [items, setItems] = useState<DownloadHistoryItem[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all'|'completed'|'failed'|'in-progress'|'queued'|'canceled'>('all');
  const [typeFilter, setTypeFilter] = useState<'all'|'video'|'audio'|'playlist'>('all');
  const [sortOrder, setSortOrder] = useState<'newest'|'oldest'>('newest');
  const [queued, setQueued] = useState<Array<{ position: number; id: string; title: string; url: string; mode: string; format: string }>>([]);
  const sseRefs = useRef<Map<string, EventSource>>(new Map());

  const load = useCallback(() => {
    if (isIpc) {
      desktopHistoryList().then((resp: any) => {
        if (!resp?.ok) return;
        const list: DownloadHistoryItem[] = (resp.items || []).map((i: any) => ({
          id: i.id,
          title: i.title || i.url,
          url: i.url,
          thumbnail: '',
          type: i.type || 'video',
          format: i.format || '',
          quality: '',
          size: '',
          downloadDate: i.downloadDate || new Date().toISOString(),
          status: i.status || 'completed',
          progress: i.progress,
          filepath: i.filepath || i.path || '',
        }));
        setItems(list);
      }).catch(() => {});
      return;
    }
    fetch(`${api}/api/history`, { headers: { Authorization: `Bearer ${localStorage.getItem('app:token') || ''}` } }).then(r => r.json()).then((data) => {
      const list: DownloadHistoryItem[] = (data?.items || []).map((i: any) => ({
        id: i.id,
        title: i.title,
        url: i.url,
        thumbnail: i.thumbnail || '',
        type: i.type,
        format: i.format,
        quality: i.quality || '',
        size: i.size || '',
        downloadDate: i.downloadDate,
        status: i.status,
        progress: i.progress,
      }));
      setItems(list);
      const map = sseRefs.current;
      for (const [id, es] of map.entries()) {
        const stillActive = list.find((it) => it.id === id && (it.status === 'in-progress' || it.status === 'queued'));
        if (!stillActive) { try { es.close(); } catch {} map.delete(id); }
      }
      for (const it of list) {
        if ((it.status === 'in-progress' || it.status === 'queued') && !map.has(it.id)) {
          try {
            const tok = encodeURIComponent(localStorage.getItem('app:token') || '');
            const es = new EventSource(`${api}/api/progress/${it.id}?token=${tok}`);
            es.onmessage = (ev) => {
              try {
                const msg = JSON.parse(ev.data || '{}');
                if (msg && msg.id === it.id) {
                  setItems((prev) => prev.map((p) => p.id === it.id ? {
                    ...p,
                    progress: typeof msg.progress === 'number' ? msg.progress : p.progress,
                    stage: msg.stage ?? p.stage,
                    speed: msg.speed ?? p.speed,
                    eta: msg.eta ?? p.eta,
                    status: msg.status ?? p.status,
                  } : p));
                }
              } catch {}
            };
            es.addEventListener('end', () => { try { es.close(); } catch {} map.delete(it.id); });
            es.onerror = () => { try { es.close(); } catch {} map.delete(it.id); };
            map.set(it.id, es);
          } catch {}
        }
      }
    }).catch(() => {});
  }, [api, isIpc]);

  useEffect(() => {
    load();
    const id = setInterval(load, 4000);
    const snapshot = sseRefs.current;
    return () => { clearInterval(id); for (const es of snapshot.values()) { try { es.close(); } catch {} } snapshot.clear(); };
  }, [load]);

  // IPC: poll queued list periodically
  useEffect(() => {
    if (!isIpc) return;
    let disposed = false;
    const tick = async () => {
      try {
        const r = await (window as any).api?.queueList?.();
        if (!disposed && r?.ok && Array.isArray(r.items)) {
          const mapped = r.items.map((q: any) => ({ position: Number(q.position || 0), id: String(q.id), title: String(q.title || q.url || q.id), url: String(q.url || ''), mode: String(q.mode || 'video'), format: String(q.format || '') }));
          setQueued(mapped);
        }
      } catch {}
    };
    tick();
    const interval = setInterval(tick, 4000);
    return () => { disposed = true; clearInterval(interval); };
  }, [isIpc]);

  // Live updates in desktop mode via IPC progress events
  useEffect(() => {
    if (!isIpc || !(window as any).api?.onProgress) return;
    const fmtEta = (v: any) => {
      const n = Number(v);
      if (!isFinite(n) || n <= 0) return undefined;
      const m = Math.floor(n / 60);
      const s = Math.floor(n % 60);
      return `${m}:${String(s).padStart(2, '0')}`;
    };
    const unsub = (window as any).api.onProgress((payload: any) => {
      try {
        const id = payload?.id;
        if (!id) return;
        const j = payload?.progress || null;
        if (!j) return;
        const total = Number(j.total_bytes || j.total_bytes_estimate || 0);
        const down = Number(j.downloaded_bytes || 0);
        const pct = total > 0 ? Math.max(0, Math.min(100, Math.round((down / total) * 100))) : undefined;
        setItems((prev) => prev.map((p) => p.id === id ? {
          ...p,
          status: 'in-progress',
          progress: pct ?? p.progress,
          eta: fmtEta(j.eta) ?? p.eta,
          speed: (j.speed != null ? String(j.speed) : p.speed),
          filepath: (j.filename || p.filepath),
        } : p));
      } catch {}
    });
    const unsubDone = (window as any).api.onDone?.((payload: any) => {
      try {
        const id = payload?.id;
        const code = Number(payload?.code);
        if (!id) return;
        setItems((prev) => prev.map((p) => p.id === id ? { ...p, status: code === 0 ? 'completed' : 'failed', progress: code === 0 ? 100 : (p.progress ?? 0), filepath: payload?.filepath || p.filepath } : p));
        setTimeout(load, 500);
      } catch {}
    });
    return () => { try { unsub?.(); } catch {} try { unsubDone?.(); } catch {} };
  }, [isIpc, load]);

  const cancel = async (id: string) => {
    if (isIpc) {
      try { await (window as any).api?.cancel?.(id); info('Job canceled'); } catch {}
      setTimeout(load, 600);
      return;
    }
    try { await fetch(`${api}/api/job/cancel/${encodeURIComponent(id)}`, { method: 'POST', headers: { Authorization: `Bearer ${localStorage.getItem('app:token') || ''}` } }); info('Job canceled'); } catch {}
    setTimeout(load, 600);
  };

  const retry = async (it: DownloadHistoryItem) => {
    try {
      if (isIpc) {
        const r = await (window as any).api?.jobsRetryById?.(it.id);
        if (r?.ok) info('Retrying job…'); else toastError(r?.error || 'Retry failed');
      } else {
        if (it.type === 'video') {
          await fetch(`${api}/api/job/start/best`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('app:token') || ''}` }, body: JSON.stringify({ url: it.url, title: it.title }) });
        } else if (it.type === 'audio') {
          await fetch(`${api}/api/job/start/audio`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('app:token') || ''}` }, body: JSON.stringify({ url: it.url, title: it.title, format: (it.format || 'M4A').toLowerCase() }) });
        }
        info('Retrying job…');
      }
    } catch { toastError('Retry failed'); }
    setTimeout(load, 800);
  };

  const redownload = async (it: DownloadHistoryItem) => {
    try {
  const res = await fetch(`${api}/api/job/file/${encodeURIComponent(it.id)}`, { headers: { Authorization: `Bearer ${localStorage.getItem('app:token') || ''}` } });
      if (!res.ok) throw new Error('not ready');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const cd = res.headers.get('content-disposition') || '';
      const m = cd.match(/filename="?([^";]+)"?/i);
      a.download = (m ? m[1] : `${it.title}.${(it.format || 'mp4').toLowerCase()}`).replace(/[^\w.-]+/g, '_');
      document.body.appendChild(a);
      success('Saving file…');
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      try {
        if (it.type === 'video') {
          const u = new URL(`${api}/api/download/best`); u.searchParams.set('url', it.url); u.searchParams.set('title', it.title);
          u.searchParams.set('token', localStorage.getItem('app:token') || '');
          const res = await fetch(u.toString()); if (!res.ok) throw new Error('video fail'); const b = await res.blob();
          const link = document.createElement('a'); link.href = URL.createObjectURL(b); link.download = `${it.title}.mp4`.replace(/[^\w.-]+/g, '_'); document.body.appendChild(link); success('Saving file…'); link.click(); link.remove();
        } else if (it.type === 'audio') {
          const u = new URL(`${api}/api/download/audio`); u.searchParams.set('url', it.url); u.searchParams.set('title', it.title); const fmt = (it.format || 'M4A').toLowerCase(); u.searchParams.set('format', fmt === 'mp3' ? 'mp3' : 'm4a');
          u.searchParams.set('token', localStorage.getItem('app:token') || '');
          const res = await fetch(u.toString()); if (!res.ok) throw new Error('audio fail'); const b = await res.blob();
          const link = document.createElement('a'); link.href = URL.createObjectURL(b); link.download = `${it.title}.${fmt === 'mp3' ? 'mp3' : 'm4a'}`.replace(/[^\w.-]+/g, '_'); document.body.appendChild(link); success('Saving file…'); link.click(); link.remove();
        }
      } catch { toastError('Download failed.'); }
    }
  };

  const remove = async (id: string) => {
    if (isIpc) { try { await desktopHistoryRemove(id); } catch {} load(); return; }
    try { await fetch(`${api}/api/history/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${localStorage.getItem('app:token') || ''}` } }); } catch {} load(); };
  const clearAll = async () => { if (isIpc) { try { await desktopHistoryClear(); } catch {} load(); return; } try { await fetch(`${api}/api/history`, { method: 'DELETE', headers: { Authorization: `Bearer ${localStorage.getItem('app:token') || ''}` } }); } catch {} load(); };
  const cancelAll = async () => {
    if (isIpc) {
      try { const r = await (window as any).api?.jobsCancelAll?.(); if (r?.ok) info('All jobs canceled'); else toastError('Cancel all failed'); } catch { toastError('Cancel all failed'); }
      setTimeout(load, 600);
      return;
    }
    try {
      const r = await fetch(`${api}/api/jobs/cancel-all`, { method: 'POST', headers: { Authorization: `Bearer ${localStorage.getItem('app:token') || ''}` } });
      if (r.ok) info('All jobs canceled'); else toastError('Cancel all failed');
    } catch { toastError('Cancel all failed'); }
    setTimeout(load, 800);
  };
  const retryAllFailed = async () => {
    try {
      if (isIpc) {
        const r = await (window as any).api?.jobsRetryAllFailed?.();
        if (r?.ok && r?.count) info(`Retried ${r.count} failed job(s)`); else toastError('No jobs retried');
      } else {
        const failed = items.filter((i) => i.status === 'failed');
        let ok = 0;
        for (const it of failed) {
          try {
            if (it.type === 'video') {
              await fetch(`${api}/api/job/start/best`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('app:token') || ''}` }, body: JSON.stringify({ url: it.url, title: it.title }) });
            } else if (it.type === 'audio') {
              await fetch(`${api}/api/job/start/audio`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('app:token') || ''}` }, body: JSON.stringify({ url: it.url, title: it.title, format: (it.format || 'M4A').toLowerCase() }) });
            }
            ok++;
          } catch {}
        }
        if (ok) info(`Retried ${ok} failed job(s)`); else toastError('No jobs retried');
      }
    } catch { toastError('Retry failed'); }
    setTimeout(load, 800);
  };

  const retryLastFailed = async () => {
    try {
      if (isIpc) {
        const r = await (window as any).api?.jobsRetryLastFailed?.();
        if (r?.ok) info('Retrying last failed…'); else toastError('No failed jobs to retry');
      } else {
        const last = items.filter((i)=>i.status==='failed')[0];
        if (!last) { toastError('No failed jobs to retry'); return; }
        await retry(last);
      }
    } catch { toastError('Retry failed'); }
    setTimeout(load, 800);
  };

  const active = useMemo(() => items.filter((i) => i.status === 'in-progress' || i.status === 'queued'), [items]);
  const past = useMemo(() => {
    let list = items.filter((i) => i.status !== 'in-progress' && i.status !== 'queued');
    if (searchTerm.trim()) list = list.filter((i) => i.title.toLowerCase().includes(searchTerm.toLowerCase()));
    if (statusFilter !== 'all') list = list.filter((i) => i.status === statusFilter);
    if (typeFilter !== 'all') list = list.filter((i) => i.type === typeFilter);
    list = list.slice().sort((a, b) => {
      const ad = new Date(a.downloadDate).getTime() || 0;
      const bd = new Date(b.downloadDate).getTime() || 0;
      return sortOrder === 'newest' ? (bd - ad) : (ad - bd);
    });
    // Clamp to a fixed maximum for consistent panel height in the desktop app
  const MAX_SHOW = 10; // reduce to avoid inner scroll in fixed panels
    return list.slice(0, MAX_SHOW);
  }, [items, searchTerm, statusFilter, typeFilter, sortOrder]);

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed': return <CheckCircle className="w-5 h-5 text-green-400" />;
      case 'failed': return <XCircle className="w-5 h-5 text-red-400" />;
      case 'canceled': return <XCircle className="w-5 h-5 text-yellow-400" />;
      case 'in-progress': return <RefreshCw className="w-5 h-5 text-blue-400 animate-spin" />;
      case 'queued': return <Clock className="w-5 h-5 text-yellow-400" />;
      default: return <AlertCircle className="w-5 h-5 text-gray-400" />;
    }
  };

  const badgeCls = (status: string) => (
    status === 'completed' ? 'text-green-400 bg-green-500/20 border-green-500/30' :
    status === 'failed' ? 'text-red-400 bg-red-500/20 border-red-500/30' :
    status === 'canceled' ? 'text-yellow-300 bg-yellow-500/20 border-yellow-500/30' :
    status === 'in-progress' ? 'text-blue-400 bg-blue-500/20 border-blue-500/30' :
    status === 'queued' ? 'text-yellow-400 bg-yellow-500/20 border-yellow-500/30' :
    'text-gray-400 bg-gray-500/20 border-gray-500/30'
  );

  return (
    <div className="max-w-7xl mx-auto">
  {/* Title header removed for a tighter, unified look */}

      {/* Top actions: export history */}
      <div className="flex items-center justify-between mb-4">
        <div className="text-white/70 text-sm flex items-center gap-2"><HistoryIcon className="w-4 h-4" /> History</div>
        <div className="flex items-center gap-2">
          <button onClick={() => {
            try {
              const blob = new Blob([JSON.stringify(items, null, 2)], { type: 'application/json' });
              const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'history.json'; a.click(); URL.revokeObjectURL(a.href);
            } catch {}
          }} className="px-3 py-1.5 text-xs rounded-lg bg-white/10 hover:bg-white/20 text-white/80 border border-white/20 flex items-center gap-2"><Download className="w-3.5 h-3.5"/>Export JSON</button>
          <button onClick={() => {
            try {
              const header = 'id,title,url,type,format,status,downloadDate\n';
              const lines = items.map(i => [i.id, i.title, i.url, i.type, i.format, i.status, i.downloadDate].map(v => '"'+String(v||'').replace(/"/g,'""')+'"').join(','));
              const blob = new Blob([header + lines.join('\n')], { type: 'text/csv' });
              const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'history.csv'; a.click(); URL.revokeObjectURL(a.href);
            } catch {}
          }} className="px-3 py-1.5 text-xs rounded-lg bg-white/10 hover:bg-white/20 text-white/80 border border-white/20 flex items-center gap-2"><Download className="w-3.5 h-3.5"/>Export CSV</button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Active Queue */}
        <div className="bg-white/5 backdrop-blur-md rounded-2xl border border-white/10 p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2 text-white/80">
              <RefreshCw className="w-5 h-5" />
              <span className="font-semibold">Active Queue</span>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={cancelAll} className="px-3 py-1.5 text-xs rounded-lg bg-red-500/20 hover:bg-red-500/30 text-red-200 border border-red-500/30">Cancel All</button>
              <button onClick={load} className="px-3 py-1.5 text-xs rounded-lg bg-white/10 hover:bg-white/20 text-white/80 border border-white/20">Refresh</button>
            </div>
          </div>
          <div className="space-y-3">
            {active.length === 0 && (
              <div className="text-white/60 text-sm">No active jobs.</div>
            )}
            {active.map((item) => (
              <div key={item.id} className="rounded-xl border border-white/10 bg-white/5 p-4">
                <div className="flex items-center gap-4">
                  {getStatusIcon(item.status)}
                  <div className="flex-1 min-w-0">
                    <div className="text-white font-medium truncate">{item.title}</div>
                    <div className="flex items-center gap-4 text-xs text-white/70 mt-1">
                      <span className="flex items-center gap-1"><FileType className="w-3 h-3" />{item.format}</span>
                      <span className="flex items-center gap-1"><HardDrive className="w-3 h-3" />{item.size || '—'}</span>
                      {item.eta && <span>ETA {item.eta}</span>}
                      {item.speed && <span>{item.speed}</span>}
                    </div>
                    <div className="w-full bg-white/10 rounded-full h-2 mt-2">
                      <div className="bg-gradient-to-r from-blue-500 to-purple-500 h-2 rounded-full transition-all duration-300" style={{ width: `${Math.max(0, Math.min(100, item.progress ?? 0))}%` }} />
                    </div>
                    {(item.stage) && <div className="text-xs text-white/60 mt-1">{item.stage}</div>}
                  </div>
                  <div className="flex items-center gap-2">
                    {item.status !== 'completed' && (
                      <button onClick={() => cancel(item.id)} className="p-2 bg-red-500/20 hover:bg-red-500/30 border border-red-500/30 rounded-lg transition-all duration-300">
                        <Trash2 className="w-4 h-4 text-red-400" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Queued (desktop) */}
          {isIpc && (
            <div className="mt-6">
              <div className="flex items-center justify-between mb-3">
                <div className="text-white/80 font-semibold flex items-center gap-2"><Clock className="w-4 h-4" />Queued</div>
                <div className="flex items-center gap-2">
                  <div className="text-white/50 text-xs">{queued.length} item(s)</div>
                  <button onClick={async () => { try { const r = await (window as any).api?.queueStartAll?.(); if (!r?.ok) info('Queue paused or empty'); else info('Queue draining'); } catch {} }} disabled={!queued.length} className="px-2.5 py-1 text-[11px] rounded bg-emerald-500/20 border border-emerald-500/30 text-emerald-200 hover:bg-emerald-500/30 disabled:opacity-50">Start all</button>
                  <button onClick={async () => { try { const r = await (window as any).api?.queueClear?.(); if (r?.ok) info('Queue cleared'); else info('Nothing to clear'); } catch {} }} disabled={!queued.length} className="px-2.5 py-1 text-[11px] rounded bg-red-500/20 border border-red-500/30 text-red-200 hover:bg-red-500/30 disabled:opacity-50">Clear all</button>
                </div>
              </div>
              <div className="space-y-2">
                {queued.length === 0 && <div className="text-white/60 text-sm">No queued items.</div>}
                {queued.map((q) => (
                  <div key={q.id} className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 flex items-center gap-3">
                    <div className="text-white/60 text-xs w-6 text-center">{q.position + 1}</div>
                    <div className="flex-1 min-w-0">
                      <div className="text-white text-sm truncate">{q.title}</div>
                      <div className="text-white/60 text-xs truncate">{q.mode === 'audio' ? (q.format || 'm4a') : (q.format || 'best')}</div>
                    </div>
                    <div className="flex items-center gap-1">
                      <button onClick={async () => { try { const r = await (window as any).api?.queueStartNow?.(q.id); if (r?.ok) info('Started'); else toastError('Failed'); } catch { toastError('Failed'); } }} className="px-2 py-1 text-xs rounded bg-green-500/20 border border-green-500/30 text-green-200 hover:bg-green-500/30">Start now</button>
                      <button onClick={async () => { try { const r = await (window as any).api?.queueRemove?.(q.id); if (r?.ok) info('Removed'); else toastError('Failed'); } catch { toastError('Failed'); } }} className="px-2 py-1 text-xs rounded bg-red-500/20 border border-red-500/30 text-red-200 hover:bg-red-500/30">Remove</button>
                      <button onClick={async () => { const to = Math.max(0, q.position - 1); try { const r = await (window as any).api?.queueMove?.(q.id, to); if (!r?.ok) toastError('Move failed'); } catch { toastError('Move failed'); } }} className="px-2 py-1 text-xs rounded bg-white/10 border border-white/20 text-white/80 hover:bg-white/20" title="Move up">↑</button>
                      <button onClick={async () => { const to = Math.min(queued.length - 1, q.position + 1); try { const r = await (window as any).api?.queueMove?.(q.id, to); if (!r?.ok) toastError('Move failed'); } catch { toastError('Move failed'); } }} className="px-2 py-1 text-xs rounded bg-white/10 border border-white/20 text-white/80 hover:bg-white/20" title="Move down">↓</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* History */}
        <div className="bg-white/5 backdrop-blur-md rounded-2xl border border-white/10 p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2 text-white/80">
              <HistoryIcon className="w-5 h-5" />
              <span className="font-semibold">History</span>
            </div>
            <div className="flex items-center gap-2 flex-wrap justify-end">
              <div className="relative">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
                <input value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} placeholder="Search..." className="pl-8 pr-2 py-1.5 text-xs rounded-lg bg-white/10 border border-white/20 text-white/80 placeholder-white/40 focus:outline-none" />
              </div>
              <select value={statusFilter} onChange={(e)=>setStatusFilter(e.target.value as any)} className="px-2 py-1.5 text-xs rounded-lg bg-white/10 border border-white/20 text-white/80">
                <option value="all">All</option>
                <option value="completed">Completed</option>
                <option value="failed">Failed</option>
                <option value="queued">Queued</option>
                <option value="in-progress">In progress</option>
                <option value="canceled">Canceled</option>
              </select>
              <select value={typeFilter} onChange={(e)=>setTypeFilter(e.target.value as any)} className="px-2 py-1.5 text-xs rounded-lg bg-white/10 border border-white/20 text-white/80">
                <option value="all">All types</option>
                <option value="video">Video</option>
                <option value="audio">Audio</option>
                <option value="playlist">Playlist</option>
              </select>
              <select value={sortOrder} onChange={(e)=>setSortOrder(e.target.value as any)} className="px-2 py-1.5 text-xs rounded-lg bg-white/10 border border-white/20 text-white/80">
                <option value="newest">Newest</option>
                <option value="oldest">Oldest</option>
              </select>
              <button onClick={() => {
                try {
                  const blob = new Blob([JSON.stringify(past, null, 2)], { type: 'application/json' });
                  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'history-export.json'; a.click(); URL.revokeObjectURL(a.href);
                } catch {}
              }} className="px-3 py-1.5 text-xs rounded-lg bg-white/10 hover:bg-white/20 text-white/80 border border-white/20">Export</button>
              <button onClick={clearAll} className="px-3 py-1.5 text-xs rounded-lg bg-red-500/20 hover:bg-red-500/30 text-red-200 border border-red-500/30">Clear</button>
              <button onClick={retryLastFailed} className="px-3 py-1.5 text-xs rounded-lg bg-blue-500/20 hover:bg-blue-500/30 text-blue-200 border border-blue-500/30">Retry last</button>
              <button onClick={retryAllFailed} className="px-3 py-1.5 text-xs rounded-lg bg-blue-500/20 hover:bg-blue-500/30 text-blue-200 border border-blue-500/30">Retry failed</button>
              <button onClick={load} className="px-3 py-1.5 text-xs rounded-lg bg-white/10 hover:bg-white/20 text-white/80 border border-white/20">Refresh</button>
            </div>
          </div>
          <div className="space-y-3 pr-1">
            {past.map((item) => (
              <div key={item.id} className="rounded-xl border border-white/10 bg-white/5 p-4">
                <div className="flex items-center gap-4">
                  <div className={`px-3 py-1 rounded-lg border text-xs font-medium ${badgeCls(item.status)}`}>
                    {item.status.charAt(0).toUpperCase() + item.status.slice(1).replace('-', ' ')}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-white font-medium truncate">{item.title}</div>
                    <div className="flex items-center gap-4 text-xs text-white/70 mt-1">
                      <span className="flex items-center gap-1"><FileType className="w-3 h-3" />{item.format}</span>
                      <span className="flex items-center gap-1"><HardDrive className="w-3 h-3" />{item.size || '—'}</span>
                      <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{item.downloadDate}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={async () => { try { await navigator.clipboard.writeText(item.url); info('URL copied'); } catch { toastError('Copy failed'); } }} className="p-2 bg-white/10 hover:bg-white/20 border border-white/20 rounded-lg transition-all duration-300" title="Copy link">
                      <Copy className="w-4 h-4 text-white/70" />
                    </button>
                    {item.status === 'completed' && !isIpc && (
                      <button onClick={() => redownload(item)} className="p-2 bg-green-500/20 hover:bg-green-500/30 border border-green-500/30 rounded-lg transition-all duration-300">
                        <Play className="w-4 h-4 text-green-400" />
                      </button>
                    )}
                    {item.status === 'completed' && isIpc && item.filepath && (
                      <div className="flex items-center gap-2">
                        <button onClick={() => revealPath(item.filepath!)} className="p-2 bg-white/10 hover:bg-white/20 border border-white/20 rounded-lg transition-all duration-300" title="Show in folder">
                          <HardDrive className="w-4 h-4 text-white/70" />
                        </button>
                        <button onClick={() => openPath(item.filepath!)} className="p-2 bg-green-500/20 hover:bg-green-500/30 border border-green-500/30 rounded-lg transition-all duration-300" title="Open file">
                          <Play className="w-4 h-4 text-green-400" />
                        </button>
                      </div>
                    )}
                    {item.status === 'failed' && (
                      <button onClick={() => retry(item)} className="p-2 bg-blue-500/20 hover:bg-blue-500/30 border border-blue-500/30 rounded-lg transition-all duration-300">
                        <RotateCcw className="w-4 h-4 text-blue-400" />
                      </button>
                    )}
                    <button onClick={() => remove(item.id)} className="p-2 bg-red-500/20 hover:bg-red-500/30 border border-red-500/30 rounded-lg transition-all duration-300">
                      <Trash2 className="w-4 h-4 text-red-400" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
            {past.length === 0 && (
              <div className="text-white/60 text-sm">No items found.</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
