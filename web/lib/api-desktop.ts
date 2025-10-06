/** 
 * Simplified web-adapted API library from desktop (deskkgui/src/lib/api.ts)
 * Removes IPC/Electron dependencies, keeps HTTP API calls
 */

import { getSupabase } from './supabaseClient';
import { API_BASE, apiUrl } from './apiBase';

export { API_BASE } from './apiBase';

const CLIENT_TRACE_HEADER = 'pumpaj-web';
const DEFAULT_TIMEOUT_MS = 20000;

type SignedEntry = { token: string; q: string; exp: number };
const signCache = new Map<string, SignedEntry>();

function randomId() {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
  } catch {}
  return Math.random().toString(36).slice(2, 11);
}

function absoluteUrl(path: string): string {
  if (!path) return apiUrl('/');
  if (/^https?:\/\//i.test(path)) return path;
  return apiUrl(path.startsWith('/') ? path : `/${path}`);
}

function withTimeout<T>(factory: (signal: AbortSignal) => Promise<T>, ms = DEFAULT_TIMEOUT_MS): Promise<T> {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), ms);
  return factory(ac.signal).finally(() => clearTimeout(t));
}

async function buildHeaders(extra?: HeadersInit): Promise<Headers> {
  const combined = await authHeaders(extra);
  const headers = new Headers(combined as HeadersInit);
  if (!headers.has('X-Req-Id')) headers.set('X-Req-Id', randomId());
  if (!headers.has('X-Client-Trace')) headers.set('X-Client-Trace', CLIENT_TRACE_HEADER);
  return headers;
}

export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = await buildHeaders(init.headers);
  const target = absoluteUrl(path);
  const started = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const res = await fetch(target, {
    ...init,
    headers,
    credentials: init.credentials ?? 'include',
  });
  if (typeof performance !== 'undefined') {
    const dur = performance.now() - started;
    if (dur > 10_000) {
      console.debug?.('[apiFetch] slow request', { target, durationMs: Math.round(dur) });
    }
  }
  return res;
}

function cacheKey(id: string, scope: 'download' | 'progress') {
  return `${scope}:${id}`;
}

export function clearSignCache() {
  signCache.clear();
}

export async function getSigned(id: string, scope: 'download' | 'progress'): Promise<SignedEntry> {
  const key = cacheKey(id, scope);
  const now = Date.now();
  const cached = signCache.get(key);
  if (cached && cached.exp - now > 15_000) {
    return cached;
  }

  const path = scope === 'download' ? `/api/job/file/${encodeURIComponent(id)}/sign` : `/api/progress/${encodeURIComponent(id)}/sign`;

  try {
    const res = await apiFetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
    if (!res.ok) {
      signCache.delete(key);
      throw new Error(`sign_failed_${res.status}`);
    }
    const data = await res.json().catch(() => ({}));
    const token = String(data?.token || '');
    const q = String(data?.queryParam || 's');
    if (!token) {
      signCache.delete(key);
      throw new Error('sign_failed_missing_token');
    }
    const exp = Number(data?.expiresAt) || now + 600_000;
    const entry: SignedEntry = { token, q, exp };
    signCache.set(key, entry);
    return entry;
  } catch (err) {
    signCache.delete(key);
    throw err;
  }
}

function supportsFileSystemAccess() {
  return typeof window !== 'undefined' && typeof (window as any).showSaveFilePicker === 'function' && Boolean(window.isSecureContext);
}

