/**
 * YouTube-DLP helper functions
 * Extracted from index.ts for better modularity
 */

import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { ffmpegEnabled } from './env.js';

/**
 * Generate HTTP headers for specific domains (YouTube, X/Twitter, Instagram, Facebook)
 */
export function makeHeaders(u: string): string[] {
  try {
    const h = new URL(u).hostname.toLowerCase();
    if (h.includes('youtube.com') || h.includes('youtu.be')) {
      return ['referer: https://www.youtube.com', 'user-agent: Mozilla/5.0'];
    }
    if (h.includes('x.com') || h.includes('twitter.com')) {
      return ['referer: https://x.com', 'user-agent: Mozilla/5.0'];
    }
    if (h.includes('instagram.com')) {
      return ['referer: https://www.instagram.com', 'user-agent: Mozilla/5.0'];
    }
    if (h.includes('facebook.com') || h.includes('fbcdn.net')) {
      return ['referer: https://www.facebook.com', 'user-agent: Mozilla/5.0'];
    }
  } catch {}
  return ['user-agent: Mozilla/5.0'];
}

/**
 * Audio format aliases mapping
 */
const AUDIO_FORMAT_ALIASES = new Map<string, string>([
  ['m4a', 'm4a'],
  ['m4b', 'm4a'],
  ['mp4a', 'm4a'],
  ['aac', 'aac'],
  ['mp3', 'mp3'],
  ['mpeg', 'mp3'],
  ['mpga', 'mp3'],
  ['opus', 'opus'],
  ['vorbis', 'vorbis'],
  ['ogg', 'vorbis'],
  ['oga', 'vorbis'],
  ['flac', 'flac'],
  ['wav', 'wav'],
  ['alac', 'alac'],
]);
export const DEFAULT_AUDIO_FORMAT = 'm4a';

/**
 * Coerce audio format input to canonical format
 */
export function coerceAudioFormat(input: unknown, fallback = DEFAULT_AUDIO_FORMAT): string | null {
  const raw = typeof input === 'string' ? input : input == null ? '' : String(input);
  const trimmed = raw.trim().toLowerCase();
  if (!trimmed) return fallback;
  if (trimmed === 'best') return fallback;
  return AUDIO_FORMAT_ALIASES.get(trimmed) ?? null;
}

/**
 * Returns video format selector based on FFmpeg availability and policy.
 * FFmpeg-free mode: progressive streams only (typically up to 720p on YouTube).
 * FFmpeg mode: adaptive merge (best video + best audio).
 */
export function selectVideoFormat(policy: { maxHeight: number }): string {
  if (ffmpegEnabled()) {
    // Adaptive streams: merge best video + audio (requires FFmpeg)
    return `bv*[height<=?${policy.maxHeight}]+ba/b[height<=?${policy.maxHeight}]`;
  } else {
    // Progressive streams only: pre-muxed video+audio container
    // Fallback chain: exact height match → any progressive with both codecs → best available
    return `b[height<=?${policy.maxHeight}][vcodec!=none][acodec!=none]/b[acodec!=none][vcodec!=none]/best[height<=?${policy.maxHeight}]`;
  }
}

/**
 * Returns audio format options based on FFmpeg availability.
 * FFmpeg-free mode: direct stream (bestaudio[ext=m4a]/bestaudio/best).
 * FFmpeg mode: extract and convert to target format.
 */
export function selectAudioFormat(targetFormat: string): { format?: string; extractAudio?: boolean; audioFormat?: string } {
  if (ffmpegEnabled()) {
    // Extract and convert audio (requires FFmpeg)
    return { extractAudio: true, audioFormat: targetFormat };
  } else {
    // Direct audio stream, prefer m4a container
    return { format: 'bestaudio[ext=m4a]/bestaudio/best' };
  }
}

/**
 * Parse yt-dlp progress line for percentage, speed, ETA
 */
export function parseDlLine(text: string): { pct?: number; speed?: string; eta?: string } {
  const pctMatch = text.match(/(\d{1,3}(?:\.\d+)?)%/);
  const speedMatch = text.match(/\bat\s+([\d.,]+\s*(?:[KMG]?i?B)\/s)\b/i);
  const etaMatch = text.match(/ETA\s+(\d{2}:\d{2}(?::\d{2})?)/i);
  const out: { pct?: number; speed?: string; eta?: string } = {};
  if (pctMatch) out.pct = Math.max(0, Math.min(100, parseFloat(pctMatch[1])));
  if (speedMatch) out.speed = speedMatch[1].replace(/\s+/g, '');
  if (etaMatch) out.eta = etaMatch[1];
  return out;
}

/**
 * Check if text contains progress hints (merging, converting, etc.)
 */
