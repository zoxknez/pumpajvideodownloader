/** 
 * Simplified web-adapted API library from desktop (deskkgui/src/lib/api.ts)
 * Removes IPC/Electron dependencies, keeps HTTP API calls
 */

// API Base - use env var or fallback
export const API_BASE = 
  (typeof process !== 'undefined' && process?.env?.NEXT_PUBLIC_API) 
    ? String(process.env.NEXT_PUBLIC_API) 
    : 'http://127.0.0.1:5176';

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

// Proxy download (simplified for web - just opens in new tab or downloads via browser)
export async function proxyDownload(opts: { url: string; filename: string; signal?: AbortSignal }) {
  const u = new URL(`${API_BASE}/api/proxy-download`);
  u.searchParams.set('url', opts.url);
  u.searchParams.set('filename', opts.filename);
  
  // For web: simply open download URL
  window.open(u.toString(), '_blank');
}

// Job management (simplified)
export async function startBestJob(payload: { url: string; formatId?: string }) {
  const res = await fetch(`${API_BASE}/api/job/start/best`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`Job start failed: ${res.status}`);
  return await res.json();
}

export async function startAudioJob(payload: { url: string; formatId?: string }) {
  const res = await fetch(`${API_BASE}/api/job/start/audio`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`Job start failed: ${res.status}`);
  return await res.json();
}

export async function cancelJob(id: string) {
  await fetch(`${API_BASE}/api/job/cancel/${id}`, {
    method: 'POST',
    headers: authHeaders(),
  });
}

export function jobFileUrl(id: string): string {
  return `${API_BASE}/api/job/file/${id}`;
}
