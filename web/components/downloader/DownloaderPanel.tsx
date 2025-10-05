'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { API_BASE } from '@/lib/api';

type Format = {
  format_id: string;
  ext?: string;
  format_note?: string;
  acodec?: string;
  vcodec?: string;
  tbr?: number;
  abr?: number;
  vbr?: number;
  filesize?: number;
  resolution?: string;
  width?: number;
  height?: number;
};

type YtdlpInfo = {
  title?: string;
  extractor?: string;
  webpage_url?: string;
  duration?: number;
  formats?: Format[];
};

function prettySize(bytes?: number) {
  if (!bytes || bytes <= 0) return '';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let index = 0;
  let value = bytes;
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024;
    index += 1;
  }
  return `${value.toFixed(1)} ${units[index]}`;
}

function formatLabel(format: Format) {
  const resolution = format.resolution || (format.height ? `${format.height}p` : '');
  const note = format.format_note || '';
  const bitrate = format.tbr || format.vbr || format.abr;
  const kbps = bitrate ? `${Math.round(bitrate)} kbps` : '';
  return [resolution, note, kbps].filter(Boolean).join(' · ');
}

type DownloaderPanelProps = {
  prefilledUrl?: string;
  analyzeSignal?: number;
  showUrlInput?: boolean;
};

