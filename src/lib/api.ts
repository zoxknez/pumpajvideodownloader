export type AnalyzeResponse = {
  title?: string;
  uploader?: string;
  channel?: string;
  duration?: number;
  duration_string?: string;
  thumbnail?: string;
  thumbnails?: Array<{ url: string; width?: number; height?: number; filesize?: number }>;
  formats?: Array<{
    url?: string;
    manifest_url?: string;
    fragment_base_url?: string;
    format_id?: string;
    ext?: string;
    height?: number;
    width?: number;
    filesize?: number;
    filesize_approx?: number;
    tbr?: number;
    fps?: number;
    vcodec?: string;
    acodec?: string;
    abr?: number;
    dynamic_range?: string;
  }>;
  entries?: any[];
  view_count?: number;
};

// Compute API base at runtime:
// 1) VITE_API_BASE env (build-time)
// 2) ?apiBase= query override (runtime)
// 3) window.__API_BASE (runtime)
// 4) If loaded from file:// (Electron), default to localhost server
// 5) Otherwise, relative '' to use same-origin/proxy in web
const API_BASE_RUNTIME = (() => {
  try {
    const envBase = (import.meta.env.VITE_API_BASE as string | undefined) || undefined;
    if (envBase) return envBase;
  } catch {}
  try {
    const qs = typeof location !== 'undefined' ? new URLSearchParams(location.search) : undefined;
    const fromQuery = qs?.get('apiBase') || undefined;
    if (fromQuery) return fromQuery;
  } catch {}
  try {
    const fromGlobal = (globalThis as any)?.__API_BASE as string | undefined;
    if (fromGlobal) return fromGlobal;
  } catch {}
  try {
    if (typeof window !== 'undefined' && window.location?.protocol === 'file:') {
      return 'http://127.0.0.1:5176';
    }
  } catch {}
  return '';
})();

export const API_BASE = API_BASE_RUNTIME;
const DEFAULT_TIMEOUT_MS = 20000;

function withTimeout<T>(factory: (signal: AbortSignal) => Promise<T>, ms = DEFAULT_TIMEOUT_MS): Promise<T> {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), ms);
  return factory(ac.signal).finally(() => clearTimeout(t));
}

export function authHeaders(extra?: HeadersInit): HeadersInit {
  const token = (typeof localStorage !== 'undefined') ? localStorage.getItem('app:token') : null;
  const base: Record<string, string> = {};
  if (token) base['Authorization'] = `Bearer ${token}`;
  // Merge any extra headers provided
  if (!extra) return base;
  if (extra instanceof Headers) {
    const out: Record<string, string> = { ...base };
    extra.forEach((v, k) => { out[k] = v; });
    return out;
  }
  if (Array.isArray(extra)) {
    const out: Record<string, string> = { ...base };
    for (const [k, v] of extra) out[String(k)] = String(v);
    return out;
  }
  return { ...base, ...(extra as any) };
}

export async function analyzeUrl(url: string): Promise<AnalyzeResponse> {
  // Zod validation of response shape (subset used by UI)
  const AnalyzeResp = {
    parse(data: any): AnalyzeResponse { return data as any; },
  };
  const u = String(url || '').trim();
  if (!u) throw new Error('URL is required.');
  if (!/^https?:\/\//i.test(u)) throw new Error('URL must start with http:// or https://');
  try {
    // Prefer IPC analyze in Electron
    if (typeof (globalThis as any).window !== 'undefined' && (window as any).api?.analyze) {
      const res = await (window as any).api.analyze(u);
      if (res?.ok && res?.data) return AnalyzeResp.parse(res.data);
      // fallthrough to HTTP if IPC fails
    }
    const res = await withTimeout<Response>((signal) => fetch(`${API_BASE}/api/analyze`, {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ url: u }),
      signal,
    }));
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(text || `Analyze failed (${res.status})`);
    }
    const json = await res.json();
    return AnalyzeResp.parse(json);
  } catch (err: any) {
    const msg = err?.message || 'Analyze request failed';
    throw new Error(msg);
  }
}

