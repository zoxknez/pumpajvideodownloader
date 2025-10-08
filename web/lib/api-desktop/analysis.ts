import type { VideoAnalysisData } from '@/types/downloader';
import { apiFetch, withTimeout } from './client';

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

const humanSize = (bytes?: number): string => {
  if (!bytes || !Number.isFinite(bytes)) return '—';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let index = 0;
  let value = bytes;
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024;
    index += 1;
  }
  return `${value.toFixed(index >= 2 ? 1 : 0)} ${units[index]}`;
};

const pickResolution = (formats: any[]): string => {
  if (!formats.length) return 'Unknown';
  const highest = formats.reduce((previous, current) => ((current?.height || 0) > (previous?.height || 0) ? current : previous));
  return `${highest?.width || '?'}x${highest?.height || '?'}`;
};

const labelQuality = (format: any): string => {
  const height = format?.height || 0;
  if (height >= 2160) return '4K Ultra';
  if (height >= 1440) return '2K QHD';
  if (height >= 1080) return '1080p FHD';
  if (height >= 720) return '720p HD';
  if (height >= 480) return '480p SD';
  return `${height}p`;
};

const toSubTrack = (list: Array<any>, lang: string, auto: boolean, bucket: VideoAnalysisData['subtitles']) => {
  if (!Array.isArray(list) || !list.length) return;
  if (/live\s*chat/i.test(lang)) return;
  const preferred = ['vtt', 'srt'];
  const best = list.find((entry) => preferred.includes(String(entry?.ext || '').toLowerCase()));
  if (best?.url && best?.ext && preferred.includes(String(best.ext || '').toLowerCase())) {
    bucket?.push({
      lang,
      ext: String(best.ext || 'vtt'),
      url: String(best.url),
      auto,
      name: String(best.name || ''),
    });
  }
};

const extractSubtitles = (base: any) => {
  const subtitles: VideoAnalysisData['subtitles'] = [];
  const manual = (base.subtitles || {}) as Record<string, Array<any>>;
  const automatic = (base.automatic_captions || {}) as Record<string, Array<any>>;

  Object.entries(manual).forEach(([lang, list]) => toSubTrack(list as any[], lang, false, subtitles));
  if (!subtitles.length) {
    Object.entries(automatic).forEach(([lang, list]) => toSubTrack(list as any[], lang, true, subtitles));
  }

  return subtitles;
};

const extractChapters = (base: any) => {
  if (!Array.isArray(base.chapters)) return [] as NonNullable<VideoAnalysisData['chapters']>;
  return base.chapters.map((chapter: any) => ({
    title: String(chapter?.title || ''),
    start: Number(chapter?.start_time || chapter?.start || 0) || 0,
    end: Number(chapter?.end_time || chapter?.end || 0) || undefined,
  })) as NonNullable<VideoAnalysisData['chapters']>;
};

const mapVideoFormats = (formats: any[]): VideoAnalysisData['formats'] =>
  formats
    .filter((entry: any) => entry && entry.vcodec && entry.vcodec !== 'none')
    .sort((a: any, b: any) => (b?.height || 0) - (a?.height || 0))
    .slice(0, 12)
    .map((format: any) => ({
      url: format?.url || format?.manifest_url || format?.fragment_base_url || '',
      formatId: format?.format_id,
      format: String(format?.ext || 'mp4').toUpperCase(),
      quality: labelQuality(format),
      resolution: `${format?.width || '?'}x${format?.height || '?'}`,
      fileSize: humanSize(format?.filesize || format?.filesize_approx),
      bitrate: format?.tbr ? `${Math.round(format.tbr)} kbps` : undefined,
      fps: format?.fps,
      codec: format?.vcodec,
      badge: format?.fps && format.fps > 30 ? 'recommended' : 'fast',
      isHdr: /hdr/i.test(format?.dynamic_range || ''),
      label: `${labelQuality(format)}${format?.fps ? ` ${format.fps}fps` : ''}`,
    }));

