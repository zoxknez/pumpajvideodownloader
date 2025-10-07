/**
 * Environment variable utilities
 * Consistent parsing of boolean and optional values
 */

import { spawnSync } from 'node:child_process';

/**
 * Parse truthy environment variable
 * Accepts: 1, true, yes, on (case-insensitive)
 */
export const isTrue = (v?: string): boolean => 
  /^(1|true|yes|on)$/i.test(String(v || ''));

/**
 * Parse falsy environment variable
 * Accepts: 0, false, no, off (case-insensitive)
 */
export const isFalse = (v?: string): boolean => 
  /^(0|false|no|off)$/i.test(String(v || ''));

let ffmpegAvailable: boolean | null = null;

function detectFfmpegBinary(): boolean {
  const candidates: (string | undefined)[] = [
    process.env.FFMPEG_PATH?.trim(),
    'ffmpeg',
  ];

  for (const candidate of candidates) {
    if (!candidate) continue;
    try {
      const result = spawnSync(candidate, ['-version'], {
        stdio: 'ignore',
        windowsHide: true,
      });
      if (result.status === 0) return true;
    } catch {
      // ignore and try next candidate
    }
  }

  return false;
}

/**
 * Check if FFmpeg is enabled.
 * Behaviour:
 *  - ENABLE_FFMPEG=false → always disabled
 *  - ENABLE_FFMPEG=true  → force enable (caller guarantees binary exists)
 *  - unset               → auto-detect local/system ffmpeg; fallback to disabled when missing
 */
export const ffmpegEnabled = (): boolean => {
  if (ffmpegAvailable !== null) return ffmpegAvailable;

  if (isFalse(process.env.ENABLE_FFMPEG)) {
    ffmpegAvailable = false;
    return ffmpegAvailable;
  }

  if (isTrue(process.env.ENABLE_FFMPEG)) {
    ffmpegAvailable = true;
    return ffmpegAvailable;
  }

  ffmpegAvailable = detectFfmpegBinary();
  if (!ffmpegAvailable) {
    console.warn('[env] FFmpeg binary not detected – running in progressive-only mode. Set ENABLE_FFMPEG=true to force enable.');
  }
  return ffmpegAvailable;
};

/**
 * Get environment variable with default
 */
export const getEnv = (key: string, defaultValue = ''): string => 
  process.env[key] || defaultValue;

/**
 * Get integer environment variable with default
 */
export const getEnvInt = (key: string, defaultValue: number): number => {
  const val = process.env[key];
  if (!val) return defaultValue;
  const parsed = parseInt(val, 10);
  return Number.isFinite(parsed) ? parsed : defaultValue;
};

/**
 * Get float environment variable with default
 */
export const getEnvFloat = (key: string, defaultValue: number): number => {
  const val = process.env[key];
  if (!val) return defaultValue;
  const parsed = parseFloat(val);
  return Number.isFinite(parsed) ? parsed : defaultValue;
};