export default function DownloaderPanel({ prefilledUrl, analyzeSignal, showUrlInput = true }: DownloaderPanelProps = {}) {
  const [url, setUrl] = useState(() => prefilledUrl?.trim() ?? '');
  const [info, setInfo] = useState<YtdlpInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    if (!prefilledUrl) return;
    const trimmed = prefilledUrl.trim();
    if (!trimmed) return;
    setUrl((prev) => (prev === trimmed ? prev : trimmed));
  }, [prefilledUrl]);

  const performAnalyze = useCallback(async (rawUrl: string) => {
    const candidate = rawUrl.trim();
    if (!candidate) return;
    setErr('');
    setInfo(null);
    setLoading(true);
    setUrl(candidate);
    try {
      const response = await fetch(`${API_BASE}/api/analyze?url=${encodeURIComponent(candidate)}`, {
        credentials: 'include',
      });
      if (!response.ok) {
        const message = await response.text();
        throw new Error(message || 'Analyze failed');
      }
      const payload: YtdlpInfo = await response.json();
      setInfo(payload);
    } catch (error: unknown) {
      setErr(error instanceof Error ? error.message : 'Analyze failed');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!prefilledUrl || !analyzeSignal) return;
    const trimmed = prefilledUrl.trim();
    if (!trimmed) return;
    void performAnalyze(trimmed);
  }, [prefilledUrl, analyzeSignal, performAnalyze]);

  const open302 = (params: Record<string, string | undefined>) => {
    const search = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value) search.set(key, value);
    });
    window.open(`${API_BASE}/api/redirect?${search.toString()}`, '_blank');
  };

  const proxy = (params: Record<string, string | undefined>) => {
    const search = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value) search.set(key, value);
    });
    if (info?.title) search.set('filename', info.title);
    window.open(`${API_BASE}/api/proxy-download?${search.toString()}`, '_blank');
  };

  const muxed = useMemo(() => {
    const list = (info?.formats || []).filter(
      (format) => format.vcodec && format.vcodec !== 'none' && format.acodec && format.acodec !== 'none',
    );
    return list
      .sort((a, b) => (b.height || 0) - (a.height || 0) || (b.tbr || 0) - (a.tbr || 0))
      .slice(0, 8);
  }, [info]);

  const audioOnly = useMemo(() => {
    const list = (info?.formats || []).filter(
      (format) => (!format.vcodec || format.vcodec === 'none') && format.acodec && format.acodec !== 'none',
    );
    return list
      .sort((a, b) => (b.abr || b.tbr || 0) - (a.abr || a.tbr || 0))
      .slice(0, 6);
  }, [info]);

  const normalizedUrl = url.trim();
  const disabled = !normalizedUrl || loading;

  const renderError = (className?: string) =>
    err ? (
      <div className={`rounded-lg border border-red-500/40 bg-red-500/15 px-3 py-2 text-sm text-red-200${className ? ` ${className}` : ''}`}>
        {err}
      </div>
    ) : null;

  return (
    <div className="space-y-4">
      {showUrlInput && (
        <div className="rounded-2xl border border-white/10 bg-white/[0.06] p-4 backdrop-blur-xl">
          <div className="flex gap-2">
            <input
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') void performAnalyze(url);
              }}
              placeholder="Paste video/playlist URL…"
              className="flex-1 rounded-xl border border-white/12 bg-white/[0.04] px-4 py-3.5 text-white placeholder-white/55 outline-none focus:border-blue-400/60 focus:ring-2 focus:ring-blue-500/20"
            />
            <button
              onClick={() => void performAnalyze(url)}
              disabled={disabled}
              className="rounded-xl px-4 py-3.5 font-semibold text-white bg-blue-600 hover:bg-blue-500 disabled:cursor-not-allowed disabled:bg-blue-900/60"
            >
              {loading ? 'Analyzing…' : 'Analyze'}
            </button>
          </div>
          {renderError('mt-3')}
        </div>
      )}

      {!showUrlInput && err && (
        <div className="rounded-2xl border border-white/10 bg-white/[0.06] p-4 backdrop-blur-xl">
          {renderError()}
        </div>
      )}

      {info && (
        <div className="rounded-2xl border border-white/10 bg-white/[0.06] p-4 backdrop-blur-xl space-y-4">
          <div className="text-white/90 text-sm">
            <div className="font-semibold truncate">{info.title || 'Result'}</div>
            <div className="text-white/60 truncate">{info.webpage_url || url}</div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => open302({ url: normalizedUrl, kind: 'best' })}
              className="rounded-xl px-4 py-3 font-semibold text-white bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500"
            >
              Open best (302)
            </button>
            <button
              onClick={() => proxy({ url: normalizedUrl, kind: 'best' })}
              className="rounded-xl px-4 py-3 font-semibold text-white border border-white/12 bg-white/[0.06] hover:bg-white/[0.1]"
            >
              Proxy best
            </button>

            <button
              onClick={() => open302({ url: normalizedUrl, kind: 'audio' })}
              className="rounded-xl px-4 py-3 font-semibold text-white bg-gradient-to-r from-purple-600 to-fuchsia-600 hover:from-purple-500 hover:to-fuchsia-500"
            >
              Open audio (302)
            </button>
            <button
              onClick={() => proxy({ url: normalizedUrl, kind: 'audio' })}
              className="rounded-xl px-4 py-3 font-semibold text-white border border-white/12 bg-white/[0.06] hover:bg-white/[0.1]"
            >
              Proxy audio
            </button>
          </div>

          {muxed.length > 0 && (
            <div>
              <div className="mb-2 text-xs uppercase tracking-wider text-white/60">Video (muxed)</div>
              <div className="space-y-2">
                {muxed.map((format) => (
                  <div
                    key={`mux-${format.format_id}`}
                    className="flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2"
                  >
                    <div className="min-w-0">
                      <div className="text-white/90 text-sm truncate">
                        {format.format_id} · {format.ext || '—'} · {formatLabel(format)}
                      </div>
                      <div className="text-xs text-white/50">{prettySize(format.filesize)}</div>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => open302({ url: normalizedUrl, format_id: format.format_id })}
                        className="rounded-lg px-3 py-1.5 text-sm text-white bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500"
                      >
                        Open
                      </button>
                      <button
                        onClick={() => proxy({ url: normalizedUrl, format_id: format.format_id })}
                        className="rounded-lg px-3 py-1.5 text-sm text-white/90 border border-white/12 bg-white/[0.08] hover:bg-white/[0.12]"
                      >
                        Proxy
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {audioOnly.length > 0 && (
            <div>
              <div className="mb-2 text-xs uppercase tracking-wider text-white/60">Audio only</div>
              <div className="space-y-2">
                {audioOnly.map((format) => (
                  <div
                    key={`audio-${format.format_id}`}
                    className="flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2"
                  >
                    <div className="min-w-0">
                      <div className="text-white/90 text-sm truncate">
                        {format.format_id} · {format.ext || '—'} · {formatLabel(format)}
                      </div>
                      <div className="text-xs text-white/50">{prettySize(format.filesize)}</div>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => open302({ url: normalizedUrl, format_id: format.format_id })}
                        className="rounded-lg px-3 py-1.5 text-sm text-white bg-gradient-to-r from-purple-600 to-fuchsia-600 hover:from-purple-500 hover:to-fuchsia-500"
                      >
                        Open
                      </button>
                      <button
                        onClick={() => proxy({ url: normalizedUrl, format_id: format.format_id })}
                        className="rounded-lg px-3 py-1.5 text-sm text-white/90 border border-white/12 bg-white/[0.08] hover:bg-white/[0.12]"
                      >
                        Proxy
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
