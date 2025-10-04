export type AppConfig = {
  port: number;
  corsOrigin: true | string | RegExp | (string | RegExp)[] | undefined;
  allowedHosts?: string[]; // optional allowlist of hostnames (e.g., youtube.com, youtu.be)
  maxFileSizeMb?: number; // --max-filesize
  maxDurationSec?: number; // --match-filter "duration <= N"
  proxyDownloadMaxPerMin?: number; // per-route limiter for /api/proxy-download
  minFreeDiskMb?: number; // minimum free disk (MB) before rejecting new jobs
};
import { readServerSettings } from './settings.js';

function parseCorsOrigin(input: string | undefined): AppConfig['corsOrigin'] {
  if (!input) return true; // allow any by default for dev
  const val = input.trim();
  if (val === 'disabled') return undefined;
  if (val === '*' || val === 'true') return true;
  // comma-separated list
  const parts = val.split(',').map(s => s.trim()).filter(Boolean);
  return parts.length > 1 ? parts : parts[0];
}

export function loadConfig(): AppConfig {
  // Prefer explicit PORT; otherwise use last known working port from settings; fallback to 5176
  let port = Number(process.env.PORT || '');
  if (!Number.isFinite(port)) {
    try {
  const last = readServerSettings?.();
      if (last && Number.isFinite(last.lastPort)) port = Number(last.lastPort);
    } catch {}
  }
  if (!Number.isFinite(port)) port = 5176;
  const corsOrigin = parseCorsOrigin(process.env.CORS_ORIGIN);
  const allowedHosts = (process.env.ALLOWED_HOSTS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const maxFileSizeMb = Number(process.env.MAX_FILESIZE_MB || '');
  const maxDurationSec = Number(process.env.MAX_DURATION_SEC || '');
  const proxyDownloadMaxPerMin = Number(process.env.PROXY_DOWNLOAD_MAX_PER_MIN || '');
  const minFreeDiskMbRaw = process.env.MIN_FREE_DISK_MB;
  const minFreeDiskMb = Number(minFreeDiskMbRaw ?? '');
  const resolvedMinFree = (() => {
    if (minFreeDiskMbRaw === undefined) return 200;
    if (Number.isFinite(minFreeDiskMb) && minFreeDiskMb >= 0) return Math.floor(minFreeDiskMb);
    return 200;
  })();
  return {
    port: Number.isFinite(port) ? port : 5176,
    corsOrigin,
    allowedHosts: allowedHosts.length ? allowedHosts : undefined,
    maxFileSizeMb: Number.isFinite(maxFileSizeMb) && maxFileSizeMb > 0 ? Math.floor(maxFileSizeMb) : undefined,
    maxDurationSec: Number.isFinite(maxDurationSec) && maxDurationSec > 0 ? Math.floor(maxDurationSec) : undefined,
    proxyDownloadMaxPerMin: Number.isFinite(proxyDownloadMaxPerMin) && proxyDownloadMaxPerMin > 0 ? Math.floor(proxyDownloadMaxPerMin) : undefined,
    minFreeDiskMb: resolvedMinFree > 0 ? resolvedMinFree : undefined,
  };
}