export function parseFilename(res: Response, fallback: string) {
  const cd = res.headers.get('content-disposition') || '';
  const match = cd.match(/filename\*?=(?:UTF-8'')?"?([^";]+)"?/i);
  const raw = match ? decodeURIComponent(match[1]) : fallback;
  return raw
    .replace(/[\u0000-\u001f<>:"/\\|?*]+/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120) || fallback;
}

export async function authHeaders(extra?: HeadersInit): Promise<HeadersInit> {
  // Try to get Supabase token first
  const supabase = getSupabase();
  let token: string | null = null;
  
  if (supabase) {
    try {
      const { data } = await supabase.auth.getSession();
      token = data.session?.access_token || null;
    } catch {
      // Fall through to localStorage
    }
  }
  
  // Fallback to localStorage (for backward compatibility)
  if (!token && typeof localStorage !== 'undefined') {
    token = localStorage.getItem('app:token');
  }
  
  const base: Record<string, string> = {};
  if (token) base['Authorization'] = `Bearer ${token}`;
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

export async function analyzeUrl(url: string): Promise<AnalyzeResponse> {
  const u = String(url || '').trim();
  if (!u) throw new Error('URL is required.');
  if (!/^https?:\/\//i.test(u)) throw new Error('URL must start with http:// or https://');
  
  try {
    const res = await withTimeout<Response>((signal) =>
      apiFetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: u }),
        signal,
      })
    );
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(text || `Analyze failed (${res.status})`);
    }
    const json = await res.json();
    return json;
  } catch (err: any) {
    const msg = err?.message || 'Analyze request failed';
    throw new Error(msg);
  }
}

// Format helpers
export function formatDuration(seconds?: number) {
  if (!seconds || !Number.isFinite(seconds)) return '00:00';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function humanSize(bytes?: number): string {
  if (!bytes || !Number.isFinite(bytes)) return '—';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0;
  let val = bytes;
  while (val >= 1024 && i < units.length - 1) { val /= 1024; i++; }
  return `${val.toFixed(i >= 2 ? 1 : 0)} ${units[i]}`;
}

function pickResolution(formats: any[]): string {
  if (!formats.length) return 'Unknown';
  const highest = formats.reduce((a, b) => ((b?.height || 0) > (a?.height || 0) ? b : a));
  return `${highest?.width || '?'}x${highest?.height || '?'}`;
}

function labelQuality(format: any): string {
  const h = format?.height || 0;
  if (h >= 2160) return '4K Ultra';
  if (h >= 1440) return '2K QHD';
  if (h >= 1080) return '1080p FHD';
  if (h >= 720) return '720p HD';
  if (h >= 480) return '480p SD';
  return `${h}p`;
}

export function mapToVideoAnalysis(json: any) {
  const entries = json?.entries || [];
  const base = entries[0] || json || {};
  const formats = Array.isArray(base.formats) ? base.formats : [];
  const vFormats = formats.filter((f: any) => f && f.vcodec && f.vcodec !== 'none');
  const maxFps = Math.max(0, ...vFormats.map((f: any) => f?.fps || 0));
  
  // Subtitles
  const subsMap = (base.subtitles || {}) as Record<string, Array<any>>;
  const autoMap = (base.automatic_captions || {}) as Record<string, Array<any>>;
  const subTracks: Array<{ lang: string; ext: string; url: string; auto?: boolean; name?: string }> = [];
  const pushBest = (lang: string, list: Array<any>, auto?: boolean) => {
    if (!Array.isArray(list) || !list.length) return;
    if (/live\s*chat/i.test(lang)) return;
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
    sourceUrl: base.webpage_url || base.url || '',
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
    hasThumbnails: Boolean(base.thumbnails?.length),
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
  return result;
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
  const sliced = thumbs.slice(-12).sort((a: any, b: any) => (b?.height || 0) - (a?.height || 0));
  
  return {
    sourceUrl: base.webpage_url || base.url || '',
    videoTitle: base.title || 'Video',
    duration: formatDuration(base.duration),
    originalResolution: pickResolution(thumbs),
    hasMultipleThumbnails: thumbs.length > 1,
    thumbnails: sliced.map((t: any, i: number) => ({
      quality: t?.height >= 1080 ? 'Ultra HD' : t?.height >= 720 ? 'High' : 'Standard',
      resolution: `${t?.width || '?'}x${t?.height || '?'}`,
      url: t?.url || '',
      fileSize: humanSize(t?.filesize),
      timestamp: i === 0 ? undefined : `Frame ${i}`,
      badge: i === 0 ? 'popular' : i === 1 ? 'fast' : 'hd',
    })),
  };
}

// Proxy download (simplified for web - browser-based download)
export type DownloadProgress = {
  loaded: number;
  total?: number;
  percent?: number;
  speed?: number;
  eta?: number;
};

export async function proxyDownload(opts: { 
  url: string; 
  filename: string; 
  signal?: AbortSignal;
  onProgress?: (p: DownloadProgress) => void;
}) {
  const u = new URL(`${API_BASE}/api/proxy-download`);
  u.searchParams.set('url', opts.url);
  u.searchParams.set('filename', opts.filename);
  
  // For web: attempt fetch with progress tracking if callback provided
  if (opts.onProgress) {
    try {
      const res = await apiFetch(u.toString(), {
        signal: opts.signal,
      });
      
      if (!res.ok) throw new Error(`Download failed: ${res.status}`);
      
      const total = Number(res.headers.get('content-length') || 0) || undefined;
      const reader = res.body?.getReader();
      if (!reader) throw new Error('No response body');
      const filename = parseFilename(res, opts.filename);
      
      const chunks: Uint8Array[] = [];
      let loaded = 0;
      const started = Date.now();
      
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        chunks.push(value);
        loaded += value.length;
        
        const elapsed = (Date.now() - started) / 1000;
        const speed = elapsed > 0 ? loaded / elapsed : 0;
        const eta = total && speed > 0 ? (total - loaded) / speed : undefined;
        const percent = total ? Math.round((loaded / total) * 100) : undefined;
        
        opts.onProgress({ loaded, total, percent, speed, eta });
      }
      
      // Create blob and trigger download
      const blob = new Blob(chunks as BlobPart[]);
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(blobUrl);
      
    } catch (e: any) {
      if (e?.name !== 'AbortError') {
        console.error('Proxy download failed', e);
      }
      throw e;
    }
  } else {
    // Simple: just open download URL
    window.open(u.toString(), '_blank');
  }
}

// Job management (simplified)
export async function startBestJob(url: string, title?: string): Promise<string> {
  const res = await apiFetch('/api/job/start/best', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url, title }),
  });
  if (!res.ok) throw new Error(`Job start failed: ${res.status}`);
  const data = await res.json();
  return data.id || data.jobId || '';
}

