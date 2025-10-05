"use client";
import { useEffect, useMemo, useState } from 'react';
import { apiUrl } from '@/lib/api';

type VersionInfo = {
  name: string;
  version: string;
  node: string;
  platform: string;
  ytDlp: string;
  ffmpeg: string;
  ffmpegVersion: string;
  checks: { ytdlpAvailable: boolean; ffmpegAvailable: boolean };
  port: number;
  settings: { maxConcurrent: number; proxyUrl: string; limitRateKbps: number };
  uptimeSeconds: number;
  uptimeLabel: string;
  disk: { tmpDir: string; freeMB: number; freeBytes: number };
  queues: { totalJobs: number; running: number; waiting: number };
  batches: { total: number; active: number };
};

export function HealthPanel() {
  const [info, setInfo] = useState<VersionInfo | null>(null);
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);
  const [lastChecked, setLastChecked] = useState<Date | null>(null);
  const numberFmt = useMemo(() => new Intl.NumberFormat('en-US'), []);

  async function load() {
    setLoading(true); setErr('');
    try {
      const r = await fetch(apiUrl('/api/version'), { cache: 'no-store' });
      if (!r.ok) throw new Error(await r.text());
      const j = await r.json();
      setInfo(j);
      setLastChecked(new Date());
    } catch (e: any) {
      setErr(e?.message || 'Failed to load version');
      setLastChecked(new Date());
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  // Status badge: green if healthy, yellow if error, red if no data
  const statusColor = err ? 'bg-yellow-500' : info ? 'bg-emerald-500' : 'bg-slate-500';
  const statusBadge = err ? '🟡' : info ? '🟢' : '⚪';

  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-4 text-xs text-slate-200">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-slate-100">Server Health</span>
          <span className={`inline-block w-2 h-2 rounded-full ${statusColor}`} title={err ? 'Error' : info ? 'Healthy' : 'Unknown'}></span>
          {lastChecked && (
            <span className="text-[10px] text-slate-400">
              Last: {lastChecked.toLocaleTimeString()}
            </span>
          )}
        </div>
        <button onClick={load} disabled={loading} className="rounded bg-slate-900/60 hover:bg-slate-800/70 px-2 py-1 border border-white/10 text-[11px] disabled:opacity-50">{loading ? '…' : 'Refresh'}</button>
      </div>
      {err && <div className="text-rose-300 mb-2">{err}</div>}
      {info && (
        <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3">
          <div className="space-y-1">
            <div className="font-semibold">App</div>
            <div>{info.name}@{info.version}</div>
            <div>Node {info.node}</div>
            <div>{info.platform}</div>
          </div>
          <div className="space-y-1">
            <div className="font-semibold">Uptime</div>
            <div>{info.uptimeLabel}</div>
            <div className="text-slate-400">{numberFmt.format(info.uptimeSeconds)} s</div>
          </div>
          <div className="space-y-1">
            <div className="font-semibold">yt-dlp</div>
            <div>{info.ytDlp || 'unknown'}</div>
            <div className={info.checks.ytdlpAvailable ? 'text-emerald-300' : 'text-rose-300'}>
              {info.checks.ytdlpAvailable ? 'available' : 'missing'}
            </div>
          </div>
          <div className="space-y-1">
            <div className="font-semibold">ffmpeg</div>
            <div>{info.ffmpeg}</div>
            <div className={info.checks.ffmpegAvailable ? 'text-emerald-300' : 'text-rose-300'}>
              {info.checks.ffmpegAvailable ? 'available' : 'missing'}
            </div>
          </div>
          <div className="space-y-1">
            <div className="font-semibold">Disk</div>
            <div>{info.disk.freeMB >= 0 ? `${numberFmt.format(info.disk.freeMB)} MB free` : 'unknown'}</div>
            <div className="text-slate-400 break-all">tmp: {info.disk.tmpDir}</div>
          </div>
          <div className="space-y-1">
            <div className="font-semibold">Concurrency</div>
            <div>Max: {info.settings.maxConcurrent}</div>
            <div>Rate: {info.settings.limitRateKbps} kb/s</div>
          </div>
          <div className="space-y-1">
            <div className="font-semibold">Proxy</div>
            <div>{info.settings.proxyUrl ? info.settings.proxyUrl : 'none'}</div>
            <div>Port {info.port}</div>
          </div>
          <div className="space-y-1">
            <div className="font-semibold">Queue</div>
            <div>Running: {info.queues.running}</div>
            <div>Waiting: {info.queues.waiting}</div>
            <div className="text-slate-400">Total tracked: {info.queues.totalJobs}</div>
          </div>
          <div className="space-y-1">
            <div className="font-semibold">Batches</div>
            <div className={info.batches.active > 0 ? 'text-yellow-300' : 'text-emerald-300'}>
              Active: {info.batches.active}
            </div>
            <div className="text-slate-400">Total: {info.batches.total}</div>
          </div>
        </div>
      )}
      {!info && !err && !loading && <div className="opacity-60">Nema podataka.</div>}
    </div>
  );
}