const mapAudioFormats = (formats: any[]) =>
  formats
    .filter((entry: any) => entry && entry.acodec && entry.acodec !== 'none' && (!entry.vcodec || entry.vcodec === 'none'))
    .sort((a: any, b: any) => (b?.abr || 0) - (a?.abr || 0))
    .slice(0, 10)
    .map((format: any) => ({
      url: format?.url || '',
      formatId: format?.format_id,
      format: String(format?.ext || 'm4a').toUpperCase(),
      bitrate: format?.abr ? `${Math.round(format.abr)} kbps` : '—',
      size: humanSize(format?.filesize || format?.filesize_approx),
      quality: (format?.abr && format.abr >= 320
        ? 'studio'
        : format?.abr && format.abr >= 192
        ? 'standard'
        : 'compact') as 'studio' | 'standard' | 'compact',
    }));

export function formatDuration(seconds?: number) {
  if (!seconds || !Number.isFinite(seconds)) return '00:00';
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  if (hours > 0) return `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  return `${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

const mapThumbnails = (thumbnails: any[]) =>
  thumbnails
    .slice(-12)
    .sort((a: any, b: any) => (b?.height || 0) - (a?.height || 0))
    .map((thumbnail: any, index: number) => ({
      quality: thumbnail?.height >= 1080 ? 'Ultra HD' : thumbnail?.height >= 720 ? 'High' : 'Standard',
      resolution: `${thumbnail?.width || '?'}x${thumbnail?.height || '?'}`,
      url: thumbnail?.url || '',
      fileSize: humanSize(thumbnail?.filesize),
      timestamp: index === 0 ? undefined : `Frame ${index}`,
      badge: index === 0 ? 'popular' : index === 1 ? 'fast' : 'hd',
    }));

const extractBase = (json: any) => {
  const entries = json?.entries || [];
  return entries[0] || json || {};
};

export async function analyzeUrl(url: string): Promise<AnalyzeResponse> {
  const value = String(url || '').trim();
  if (!value) throw new Error('URL is required.');
  if (!/^https?:\/\//i.test(value)) throw new Error('URL must start with http:// or https://');

  try {
    const response = await withTimeout<Response>((signal) =>
      apiFetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: value }),
        signal,
      })
    );
    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(text || `Analyze failed (${response.status})`);
    }
    return response.json();
  } catch (error: any) {
    const message = error?.message || 'Analyze request failed';
    throw new Error(message);
  }
}

export function mapToVideoAnalysis(json: any): VideoAnalysisData {
  const base = extractBase(json);
  const formats = Array.isArray(base.formats) ? base.formats : [];
  const videoFormats = formats.filter((entry: any) => entry && entry.vcodec && entry.vcodec !== 'none');
  const maxFps = Math.max(0, ...videoFormats.map((entry: any) => entry?.fps || 0));
  const subtitles = extractSubtitles(base);
  const chapters = extractChapters(base);

  return {
    sourceUrl: base.webpage_url || base.url || '',
    videoTitle: base.title || 'Video',
    duration: formatDuration(base.duration),
    originalResolution: pickResolution(videoFormats) || 'Unknown',
    maxFrameRate: Number.isFinite(maxFps) ? maxFps : 60,
    videoCodec: videoFormats[0]?.vcodec || 'H.264',
    audioCodec: base.acodec || 'AAC',
    hasHDR: Boolean(videoFormats.find((entry: any) => /hdr/i.test(entry?.dynamic_range || ''))),
    fileSize: humanSize(base.filesize || base.filesize_approx),
    hasSubtitles: subtitles.length > 0,
    subtitles: subtitles.slice(0, 12),
  hasChapters: chapters.length > 0,
  chapters,
    hasThumbnails: Boolean(base.thumbnails?.length),
    formats: mapVideoFormats(videoFormats),
  };
}

export function mapToAudioAnalysis(json: any) {
  const base = extractBase(json);
  const formats = Array.isArray(base.formats) ? base.formats : [];
  return {
    duration: formatDuration(base.duration),
    audioFormats: mapAudioFormats(formats),
    metadata: {
      title: base.title || 'Audio',
      artist: base.uploader,
      album: 'Downloaded Media',
    },
  };
}

export function mapToThumbnails(json: any) {
  const base = extractBase(json);
  const thumbs = Array.isArray(base.thumbnails) ? base.thumbnails : [];
  return {
    sourceUrl: base.webpage_url || base.url || '',
    videoTitle: base.title || 'Video',
    duration: formatDuration(base.duration),
    originalResolution: pickResolution(thumbs),
    hasMultipleThumbnails: thumbs.length > 1,
    thumbnails: mapThumbnails(thumbs),
  };
}