export async function startAudioJob(url: string, title?: string, format?: string): Promise<string> {
  const res = await apiFetch('/api/job/start/audio', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url, title, format }),
  });
  if (!res.ok) throw new Error(`Job start failed: ${res.status}`);
  const data = await res.json();
  return data.id || data.jobId || '';
}

export async function cancelJob(id: string) {
  await apiFetch(`/api/job/cancel/${encodeURIComponent(id)}`, {
    method: 'POST',
  });
}

export function jobFileUrl(id: string): string {
  return absoluteUrl(`/api/job/file/${encodeURIComponent(id)}`);
}

// Additional functions needed by VideoSection
export async function isJobFileReady(id: string): Promise<boolean> {
  try {
    const res = await apiFetch(jobFileUrl(id), {
      method: 'HEAD',
    });
    return res.ok;
  } catch {
    return false;
  }
}

async function saveWithFileSystem(res: Response, filename: string) {
  const body = res.body;
  if (!body) throw new Error('stream_unavailable');
  const picker = await (window as any).showSaveFilePicker({ suggestedName: filename });
  const writable = await picker.createWritable();
  const reader = body.getReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) await writable.write(value);
    }
    await writable.close();
  } catch (err) {
    try { await writable.abort(); } catch {}
    throw err;
  }
}

async function saveAsBlob(res: Response, filename: string) {
  const blob = await res.blob();
  const blobUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = blobUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(blobUrl);
}