// Download helper: accepts either a direct URL or goes through backend proxy.
export type DownloadProgress = { loaded: number; total?: number; pct?: number; speed?: string; eta?: string };
export async function proxyDownload(
  input: { url?: string; filename: string; id?: string; onProgress?: (p: DownloadProgress) => void; signal?: AbortSignal } | string,
  filename?: string
) {
  const isLegacy = typeof input === 'string';
  const directUrl = isLegacy ? (input as string) : input.url;
  const name = (isLegacy ? (filename || 'download') : (input as any).filename || 'download').replace(/[^\w.-]+/g, '_');
  const onProgress = !isLegacy ? (input as any).onProgress as ((p: DownloadProgress) => void) | undefined : undefined;
  const externalSignal = !isLegacy ? (input as any).signal as AbortSignal | undefined : undefined;

  // Always go through backend proxy to ensure same-origin and attachment headers, then download as blob.
  const u = new URL(`${API_BASE}/api/proxy-download`);
  if (!directUrl && !isLegacy && (input as any).id) {
    u.searchParams.set('id', String((input as any).id));
  }
  if (directUrl) u.searchParams.set('url', directUrl);
  u.searchParams.set('filename', name);

  // New-tab preference disabled in desktop app mode

  try {
    // Do NOT use the 20s timeout for large binary downloads
  const res = await fetch(u.toString(), { signal: externalSignal, headers: authHeaders() });
    if (!res.ok) throw new Error(`Proxy download failed (${res.status})`);
    await saveResponseAsFile(res, name, onProgress, externalSignal);
  } catch (e: any) {
    if (e?.name === 'AbortError') return; // silent on cancel
    console.error('Proxy download failed', e);
    alert('Download failed. Please try again.');
  }
}

// Helper: parse filename from Content-Disposition
import { parseFilenameFromContentDisposition as filenameFromContentDisposition, inferExtFromContentType as extFromContentType } from './httpFilename';

import { getDefaultDirHandle, ensureWritePermission } from './fsStore';

function fmtSpeed(bps: number) {
  if (!bps || !Number.isFinite(bps)) return '';
  const units = ['B/s', 'KB/s', 'MB/s', 'GB/s'];
  let i = 0; let v = bps;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
  return `${v.toFixed(i >= 2 ? 1 : 0)} ${units[i]}`;
}

