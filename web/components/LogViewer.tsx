"use client";
import { useEffect, useState, useCallback } from 'react';
import { apiUrl } from '@/lib/api';

type Level = '' | 'debug' | 'info' | 'warn' | 'error';

export function LogViewer() {
  const [lines, setLines] = useState<string[]>([]);
  const [level, setLevel] = useState<Level>('');
  const [q, setQ] = useState('');
  const [limit, setLimit] = useState(300);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>('');
  const [auto, setAuto] = useState(true);

  const fetchLogs = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const params = new URLSearchParams();
      if (level) params.set('level', level);
      if (q.trim()) params.set('q', q.trim());
      if (limit) params.set('lines', String(limit));
      const res = await fetch(apiUrl(`/api/logs/recent?${params.toString()}`), { cache: 'no-store' });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setLines(Array.isArray(data.lines) ? data.lines : []);
    } catch (err: any) {
      setError(err?.message || 'Failed to load logs');
    } finally {
      setLoading(false);
    }
  }, [level, q, limit]);

  useEffect(() => { fetchLogs(); }, [fetchLogs]);

  useEffect(() => {
    if (!auto) return;
    const id = setInterval(fetchLogs, 5000);
    return () => clearInterval(id);
  }, [auto, fetchLogs]);

  return (
    <div className="mt-6 rounded-xl border border-white/10 bg-white/5 p-4 text-xs text-slate-200">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="font-semibold text-slate-100">Server Logs</span>
        <select value={level} onChange={(e) => setLevel(e.target.value as Level)} className="rounded bg-slate-900/70 px-2 py-1 border border-white/10">
          <option value="">All levels</option>
          <option value="error">Error</option>
            <option value="warn">Warn</option>
          <option value="info">Info</option>
          <option value="debug">Debug</option>
        </select>
        <input
          placeholder="search…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="rounded bg-slate-900/70 px-2 py-1 border border-white/10"
          style={{ minWidth: 160 }}
        />
        <input
          type="number"
          min={50}
          max={1000}
          value={limit}
          onChange={(e) => setLimit(Math.max(50, Math.min(1000, parseInt(e.target.value || '300', 10))))}
          className="w-24 rounded bg-slate-900/70 px-2 py-1 border border-white/10"
        />
        <label className="flex items-center gap-1 text-[11px]">
          <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} /> auto
        </label>
        <button onClick={fetchLogs} disabled={loading} className="rounded bg-gradient-to-r from-rose-500 to-purple-500 px-3 py-1 text-white text-xs disabled:opacity-50">
          {loading ? 'Loading…' : 'Refresh'}
        </button>
      </div>
      {error && <div className="mb-2 text-rose-300">{error}</div>}
      <div className="max-h-72 overflow-auto font-mono leading-snug whitespace-pre">
        {lines.length === 0 && !loading && <div className="opacity-60">No log lines.</div>}
        {lines.map((l, i) => (
          <div key={i} className="py-[1px]">{l}</div>
        ))}
      </div>
    </div>
  );
}