export async function downloadJobFile(id: string, fallbackName = 'download.bin'): Promise<boolean> {
  const { token, q } = await getSigned(id, 'download');
  const signed = `${jobFileUrl(id)}?${q}=${encodeURIComponent(token)}`;
  const res = await apiFetch(signed);
  if (!res.ok) {
    throw new ProxyDownloadError('Job file download failed', { status: res.status });
  }
  const filename = parseFilename(res, fallbackName);
  const clone = res.clone();

  if (supportsFileSystemAccess()) {
    try {
      await saveWithFileSystem(res, filename);
      return true;
    } catch (err) {
      console.warn('File System Access fallback', err);
    }
  }

  await saveAsBlob(clone, filename);
  return true;
}

export async function resolveFormatUrl(sourceUrl: string, formatId: string): Promise<string | null> {
  try {
    const res = await apiFetch('/api/get-url', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: sourceUrl, formatId }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data?.url || null;
  } catch {
    return null;
  }
}

export async function subscribeJobProgress(
  id: string,
  onProgress: (data: { progress?: number; stage?: string }) => void,
  onComplete: (status: string) => void
): Promise<{ close: () => void }> {
  let closed = false;
  let es: EventSource | null = null;
  let retries = 0;
  const started = typeof performance !== 'undefined' ? performance.now() : Date.now();

  const finish = (status: string) => {
    if (closed) return;
    closed = true;
    try { es?.close(); } catch {}
    try {
      const durationMs = (typeof performance !== 'undefined' ? performance.now() : Date.now()) - started;
      if (typeof console !== 'undefined') {
        console.debug?.('[subscribeJobProgress] completed', { id, status, durationMs: Math.round(durationMs) });
      }
    } catch {}
    try { onComplete(status); } catch {}
  };

  const open = async (): Promise<void> => {
    const { token, q } = await getSigned(id, 'progress');
    const qs = new URLSearchParams();
    qs.set(q, token);
    const url = `${apiUrl(`/api/progress/${encodeURIComponent(id)}`)}?${qs.toString()}`;
    es = new EventSource(url, { withCredentials: true } as EventSourceInit);

    es.addEventListener('ping', () => {});

    es.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        if (payload.progress !== undefined || payload.stage) {
          onProgress({ progress: payload.progress, stage: payload.stage });
        }
        if (payload.status === 'completed' || payload.status === 'failed') {
          finish(payload.status);
        }
      } catch {}
    };

    es.addEventListener('end', (event: MessageEvent) => {
      let status = 'completed';
      try {
        const data = JSON.parse(event.data);
        if (typeof data?.status === 'string') status = data.status;
      } catch {}
      finish(status);
    });

    es.onerror = async () => {
      try { es?.close(); } catch {}
      if (closed) return;
      if (retries >= 1) {
        finish('failed');
        return;
      }
      retries += 1;
      signCache.delete(cacheKey(id, 'progress'));
      try {
        await open();
      } catch {
        finish('failed');
      }
    };
  };

  await open();

  return {
    close: () => {
      closed = true;
      try { es?.close(); } catch {}
    },
  };
}

export class ProxyDownloadError extends Error {
  status?: number;
  code?: string;
  proxyStatus?: string;
  requestId?: string;
  constructor(message: string, opts?: { status?: number; code?: string; proxyStatus?: string; requestId?: string }) {
    super(message);
    this.name = 'ProxyDownloadError';
    this.status = opts?.status;
    this.code = opts?.code;
    this.proxyStatus = opts?.proxyStatus;
    this.requestId = opts?.requestId;
  }
}

// Settings API
export async function getJobsSettings(): Promise<any> {
  const res = await apiFetch('/api/jobs/settings', {
    method: 'GET',
  });
  if (!res.ok) throw new Error(`Failed to get settings: ${res.status}`);
  return await res.json();
}

export async function updateJobsSettings(settings: any): Promise<void> {
  const res = await apiFetch('/api/jobs/settings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(settings),
  });
  if (!res.ok) throw new Error(`Failed to update settings: ${res.status}`);
}