export function hasProgressHint(text: string, needles: string[]): boolean {
  if (!text) return false;
  const lower = text.toLowerCase();
  return needles.some((needle) => lower.includes(needle));
}

/**
 * Calculate rate limit (combines global and policy limits)
 */
export function chosenLimitRateK(policyLimitKbps?: number | null, globalLimitRate?: number): string | undefined {
  const gl = Number(globalLimitRate || 0);
  const pl = Number(policyLimitKbps || 0);
  const chosen = gl > 0 && pl > 0 ? Math.min(gl, pl) : gl > 0 ? gl : pl > 0 ? pl : 0;
  return chosen > 0 ? `${chosen}Ki` : undefined;
}

/**
 * Find produced file by tmpId and extension list
 */
export function findProducedFile(tmpDir: string, tmpId: string, exts: string[]): string | undefined {
  const list = fs.readdirSync(tmpDir);
  return list.find((f) => f.startsWith(tmpId + '.') && exts.some((e) => f.toLowerCase().endsWith(e)));
}

/**
 * Truncate string to max length
 */
export const trunc = (s: string, n = 100): string => (s.length > n ? s.slice(0, n) : s);

/**
 * Sanitize filename for safe filesystem usage
 */
export const safeName = (input: string, max = 100): string =>
  trunc((input || '').replace(/[\n\r"\\]/g, '').replace(/[^\w.-]+/g, '_'), max);

/**
 * Parse df command output for free bytes
 */
function parseDfFreeBytes(output: string): number {
  const lines = String(output || '').trim().split(/\r?\n/);
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    const parts = lines[i]?.trim().split(/\s+/) ?? [];
    if (parts.length >= 4) {
      const availKb = Number(parts[3]);
      if (Number.isFinite(availKb)) return availKb * 1024;
    }
  }
  return -1;
}

/**
 * Parse wmic command output for free bytes
 */
function parseWmicFreeBytes(output: string, drive: string): number {
  const normalizedDrive = drive.replace(/\\$/, '');
  const lines = String(output || '').trim().split(/\r?\n/).slice(1);
  for (const line of lines) {
    if (!line || !line.includes(normalizedDrive)) continue;
    const parts = line.trim().split(/\s+/);
    if (parts.length >= 2) {
      const free = Number(parts[1]);
      if (Number.isFinite(free)) return free;
    }
  }
  return -1;
}

/**
 * Get free disk space in bytes (cross-platform)
 * Returns -1 if unable to determine
 */
export function getFreeDiskBytes(dir: string): number {
  try {
    if (process.platform !== 'win32') {
      const out = spawnSync('df', ['-k', dir], { encoding: 'utf8' });
      if (out.status === 0) {
        const parsed = parseDfFreeBytes(String(out.stdout || ''));
        if (parsed >= 0) return parsed;
      }
    } else {
      const out = spawnSync('wmic', ['logicaldisk', 'get', 'size,freespace,caption'], { encoding: 'utf8' });
      if (out.status === 0) {
        const drive = path.parse(path.resolve(dir)).root;
        const parsed = parseWmicFreeBytes(String(out.stdout || ''), drive);
        if (parsed >= 0) return parsed;
      }
    }
  } catch {}
  return -1;
}

/**
 * Format duration in seconds to human-readable string (e.g., "1d 2h 30m 45s")
 */
export function formatDuration(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const days = Math.floor(s / 86_400);
  const hours = Math.floor((s % 86_400) / 3_600);
  const minutes = Math.floor((s % 3_600) / 60);
  const secs = s % 60;
  const parts: string[] = [];
  if (days) parts.push(`${days}d`);
  if (hours || parts.length) parts.push(`${hours}h`);
  parts.push(`${minutes}m`);
  if (!parts.length || (!days && !hours)) parts.push(`${secs}s`);
  return parts.join(' ');
}

/**
 * Speedy download arguments for yt-dlp
 */
export function speedyDlArgs() {
  return {
    concurrentFragments: 10,
    httpChunkSize: '10M',
    socketTimeout: 20,
    retries: 10,
  };
}

/**
 * Trap child process promise to prevent unhandled rejections
 */
export function trapChildPromise(child: any, label: string, logger?: any) {
  if (child && typeof child.catch === 'function') {
    child.catch((err: any) => {
      try {
        if (logger) {
          logger.error(label, err?.message || err);
        }
      } catch {}
    });
  }
}

/**
 * Clean environment variables for child processes
 */
export function cleanedChildEnv(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const cleaned = { ...env };
  // Remove potentially problematic env vars
  delete cleaned.HTTP_PROXY;
  delete cleaned.HTTPS_PROXY;
  delete cleaned.NO_PROXY;
  delete cleaned.http_proxy;
  delete cleaned.https_proxy;
  delete cleaned.no_proxy;
  return cleaned;
}