export async function saveResponseAsFile(
  res: Response,
  fallbackName: string,
  onProgress?: (p: DownloadProgress) => void,
  signal?: AbortSignal
) {
  const cd = res.headers.get('content-disposition');
  const ct = res.headers.get('content-type');
  const ctExt = extFromContentType(ct);
  let hinted = filenameFromContentDisposition(cd) || fallbackName || 'download';
  // If name has no extension or has a misleading .txt, patch it from Content-Type when possible
  if (!/\.[a-z0-9]{2,5}$/i.test(hinted) && ctExt) hinted += ctExt;
  else if (/\.txt$/i.test(hinted) && ctExt && !/^text\//i.test(ct || '')) hinted = hinted.replace(/\.txt$/i, ctExt);
  const total = Number(res.headers.get('content-length') || 0) || undefined;
  const started = Date.now();
  let loaded = 0;
  // Try saving to chosen default directory (if available)
  try {
    const handle = await getDefaultDirHandle();
    if (handle && (await ensureWritePermission(handle))) {
      const fileHandle = await (handle as any).getFileHandle(hinted, { create: true });
      const writable: any = await (fileHandle as any).createWritable();
      // Stream to disk if possible to avoid buffering large files in memory
      if (res.body && typeof res.body.getReader === 'function' && writable && typeof writable.write === 'function') {
        const reader = res.body.getReader();
        try {
          while (true) {
            if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
            const { done, value } = await reader.read();
            if (done) break;
            if (value) {
              await writable.write(value);
              loaded += value.byteLength || 0;
              if (onProgress) {
                const elapsed = Math.max(0.001, (Date.now() - started) / 1000);
                const speed = fmtSpeed(loaded / elapsed);
                const pct = total ? Math.min(100, (loaded / total) * 100) : undefined;
                const eta = total && loaded > 0 ? `${Math.max(0, ((total - loaded) / (loaded / elapsed)) | 0)}s` : undefined;
                onProgress({ loaded, total, pct, speed, eta });
              }
            }
          }
        } catch (err: any) {
          if (err?.name !== 'AbortError') throw err;
          // cleanup partial file on cancel
          try { await writable.close(); } catch {}
          try { await (handle as any).removeEntry?.(hinted, { recursive: false }); } catch {}
          return; // canceled
        } finally {
          try { await writable.close(); } catch {}
        }
      } else {
        const blob = await res.blob();
        await writable.write(blob);
        await writable.close();
        if (onProgress) onProgress({ loaded: total || blob.size, total, pct: 100, speed: '', eta: '0s' });
      }
      // Optional hint to open folder later (real opening handled in desktop build)
      try {
        const raw = localStorage.getItem('client:settings');
        const openFolder = raw ? Boolean((JSON.parse(raw) || {}).openFolderAfterSave) : false;
        if (openFolder) {
          // Placeholder: will be wired in desktop packaging (Electron/Tauri)
        }
      } catch {}
      return;
    }
  } catch {}

  // Fallback to browser download (will buffer into memory)
  if (res.body && typeof res.body.getReader === 'function') {
    const reader = res.body.getReader();
    const chunks: BlobPart[] = [];
    while (true) {
      if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        const part = value instanceof Uint8Array ? value : new Uint8Array(value as any);
        chunks.push(part);
        loaded += value.byteLength || 0;
        if (onProgress) {
          const elapsed = Math.max(0.001, (Date.now() - started) / 1000);
          const speed = fmtSpeed(loaded / elapsed);
          const pct = total ? Math.min(100, (loaded / total) * 100) : undefined;
          const eta = total && loaded > 0 ? `${Math.max(0, ((total - loaded) / (loaded / elapsed)) | 0)}s` : undefined;
          onProgress({ loaded, total, pct, speed, eta });
        }
      }
    }
  const blob = new Blob(chunks, { type: ct || 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = hinted;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    if (onProgress) onProgress({ loaded, total: total || blob.size, pct: 100, speed: '', eta: '0s' });
    return;
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = hinted;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// Force-download any API-served file by fetching as blob and saving via anchor
async function downloadUrlAsFile(url: string, fallbackName = 'download'): Promise<void> {
  // No timeout for large binary downloads
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download failed (${res.status})`);
  await saveResponseAsFile(res, fallbackName);
}

export async function downloadJobFile(id: string, fallbackName?: string): Promise<boolean> {
  try {
  const url = jobFileUrl(id);
  await downloadUrlAsFile(url, fallbackName);
    return true;
  } catch {
    return false;
  }
}

export async function resolveFormatUrl(sourceUrl: string, formatId: string): Promise<string | null> {
  try {
  const res = await withTimeout<Response>((signal) => fetch(`${API_BASE}/api/get-url`, {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ url: sourceUrl, formatId }),
      signal,
    }));
    if (!res.ok) return null;
    const data = await res.json();
    return data?.url || null;
  } catch {
    return null;
  }
}

// Public formatter for durations
export function formatDuration(seconds?: number) {
  if (!seconds || !Number.isFinite(seconds)) return '00:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

// Mapping helpers to our UI component shapes
export function mapToVideoAnalysis(json: any) {
  const entries = json?.entries || [];
  const base = entries[0] || json || {};
  const formats = Array.isArray(base.formats) ? base.formats : [];
  const vFormats = formats.filter((f: any) => f && f.vcodec && f.vcodec !== 'none');
  const maxFps = Math.max(0, ...vFormats.map((f: any) => f?.fps || 0));
  // Subtitles: prefer regular subtitles, fallback to automatic captions
  const subsMap = (base.subtitles || {}) as Record<string, Array<any>>;
  const autoMap = (base.automatic_captions || {}) as Record<string, Array<any>>;
  const subTracks: Array<{ lang: string; ext: string; url: string; auto?: boolean; name?: string }> = [];
  const pushBest = (lang: string, list: Array<any>, auto?: boolean) => {
    if (!Array.isArray(list) || !list.length) return;
    // Ignore special tracks (e.g., LIVE_CHAT) and unsupported ext (json/srv3)
    if (/live\s*chat/i.test(lang) || /^live[_-]?chat$/i.test(lang)) return;
    const preferred = ['vtt','srt'];
    const best = list.find(x => preferred.includes(String(x?.ext || '').toLowerCase()));
    if (best?.url && preferred.includes(String(best.ext || '').toLowerCase())) {
      subTracks.push({ lang, ext: String(best.ext || 'vtt'), url: String(best.url), auto: Boolean(auto), name: String(best.name || '') });
    }
  };
  for (const [lang, list] of Object.entries(subsMap)) pushBest(lang, list as any, false);
  if (subTracks.length === 0) {
    for (const [lang, list] of Object.entries(autoMap)) pushBest(lang, list as any, true);
  }
  const chapters = Array.isArray(base.chapters) ? base.chapters.map((c: any) => ({
    title: String(c?.title || ''),
    start: Number(c?.start_time || c?.start || 0) || 0,
    end: Number(c?.end_time || c?.end || 0) || undefined,
  })) : [];
  const result = {
    videoTitle: base.title || 'Video',
    duration: formatDuration(base.duration),
    originalResolution: pickResolution(vFormats) || 'Unknown',
    maxFrameRate: Number.isFinite(maxFps) ? maxFps : 60,
    videoCodec: (vFormats[0]?.vcodec) || 'H.264',
    audioCodec: (base.acodec || 'AAC') as string,
    hasHDR: Boolean(vFormats.find((f: any) => /hdr/i.test(f?.dynamic_range || ''))),
    fileSize: humanSize(base.filesize || base.filesize_approx),
  hasSubtitles: subTracks.length > 0,
  subtitles: subTracks.slice(0, 12),
    hasChapters: chapters.length > 0,
    chapters,
    formats: vFormats
      .sort((a: any, b: any) => (b?.height || 0) - (a?.height || 0))
      .slice(0, 12)
  .map((f: any) => ({
        url: f?.url || f?.manifest_url || f?.fragment_base_url || '',
        formatId: f?.format_id,
        format: String(f?.ext || 'mp4').toUpperCase(),
        quality: labelQuality(f),
        resolution: `${f?.width || '?'}x${f?.height || '?'}`,
        fileSize: humanSize(f?.filesize || f?.filesize_approx),
        bitrate: f?.tbr ? `${Math.round(f.tbr)} kbps` : undefined,
        fps: f?.fps,
        codec: f?.vcodec,
  badge: f?.fps && f.fps > 30 ? 'recommended' : 'fast',
        isHdr: /hdr/i.test(f?.dynamic_range || ''),
    label: `${labelQuality(f)}${f?.fps ? ` ${f.fps}fps` : ''}`,
      })),
  };
  return { ...result, videoFormats: (result as any).formats } as typeof result & { videoFormats: (typeof result.formats) };
}

export function mapToAudioAnalysis(json: any) {
  const entries = json?.entries || [];
  const base = entries[0] || json || {};
  const formats = Array.isArray(base.formats) ? base.formats : [];
  const aFormats = formats.filter((f: any) => f && f.acodec && f.acodec !== 'none' && (!f.vcodec || f.vcodec === 'none'));
  return {
    duration: formatDuration(base.duration),
    audioFormats: aFormats
      .sort((a: any, b: any) => (b?.abr || 0) - (a?.abr || 0))
      .slice(0, 10)
      .map((f: any) => ({
        url: f?.url || '',
        formatId: f?.format_id,
        format: String(f?.ext || 'm4a').toUpperCase(),
        bitrate: f?.abr ? `${Math.round(f.abr)} kbps` : '—',
        size: humanSize(f?.filesize || f?.filesize_approx),
  quality: f?.abr && f.abr >= 320 ? 'studio' : f?.abr && f.abr >= 192 ? 'standard' : 'compact',
      })),
    metadata: {
      title: base.title || 'Audio',
      artist: base.uploader,
      album: 'Downloaded Media',
    },
  };
}

export function mapToThumbnails(json: any) {
  const entries = json?.entries || [];
  const base = entries[0] || json || {};
  const thumbs = Array.isArray(base.thumbnails) ? base.thumbnails : [];
  // choose last 12 + prefer higher res first
  const sliced = thumbs.slice(-12).sort((a: any, b: any) => (b?.height || 0) - (a?.height || 0));
  return {
    videoTitle: base.title || 'Video',
    duration: formatDuration(base.duration),
    originalResolution: pickResolution(Array.isArray(base.formats) ? base.formats : []) || 'Unknown',
    hasMultipleThumbnails: thumbs.length > 1,
    thumbnails: sliced.map((t: any) => ({
      quality: `${t?.height || '?'}p`,
      resolution: `${t?.width || '?'}x${t?.height || '?'}`,
      url: t?.url,
      fileSize: t?.filesize ? humanSize(t.filesize) : '',
      timestamp: undefined,
  badge: (t?.height || 0) >= 1080 ? 'hd' : (t?.height || 0) >= 720 ? 'hd' : 'fast',
    })),
  };
}

function humanSize(bytes?: number) {
  if (!bytes || !Number.isFinite(bytes)) return '';
  const units = ['B', 'KB', 'MB', 'GB'];
  let i = 0;
  let val = bytes;
  while (val >= 1024 && i < units.length - 1) {
    val /= 1024;
    i++;
  }
  return `${val.toFixed(i >= 2 ? 1 : 0)} ${units[i]}`;
}

function pickResolution(formats: any[]) {
  const f = [...formats].sort((a, b) => (b?.height || 0) - (a?.height || 0))[0];
  if (!f) return undefined;
  return `${f?.width || '?'}x${f?.height || '?'}`;
}

function labelQuality(f: any) {
  const h = f?.height || 0;
  if (h >= 2160) return '4K Ultra';
  if (h >= 1440) return '1440p QHD';
  if (h >= 1080) return '1080p FHD';
  if (h >= 720) return '720p HD';
  return `${h}p`;
}

// Job-based downloads (server merges to temp file with SSE progress & cancel)
export async function startBestJob(sourceUrl: string, title: string) {
  const res = await withTimeout<Response>((signal) => fetch(`${API_BASE}/api/job/start/best`, {
    method: 'POST',
  headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ url: sourceUrl, title }),
    signal,
  }));
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(text || `Failed to start job (${res.status})`);
  }
  const data = await res.json();
  return String(data?.id || '');
}

export async function startAudioJob(sourceUrl: string, title: string, format: 'm4a' | 'mp3' = 'm4a') {
  const res = await withTimeout<Response>((signal) => fetch(`${API_BASE}/api/job/start/audio`, {
    method: 'POST',
  headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ url: sourceUrl, title, format }),
    signal,
  }));
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(text || `Failed to start audio job (${res.status})`);
  }
  const data = await res.json();
  return String(data?.id || '');
}

export async function cancelJob(id: string) {
  const res = await withTimeout<Response>((signal) => fetch(`${API_BASE}/api/job/cancel/${encodeURIComponent(id)}`, {
    method: 'POST', signal, headers: authHeaders(),
  }));
  return res.ok;
}

export function jobFileUrl(id: string) {
  const tok = (typeof localStorage !== 'undefined') ? localStorage.getItem('app:token') : null;
  const base = `${API_BASE}/api/job/file/${encodeURIComponent(id)}`;
  return tok ? `${base}?token=${encodeURIComponent(tok)}` : base;
}

// Check if a job file is ready without downloading it (HEAD request)
export async function isJobFileReady(id: string): Promise<boolean> {
  try {
    const url = jobFileUrl(id);
  const res = await fetch(url, { method: 'HEAD', cache: 'no-store', headers: authHeaders() });
    if (res.ok) return true;
    // Some servers may not allow HEAD; try a tiny ranged GET as a readiness probe
    if (res.status === 405 || res.status === 501) {
      try {
        const ac = new AbortController();
        const t = setTimeout(() => ac.abort(), 4000);
  const r2 = await fetch(url, { headers: { Range: 'bytes=0-0', ...authHeaders() }, signal: ac.signal, cache: 'no-store' });
        clearTimeout(t);
        return r2.ok;
      } catch {
        return false;
      }
    }
    return false;
  } catch {
    return false;
  }
}

export function subscribeJobProgress(id: string, onData: (p: { progress?: number; stage?: string; speed?: string; eta?: string }) => void, onEnd?: (status: string) => void) {
  const tok = (typeof localStorage !== 'undefined') ? encodeURIComponent(localStorage.getItem('app:token') || '') : '';
  const url = `${API_BASE}/api/progress/${encodeURIComponent(id)}${tok ? `?token=${tok}` : ''}`;
  let es: EventSource | null = null;
  let backoff = 1000;
  let stopped = false;
  const open = () => {
    if (stopped) return;
    es = new EventSource(url);
    es.onopen = () => { backoff = 1000; };
    es.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data || '{}');
        onData?.({
          progress: typeof msg.progress === 'number' ? msg.progress : undefined,
          stage: msg.stage,
          speed: msg.speed,
          eta: msg.eta,
        });
      } catch {}
    };
    const onEndEvt = (ev: any) => {
      try {
        const msg = JSON.parse(ev?.data || '{}');
        onEnd?.(String(msg?.status || 'completed'));
      } catch { onEnd?.('completed'); }
      stopped = true; // don't reconnect after end
      try { es?.close(); } catch {}
    };
    es.addEventListener('end', onEndEvt as any);
    es.onerror = () => {
      try { es?.close(); } catch {}
      if (!stopped) {
        setTimeout(open, backoff);
        backoff = Math.min(backoff * 2, 30000);
      }
    };
  };
  open();
  return { close: () => { stopped = true; try { es?.close(); } catch {} } };
}

// Jobs settings (server-side)
export type JobsSettings = { maxConcurrent: number; proxyUrl?: string; limitRateKbps?: number };
export async function getJobsSettings(): Promise<JobsSettings> {
  const res = await withTimeout<Response>((signal) => fetch(`${API_BASE}/api/jobs/settings`, { signal, cache: 'no-store', headers: authHeaders() }));
  if (!res.ok) throw new Error('Failed to load settings');
  const j = await res.json();
  return {
    maxConcurrent: Number(j?.maxConcurrent ?? 2),
    proxyUrl: j?.proxyUrl ? String(j.proxyUrl) : undefined,
    limitRateKbps: Number(j?.limitRateKbps ?? 0) || 0,
  };
}
export async function updateJobsSettings(input: JobsSettings): Promise<JobsSettings> {
  const res = await withTimeout<Response>((signal) => fetch(`${API_BASE}/api/jobs/settings`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({
      maxConcurrent: Number(input.maxConcurrent ?? 2),
      proxyUrl: input.proxyUrl || '',
      limitRateKbps: Number(input.limitRateKbps || 0),
    }),
    signal,
  }));
  if (!res.ok) throw new Error('Failed to save settings');
  const j = await res.json();
  return {
    maxConcurrent: Number(j?.maxConcurrent ?? input.maxConcurrent ?? 2),
    proxyUrl: j?.proxyUrl ? String(j.proxyUrl) : undefined,
    limitRateKbps: Number(j?.limitRateKbps ?? input.limitRateKbps ?? 0) || 0,
  };
}