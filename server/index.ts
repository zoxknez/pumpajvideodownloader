// server.ts (clean, drop-in zamena)
// ESM + TypeScript (Node 18+). Zadržava postojeći API i ponašanje.

import express, { type Response, type NextFunction } from 'express';
import rateLimit from 'express-rate-limit';
import cors from 'cors';
import type { CorsOptions } from 'cors';
import ytdlp from 'youtube-dl-exec';
import path from 'node:path';
import { Readable } from 'node:stream';
import os from 'node:os';
import fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import type { ChildProcess } from 'node:child_process';
import { spawnSync } from 'node:child_process';

import { getLogger } from './core/logger.js';
import { loadConfig } from './core/config.js';
import { isUrlAllowed } from './core/urlAllow.js';
import { buildCorsOrigin } from './core/corsOrigin.js';
import { appendHistory, readHistory, updateHistory, removeHistory, clearHistory } from './core/history.js';
import { readServerSettings, writeServerSettings } from './core/settings.js';
import { requestLogger } from './middleware/requestLog.js';
import { errorHandler } from './middleware/error.js';
import { AnalyzeBody } from './core/validate.js';
import { assertPublicHttpHost } from './core/ssrfGuard.js';
import { normalizeYtError } from './core/errors.js';
import { dumpJson as dumpInfoJson, cleanedChildEnv } from './core/yt.js';
import { mountAuthRoutes } from './routes/auth.js';
import { applySecurity } from './middleware/security.js';
import { createProxyDownloadHandler } from './routes/proxyDownload.js';
import { ytDlpArgsFromPolicy } from './core/policyEnforce.js';
import { authActivate } from './routes/authActivate.js';
import { requireAuth } from './middleware/auth.js';
import { policyFor } from './core/policy.js';
import { HttpError } from './core/httpError.js';
import { wrap } from './core/wrap.js';
import { mountPromMetrics } from './routes/metricsProm.js';
import { createMetricsRegistry } from './core/metrics.js';
import { tokenBucket } from './middleware/tokenBucket.js';
import { requireAuthOrSigned } from './middleware/signed.js';
import { metricsMiddleware, signIssued, signTtl } from './middleware/httpMetrics.js';
import { signToken } from './core/signed.js';
import { traceContext } from './middleware/trace.js';
import { analyzeRateLimit, batchRateLimit } from './middleware/rateLimit.js';

// ---- Optional ffmpeg-static (fallback na system ffmpeg) ----
let ffmpegBinary: string | undefined;
try {
  const mod = await import('ffmpeg-static');
  ffmpegBinary = (mod as any)?.default || (mod as any);
} catch {}

// ---- App init / middleware ----
const log = getLogger('server');
const cfg = loadConfig();
export const metrics = createMetricsRegistry();
const proxyDownload = createProxyDownloadHandler(cfg, metrics);
const MIN_FREE_DISK_BYTES =
  typeof cfg.minFreeDiskMb === 'number' && cfg.minFreeDiskMb > 0
    ? Math.floor(cfg.minFreeDiskMb * 1024 * 1024)
    : 0;

const proxyBucket = tokenBucket({ rate: 120, burst: 180 });
const jobBucket = tokenBucket({ rate: 180, burst: 240 });
const progressBucket = tokenBucket({ rate: 240, burst: 360 });
const signBucket = tokenBucket({ rate: 60, burst: 120 });

export const app = express();

const trustedProxyCidrs = (process.env.TRUST_PROXY_CIDRS || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
if (trustedProxyCidrs.length > 0) {
  app.set('trust proxy', trustedProxyCidrs);
} else {
  app.set('trust proxy', ['loopback', 'linklocal', 'uniquelocal']);
}
applySecurity(app, process.env.CORS_ORIGIN);

// Rate limit (global + token-aware za job/download)
// Global
const limiter = rateLimit({ windowMs: 60_000, max: 120 });
app.use(limiter);

// CORS
const corsOptions: CorsOptions = {
  origin: buildCorsOrigin(process.env.CORS_ORIGIN),
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'Accept',
    'X-Requested-With',
    'X-Req-Id',
    'x-req-id',
    'X-Request-Id',
    'Traceparent',
    'traceparent',
    'X-Traceparent',
  ],
  exposedHeaders: ['Content-Disposition', 'Content-Length', 'Content-Type', 'X-Request-Id', 'Proxy-Status', 'Retry-After', 'X-Traceparent'],
  maxAge: 86400,
};
app.use(cors(corsOptions));
app.use((req, res, next) => {
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }
  next();
});
app.use((_req, res, next) => {
  res.setHeader('Vary', 'Origin');
  next();
});

// Minimalna HPP sanitizacija (query samo 1 vrednost po ključu)
app.use((req, _res, next) => {
  try {
    for (const k of Object.keys(req.query)) {
      const v: any = (req.query as any)[k];
      if (Array.isArray(v)) (req.query as any)[k] = v[0];
    }
  } catch {}
  next();
});

// Hard body cap pre JSON parsera (DoS guard)
app.use((req, res, next) => {
  const len = Number(req.headers['content-length'] || 0);
  if (len > 2_000_000) return res.status(413).end();
  next();
});

// JSON
app.use(express.urlencoded({ extended: false, limit: '100kb' }));
app.use(express.json({ limit: '200kb' }));
app.use(traceContext);
app.use(requestLogger);
mountPromMetrics(app, metrics);
app.use('/api/proxy-download', metricsMiddleware('proxy-download'));
app.use('/api/job/file/:id', metricsMiddleware('job-file'));
app.use('/api/progress/:id', metricsMiddleware('progress'));

// ========================
// Globalno stanje poslova
// ========================
type Job = {
  id: string;
  type: 'video' | 'audio';
  child?: ChildProcess & { killed?: boolean };
  tmpId: string;
  tmpDir: string;
  produced?: string; // basename u tmpDir kad završi
  userId?: string; // za per-user concurrency
  concurrencyCap?: number;
  version: number;
};

function bumpJobVersion(job?: Job) {
  if (!job) return;
  const current = Number.isFinite(job.version) ? job.version : 0;
  job.version = Math.max(1, current + 1);
}

const jobs = new Map<string, Job>();
type WaitingItem = { job: Job; run: () => void };
const waiting: WaitingItem[] = [];
const running = new Set<string>(); // jobIds
const sseListeners = new Map<string, Set<Response>>();
const sseBuffers = new Map<string, string[]>();
const SSE_BUFFER_SIZE = 20;

Object.assign(app.locals as Record<string, unknown>, {
  jobs,
  waiting,
  running,
  sseListeners,
  sseBuffers,
  minFreeDiskBytes: MIN_FREE_DISK_BYTES,
  metrics,
});

let MAX_CONCURRENT = 2;
let PROXY_URL: string | undefined;
let LIMIT_RATE: number | undefined; // KiB/s

// ========================
// Batch praćenje
// ========================
type BatchItem = { url: string; jobId: string };
type Batch = {
  id: string;
  userId?: string;
  createdAt: number;
  finishedAt?: number;
  mode: 'video' | 'audio';
  format?: string; // audio format u audio modu
  items: BatchItem[];
};
const batches = new Map<string, Batch>();

// Učitaj perzistirane postavke ako postoje
try {
  const saved = readServerSettings();
  if (saved.maxConcurrent && Number.isFinite(saved.maxConcurrent)) {
    MAX_CONCURRENT = Math.max(1, Math.min(6, Math.floor(saved.maxConcurrent)));
  }
  if (saved.proxyUrl) PROXY_URL = saved.proxyUrl;
  if (saved.limitRateKbps && Number.isFinite(saved.limitRateKbps)) {
    LIMIT_RATE = Math.max(0, Math.floor(saved.limitRateKbps));
  }
} catch {}

// ========================
// Pomoćne funkcije
// ========================
const trunc = (s: string, n = 100) => (s.length > n ? s.slice(0, n) : s);
const safeName = (input: string, max = 100) =>
  trunc((input || '').replace(/[\n\r"\\]/g, '').replace(/[^\w.-]+/g, '_'), max);

function hasProgressHint(text: string, needles: string[]): boolean {
  if (!text) return false;
  const lower = text.toLowerCase();
  return needles.some((needle) => lower.includes(needle));
}

function appendVary(res: Response, value: string) {
  const existing = res.getHeader('Vary');
  if (!existing) {
    res.setHeader('Vary', value);
    return;
  }
  const parts = String(existing)
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
  if (!parts.includes(value)) parts.push(value);
  res.setHeader('Vary', parts.join(', '));
}

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

// df / wmic: best-effort slobodan prostor (bytes ili -1)
function getFreeDiskBytes(dir: string): number {
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

function formatDuration(seconds: number): string {
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

function speedyDlArgs() {
  return {
    concurrentFragments: 10,
    httpChunkSize: '10M',
    socketTimeout: 20,
    retries: 10,
    fragmentRetries: 10,
  } as const;
}

function makeHeaders(u: string): string[] {
  try {
    const h = new URL(u).hostname.toLowerCase();
    if (h.includes('youtube.com') || h.includes('youtu.be')) {
      return ['referer: https://www.youtube.com', 'user-agent: Mozilla/5.0'];
    }
    if (h.includes('x.com') || h.includes('twitter.com')) {
      return ['referer: https://x.com', 'user-agent: Mozilla/5.0'];
    }
  } catch {}
  return ['user-agent: Mozilla/5.0'];
}

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
const DEFAULT_AUDIO_FORMAT = 'm4a';

function coerceAudioFormat(input: unknown, fallback = DEFAULT_AUDIO_FORMAT): string | null {
  const raw = typeof input === 'string' ? input : input == null ? '' : String(input);
  const trimmed = raw.trim().toLowerCase();
  if (!trimmed) return fallback;
  if (trimmed === 'best') return fallback;
  return AUDIO_FORMAT_ALIASES.get(trimmed) ?? null;
}

function trapChildPromise(child: any, label: string) {
  if (child && typeof child.catch === 'function') {
    child.catch((err: any) => {
      try {
        log.error(label, err?.message || err);
      } catch {}
    });
  }
}

// Unified: izvuče %/brzinu/ETA iz yt-dlp linije
function parseDlLine(text: string): { pct?: number; speed?: string; eta?: string } {
  const pctMatch = text.match(/(\d{1,3}(?:\.\d+)?)%/);
  const speedMatch = text.match(/\bat\s+([\d.,]+\s*(?:[KMG]?i?B)\/s)\b/i);
  const etaMatch = text.match(/ETA\s+(\d{2}:\d{2}(?::\d{2})?)/i);
  const out: { pct?: number; speed?: string; eta?: string } = {};
  if (pctMatch) out.pct = Math.max(0, Math.min(100, parseFloat(pctMatch[1])));
  if (speedMatch) out.speed = speedMatch[1].replace(/\s+/g, '');
  if (etaMatch) out.eta = etaMatch[1];
  return out;
}

function chosenLimitRateK(policyLimitKbps?: number | null): string | undefined {
  const gl = Number(LIMIT_RATE || 0);
  const pl = Number(policyLimitKbps || 0);
  const chosen = gl > 0 && pl > 0 ? Math.min(gl, pl) : gl > 0 ? gl : pl > 0 ? pl : 0;
  return chosen > 0 ? `${chosen}K` : undefined;
}

function findProducedFile(tmpDir: string, tmpId: string, exts: string[]) {
  const list = fs.readdirSync(tmpDir);
  return list.find((f) => f.startsWith(tmpId + '.') && exts.some((e) => f.toLowerCase().endsWith(e)));
}

// ========================
// SSE listeners & ring buffer
// ========================
function addSseListener(id: string, res: Response) {
  if (!sseListeners.has(id)) sseListeners.set(id, new Set());
  sseListeners.get(id)!.add(res);
}

function removeSseListener(id: string, res: Response) {
  const set = sseListeners.get(id);
  if (!set) return;
  set.delete(res);
  if (set.size === 0) sseListeners.delete(id);
}

function pushSse(id: string, payload: any, event?: string, explicitId?: number) {
  const eventId = explicitId ?? Date.now();
  const frame = `${event ? `event: ${event}\n` : ''}id: ${eventId}\n` + `data: ${JSON.stringify(payload)}\n\n`;
  let buf = sseBuffers.get(id);
  if (!buf) {
    buf = [];
    sseBuffers.set(id, buf);
  }
  buf.push(frame);
  if (buf.length > SSE_BUFFER_SIZE) buf.shift();

  const set = sseListeners.get(id);
  if (set && set.size > 0) {
    for (const res of Array.from(set)) {
      try {
        res.write(frame);
      } catch {
        try { res.end(); } catch {}
        try { set.delete(res); } catch {}
      }
    }
    if (set.size === 0) sseListeners.delete(id);
  }

  return eventId;
}

function emitProgress(id: string, data: any) {
  pushSse(id, { id, ...data });
}

// ========================
// Queue & throttling
// ========================
const lastPctWritten = new Map<string, number>();
function updateHistoryThrottled(id: string, pct?: number, extra?: Record<string, any>) {
  try {
    let should = true;
    if (typeof pct === 'number') {
      const last = lastPctWritten.get(id) ?? -1;
      const step = Math.floor(pct);
      if (step === last) should = false;
      else lastPctWritten.set(id, step);
    }
    if (should) {
      updateHistory(id, { ...(typeof pct === 'number' ? { progress: pct } : {}), ...(extra || {}) });
    }
  } catch {}
}
function clearHistoryThrottle(id: string) {
  lastPctWritten.delete(id);
}

function cleanupJobFiles(job: Job) {
  bumpJobVersion(job);
  try {
    const list = fs.readdirSync(job.tmpDir);
    for (const f of list) {
      if (f.startsWith(job.tmpId + '.')) {
        const full = path.join(job.tmpDir, f);
        try { fs.unlinkSync(full); } catch {}
      }
    }
  } catch {}
}

type JobTerminalStatus = 'completed' | 'failed' | 'canceled';
type FinalizeJobOptions = {
  job?: Job;
  keepJob?: boolean;
  keepFiles?: boolean;
  removeListeners?: boolean;
  extra?: Record<string, unknown>;
};

function finalizeJob(id: string, status: JobTerminalStatus, options: FinalizeJobOptions = {}) {
  const {
    job,
    keepJob = status === 'completed',
    keepFiles = status === 'completed',
    removeListeners = true,
    extra,
  } = options;

  try { clearHistoryThrottle(id); } catch {}

  pushSse(id, { id, status, ...(extra || {}) }, 'end');

  if (removeListeners) {
    const set = sseListeners.get(id);
    if (set) {
      for (const res of Array.from(set)) {
        try { res.end(); } catch {}
        try { set.delete(res); } catch {}
      }
      if (set.size === 0) {
        try { sseListeners.delete(id); } catch {}
      }
    }
  }

  if (!keepFiles && job) {
    try { cleanupJobFiles(job); } catch {}
  }

  if (!keepJob) {
    try { jobs.delete(id); } catch {}
  }

  try { running.delete(id); } catch {}
}

Object.assign(app.locals as Record<string, unknown>, {
  finalizeJob,
  pushSse,
  emitProgress,
  minFreeDiskBytes: MIN_FREE_DISK_BYTES,
});

function schedule() {
  const runningCountFor = (uid?: string) => {
    if (!uid) return 0;
    let n = 0;
    for (const id of running) {
      const j = jobs.get(id);
      if (j?.userId === uid) n++;
    }
    return n;
  };

  while (running.size < MAX_CONCURRENT && waiting.length > 0) {
    const idx = waiting.findIndex(({ job }) => {
      const cap = Math.max(1, Number(job.concurrencyCap || 1));
      return runningCountFor(job.userId) < cap;
    });
    if (idx < 0) break;
    const next = waiting.splice(idx, 1)[0]!;
    running.add(next.job.id);
    updateHistory(next.job.id, { status: 'in-progress' });
    emitProgress(next.job.id, { progress: 0, stage: 'starting' });
    try {
      next.run();
    } catch {
      running.delete(next.job.id);
      updateHistory(next.job.id, { status: 'failed' });
      emitProgress(next.job.id, { stage: 'failed' });
    }
  }
}

// ========================
// Helpers za batch
// ========================
function summarizeBatch(b: Batch) {
  const items = readHistory();
  let completed = 0, failed = 0, canceled = 0, runningCt = 0, queuedCt = 0;
  for (const it of b.items) {
    const h = items.find((x) => x.id === it.jobId);
    switch (h?.status) {
      case 'completed': completed++; break;
      case 'failed': failed++; break;
      case 'canceled': canceled++; break;
      case 'in-progress': runningCt++; break;
      case 'queued': queuedCt++; break;
    }
  }
  const total = b.items.length;
  const done = completed + failed + canceled;
  if (!b.finishedAt && done === total) b.finishedAt = Date.now();
  return {
    id: b.id,
    userId: b.userId,
    createdAt: b.createdAt,
    finishedAt: b.finishedAt || null,
    mode: b.mode,
    format: b.format,
    total,
    completed,
    failed,
    canceled,
    running: runningCt,
    queued: queuedCt,
    items: b.items.map(it => {
      const h = items.find(x => x.id === it.jobId);
      return { url: it.url, jobId: it.jobId, status: h?.status || 'unknown', progress: h?.progress ?? 0 };
    })
  };
}

// ========================
// Public endpoints
// ========================
app.get('/health', (_req, res) => res.json({ ok: true }));
app.get('/ready', (_req, res) => res.json({ ok: true }));

app.get('/', (_req, res) => {
  res.type('text/html').send(`<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Pumpaj API</title>
<style>
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;margin:0;background:#0f172a;color:#e2e8f0}
main{max-width:720px;margin:0 auto;padding:48px 32px 64px}
h1{font-size:2rem;margin-bottom:.25rem}p{margin:.5rem 0 1.5rem;color:rgba(226,232,240,.8)}code{background:rgba(15,23,42,.7);padding:.15rem .35rem;border-radius:6px;font-size:.95rem}
ul{padding-left:1.2rem}li{margin-bottom:.75rem}a{color:#60a5fa;text-decoration:none}a:hover{text-decoration:underline}
.card{background:rgba(15,23,42,.65);border:1px solid rgba(148,163,184,.25);border-radius:18px;padding:24px 28px;box-shadow:0 24px 65px rgba(15,23,42,.45)}
.badge{display:inline-flex;align-items:center;gap:.4rem;padding:.25rem .65rem;border-radius:999px;background:rgba(59,130,246,.15);color:#bfdbfe;text-transform:uppercase;font-size:.7rem;letter-spacing:.08em}
.links{margin-top:1.75rem;display:flex;flex-wrap:wrap;gap:1rem}.links a{display:inline-flex;align-items:center;gap:.35rem;padding:.4rem .75rem;border-radius:12px;border:1px solid rgba(148,163,184,.25)}
@media (max-width:600px){main{padding:36px 20px 48px}}
</style></head>
<body>
<main>
  <div class="badge">Pumpaj API</div>
  <h1>Backend je aktivan</h1>
  <p>Server pokreće yt-dlp/ffmpeg poslove. UI: <a href="https://pumpajvideodown.vercel.app" target="_blank" rel="noopener">pumpajvideodown.vercel.app</a>.</p>
  <div class="card">
    <h2>Brzi endpointi</h2>
    <ul>
      <li><code>GET /health</code></li>
      <li><code>GET /api/version</code></li>
      <li><code>POST /api/job/start/best</code></li>
      <li><code>GET /api/progress/:id</code></li>
    </ul>
  <p>Docs: <a href="https://github.com/o0o0o0o0o0o0o0o0o0o0o0o0o0o0o0o/pumpaj_video_downloader#readme" target="_blank" rel="noopener">GitHub README</a></p>
  </div>
  <div class="links"><a href="/health">🚦 Health</a><a href="/ready">🟢 Ready</a><a href="/api/version">📦 API version</a></div>
</main>
</body></html>`);
});

// Auth
mountAuthRoutes(app);
app.post('/auth/activate', authActivate);

// ========================
// /api/version (diag)
// ========================
app.get('/api/version', (_req, res) => {
  try {
    let pkg: any = {};
    try {
      const p = path.join(process.cwd(), 'package.json');
      if (fs.existsSync(p)) pkg = JSON.parse(fs.readFileSync(p, 'utf8'));
    } catch {}
    let ytVersion = '';
    try {
      const out = spawnSync('yt-dlp', ['--version'], { encoding: 'utf8' });
      if (out?.status === 0) ytVersion = String(out.stdout || '').trim();
    } catch {}
  const ffmpegPath = ffmpegBinary || 'ffmpeg';
    let ffmpegVersion = '';
    try {
      const out = spawnSync(ffmpegPath, ['-version'], { encoding: 'utf8' });
      if (out?.status === 0) ffmpegVersion = String(out.stdout || '').split(/\r?\n/, 1)[0];
    } catch {}
    const freeBytes = getFreeDiskBytes(os.tmpdir());
    res.json({
      name: pkg?.name || 'yt-dlp-server',
      version: pkg?.version || '0.0.0',
      node: process.version,
      platform: `${process.platform} ${process.arch}`,
      ytDlp: ytVersion || 'unknown',
      ffmpeg: ffmpegBinary ? 'bundled' : ffmpegVersion ? 'system' : 'system/unknown',
      ffmpegPath,
      ffmpegVersion: ffmpegVersion || '',
      checks: {
        ytdlpAvailable: Boolean(ytVersion),
        ffmpegAvailable: Boolean(ffmpegVersion),
      },
      port: cfg.port,
      settings: {
        maxConcurrent: MAX_CONCURRENT,
        proxyUrl: PROXY_URL || '',
        limitRateKbps: LIMIT_RATE || 0,
      },
      uptimeSeconds: Math.floor(process.uptime()),
      uptimeLabel: formatDuration(process.uptime()),
      disk: {
        tmpDir: os.tmpdir(),
        freeMB: freeBytes >= 0 ? Math.floor(freeBytes / (1024 * 1024)) : -1,
        freeBytes,
        guardMinMB: MIN_FREE_DISK_BYTES > 0 ? Math.floor(MIN_FREE_DISK_BYTES / (1024 * 1024)) : 0,
        guardEnabled: MIN_FREE_DISK_BYTES > 0,
      },
      queues: {
        totalJobs: jobs.size,
        running: running.size,
        waiting: waiting.length,
      },
      batches: (() => {
        let active = 0;
        for (const b of batches.values()) if (!b.finishedAt) active++;
        return { total: batches.size, active };
      })(),
    });
  } catch (err: any) {
    res.status(500).json({ error: 'version_failed', details: String(err?.message || err) });
  }
});

// ========================
// Logs (tail/recent/download)
// ========================
app.get('/api/logs/tail', requireAuth as any, (req, res) => {
  try {
    const max = Math.max(1, Math.min(500, parseInt(String(req.query.lines || '200'), 10) || 200));
    const logDir = path.resolve(process.cwd(), 'logs');
    const logFile = path.join(logDir, 'app.log');
    if (!fs.existsSync(logFile)) return res.json({ lines: [] });
    const buf = fs.readFileSync(logFile, 'utf8');
    const tail = buf.split(/\r?\n/).slice(-max);
    res.json({ lines: tail });
  } catch (err: any) {
    res.status(500).json({ error: 'tail_failed', details: String(err?.message || err) });
  }
});

app.get('/api/logs/recent', requireAuth as any, (req, res) => {
  try {
    const logDir = path.resolve(process.cwd(), 'logs');
    const logFile = path.join(logDir, 'app.log');
    if (!fs.existsSync(logFile)) return res.json({ lines: [] });
    const max = Math.max(1, Math.min(1000, parseInt(String(req.query.lines || '300'), 10) || 300));
    const level = String(req.query.level || '').toLowerCase();
    const q = String(req.query.q || '').trim().toLowerCase();
    let lines = fs.readFileSync(logFile, 'utf8').split(/\r?\n/).filter(Boolean);
    if (level && ['debug', 'info', 'warn', 'error'].includes(level)) {
      const token = `| ${level.toUpperCase()} |`;
      lines = lines.filter((l) => l.includes(token));
    }
    if (q) lines = lines.filter((l) => l.toLowerCase().includes(q));
    const out = lines.slice(-max);
    res.json({ lines: out, count: out.length });
  } catch (err: any) {
    res.status(500).json({ error: 'recent_failed', details: String(err?.message || err) });
  }
});

app.get('/api/logs/download', requireAuth as any, (req, res) => {
  try {
    const logDir = path.resolve(process.cwd(), 'logs');
    const logFile = path.join(logDir, 'app.log');
    if (!fs.existsSync(logFile)) {
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      return res.end('');
    }
    const max = Math.max(1, Math.min(5000, parseInt(String(req.query.lines || '1000'), 10) || 1000));
    const level = String(req.query.level || '').toLowerCase();
    const q = String(req.query.q || '').trim().toLowerCase();
    let lines = fs.readFileSync(logFile, 'utf8').split(/\r?\n/).filter(Boolean);
    if (level && ['debug', 'info', 'warn', 'error'].includes(level)) {
      const token = `| ${level.toUpperCase()} |`;
      lines = lines.filter((l) => l.includes(token));
    }
    if (q) lines = lines.filter((l) => l.toLowerCase().includes(q));
    const out = lines.slice(-max).join('\n');
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="logs.txt"');
    res.end(out);
  } catch (err: any) {
    res.status(500).json({ error: 'download_failed', details: String(err?.message || err) });
  }
});

// ========================
// History CRUD
// ========================
app.get('/api/history', requireAuth as any, (_req, res) => {
  res.json({ items: readHistory() });
});

app.delete('/api/history/:id', requireAuth as any, (req, res) => {
  try {
    const id = req.params.id;
    const job = jobs.get(id);
    if (job) {
      const idx = waiting.findIndex((w) => w.job.id === id);
      if (idx >= 0) waiting.splice(idx, 1);
      try { job.child?.kill('SIGTERM'); } catch {}
      finalizeJob(id, 'canceled', { job, keepJob: false, keepFiles: false });
    }
    removeHistory(id);
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: 'delete_failed' });
  }
});

app.delete('/api/history', requireAuth as any, (_req, res) => {
  try {
    clearHistory();
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: 'clear_failed' });
  }
});

// ========================
// Jobs metrike / podešavanja
// ========================
app.get('/api/jobs/metrics', requireAuth as any, (_req, res) => {
  res.json({ running: running.size, queued: waiting.length, maxConcurrent: MAX_CONCURRENT });
});

app.get('/api/jobs/settings', requireAuth as any, (_req, res) => {
  res.json({ maxConcurrent: MAX_CONCURRENT, proxyUrl: PROXY_URL || '', limitRateKbps: LIMIT_RATE ?? 0 });
});

app.post('/api/jobs/settings', requireAuth as any, (req, res) => {
  try {
    const { maxConcurrent, proxyUrl, limitRateKbps } = (req.body || {}) as {
      maxConcurrent?: number; proxyUrl?: string; limitRateKbps?: number;
    };
    const n = Number(maxConcurrent);
    if (!Number.isFinite(n)) return res.status(400).json({ error: 'invalid_number' });
    MAX_CONCURRENT = Math.max(1, Math.min(6, Math.floor(n)));
    PROXY_URL = typeof proxyUrl === 'string' ? proxyUrl.trim() || undefined : PROXY_URL;
    const lr = Number(limitRateKbps);
    if (Number.isFinite(lr) && lr >= 0) LIMIT_RATE = Math.floor(lr);
    writeServerSettings({ maxConcurrent: MAX_CONCURRENT, proxyUrl: PROXY_URL, limitRateKbps: LIMIT_RATE });
    schedule();
    res.json({ ok: true, maxConcurrent: MAX_CONCURRENT, proxyUrl: PROXY_URL || '', limitRateKbps: LIMIT_RATE ?? 0 });
  } catch {
    res.status(500).json({ error: 'update_failed' });
  }
});

app.post('/api/jobs/settings/reset', requireAuth as any, (_req, res) => {
  try {
    MAX_CONCURRENT = 2;
    PROXY_URL = undefined;
    LIMIT_RATE = 0;
    writeServerSettings({ maxConcurrent: 2, proxyUrl: '', limitRateKbps: 0 });
    schedule();
    res.json({ ok: true, maxConcurrent: MAX_CONCURRENT, proxyUrl: '', limitRateKbps: LIMIT_RATE });
  } catch {
    res.status(500).json({ error: 'reset_failed' });
  }
});

// ========================
// Analyze (yt-dlp -j)
// ========================
app.post('/api/analyze', analyzeRateLimit, requireAuth as any, async (req: any, res, next: NextFunction) => {
  try {
    const { url } = AnalyzeBody.parse(req.body);
    if (!isUrlAllowed(url, cfg)) return res.status(400).json({ error: 'Invalid or missing url' });
    await assertPublicHttpHost(url);
    const json = await dumpInfoJson(url!, {
      args: {
        preferFreeFormats: true,
        addHeader: makeHeaders(url!),
        ...(cfg.maxFileSizeMb ? { maxFilesize: `${cfg.maxFileSizeMb}M` } : {}),
        ...(cfg.maxDurationSec ? { matchFilter: `duration <= ${cfg.maxDurationSec}` } : {}),
      },
    });
    res.json(json);
  } catch (err: any) {
    const { status, code, message } = normalizeYtError(err);
    log.error('analyze_failed', err?.message || err);
    return next(new HttpError(status, code, message));
  }
});

// ========================
// Proxy download
// ========================
const proxyLimiter = rateLimit({ windowMs: 60_000, max: (cfg.proxyDownloadMaxPerMin ?? 60) });
app.get('/api/proxy-download', requireAuth as any, proxyBucket, proxyLimiter, wrap(proxyDownload));

// Token-aware limiter za /api/download i /api/job
const extractForwardedFor = (value: string | string[] | undefined): string | undefined => {
  if (!value) return undefined;
  if (Array.isArray(value)) {
    for (const entry of value) {
      if (typeof entry === 'string' && entry.trim()) {
        return entry.split(',')[0]?.trim() || undefined;
      }
    }
    return undefined;
  }
  const first = value.split(',')[0]?.trim();
  return first || undefined;
};

const resolveClientIp = (req: any): string => {
  try {
    const forwarded = extractForwardedFor(req?.headers?.['x-forwarded-for']);
    if (forwarded) return forwarded;
  } catch {}
  const ip = req?.ip || req?.socket?.remoteAddress || (req as any)?.connection?.remoteAddress;
  return typeof ip === 'string' && ip ? ip : 'unknown';
};

const keyer = (req: any) => {
  if (req.user?.id) return String(req.user.id);
  return resolveClientIp(req);
};
const dlLimiter = rateLimit({ windowMs: 60_000, max: 20, keyGenerator: keyer });
app.use(['/api/download', '/api/job'], requireAuth as any, dlLimiter);

// ========================
// get-url (-g)
// ========================
app.post('/api/get-url', requireAuth as any, async (req, res, next: NextFunction) => {
  try {
    const { url, formatId } = req.body as { url?: string; formatId?: string };
    if (!url || !formatId || !isUrlAllowed(url, cfg)) {
      return res.status(400).json({ error: 'missing_or_invalid_params' });
    }
    await assertPublicHttpHost(url);
    const output: string = await (ytdlp as any)(
      url,
      {
        getUrl: true,
        format: formatId,
        noCheckCertificates: true,
        noWarnings: true,
        addHeader: makeHeaders(url),
        ...(cfg.maxFileSizeMb ? { maxFilesize: `${cfg.maxFileSizeMb}M` } : {}),
        ...(cfg.maxDurationSec ? { matchFilter: `duration <= ${cfg.maxDurationSec}` } : {}),
      },
      { env: cleanedChildEnv(process.env) }
    );
    const lines = String(output).trim().split(/\r?\n/).filter(Boolean);
    res.json({ url: lines[0] || '' });
  } catch (err: any) {
    log.error('get_url_failed', err?.message || err);
    return next(new HttpError(400, 'GET_URL_FAILED', String(err?.stderr || err?.message || err)));
  }
});

// ========================
// /api/download/best (stream)
// ========================
app.get('/api/download/best', requireAuth as any, async (req: any, res) => {
  const sourceUrl = (req.query.url as string) || '';
  const title = (req.query.title as string) || 'video';
  if (!isUrlAllowed(sourceUrl, cfg)) return res.status(400).json({ error: 'invalid_url' });
  try { await assertPublicHttpHost(sourceUrl); } catch (e: any) { return res.status(400).json({ ok: false, error: { code: e?.code || 'SSRF_FORBIDDEN', message: e?.message || 'Forbidden host' } }); }

  const tmp = fs.realpathSync(os.tmpdir());
  const id = randomUUID();
  const outPath = path.join(tmp, `${id}.%(ext)s`);
  let histId: string | undefined;

  try {
    const policy = policyFor(req.user?.plan);
    log.info('download_best_start', sourceUrl);
    const hist = appendHistory({ title, url: sourceUrl, type: 'video', format: 'MP4', status: 'in-progress' });
    histId = hist.id;
    emitProgress(hist.id, { progress: 0, stage: 'starting' });

    let stream: fs.ReadStream | null = null;

    const child = (ytdlp as any).exec(
      sourceUrl,
      {
        format: `bv*[height<=?${policy.maxHeight}]+ba/b[height<=?${policy.maxHeight}]`,
        mergeOutputFormat: 'mp4',
        output: outPath,
        addHeader: makeHeaders(sourceUrl),
        restrictFilenames: true,
        noCheckCertificates: true,
        noWarnings: true,
        newline: true,
        ffmpegLocation: ffmpegBinary || undefined,
        proxy: PROXY_URL,
        limitRate: chosenLimitRateK(policy.speedLimitKbps),
        ...(cfg.maxFileSizeMb ? { maxFilesize: `${cfg.maxFileSizeMb}M` } : {}),
        ...(cfg.maxDurationSec ? { matchFilter: `duration <= ${cfg.maxDurationSec}` } : {}),
        ...speedyDlArgs(),
      },
      { env: cleanedChildEnv(process.env) }
    );

    let aborted = false;
    let completed = false;
    const handleAbort = () => {
      if (aborted || res.writableFinished) return;
      aborted = true;
      try { child.kill('SIGTERM'); } catch {}
      try { stream?.destroy(); } catch {}
      try { updateHistory(hist.id, { status: 'canceled' }); } catch {}
      try { clearHistoryThrottle(hist.id); } catch {}
      try { emitProgress(hist.id, { stage: 'canceled' }); } catch {}
      try { pushSse(hist.id, { id: hist.id, status: 'canceled' }, 'end'); } catch {}
      try { sseListeners.delete(hist.id); } catch {}
    };
    res.on('close', handleAbort);
    res.on('aborted', handleAbort);

    const onProgress = (buf: Buffer) => {
      const text = buf.toString();
      const { pct } = parseDlLine(text);
      if (typeof pct === 'number') {
        updateHistoryThrottled(hist.id, pct);
        emitProgress(hist.id, { progress: pct, stage: 'downloading' });
      }
      if (hasProgressHint(text, ['merging formats', 'merging'])) {
        updateHistoryThrottled(hist.id, 95);
        emitProgress(hist.id, { progress: 95, stage: 'merging' });
      }
    };
    child.stdout?.on('data', onProgress);
    child.stderr?.on('data', onProgress);

    await new Promise<void>((resolve, reject) => {
      child.on('error', reject);
      child.on('close', (code: number) => (code === 0 ? resolve() : reject(new Error(`yt-dlp exited with code ${code}`))));
    });

    const produced = findProducedFile(tmp, id, ['.mp4', '.mkv', '.webm']);
    if (!produced) return res.status(500).json({ error: 'output_not_found' });

    const full = path.join(tmp, produced);
    const stat = fs.statSync(full);
    const ext = path.extname(produced).toLowerCase();
    const videoType = ext === '.mkv' ? 'video/x-matroska' : ext === '.webm' ? 'video/webm' : 'video/mp4';
    res.setHeader('Content-Type', videoType);
    const safe = safeName(title || 'video');
    res.setHeader('Content-Disposition', `attachment; filename="${safe}${ext}"`);
    res.setHeader('Content-Length', String(stat.size));
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Accept-Ranges', 'bytes');
    if (req.method === 'HEAD') return res.end();

    stream = fs.createReadStream(full);
    stream.pipe(res);
    stream.on('close', () => { fs.unlink(full, () => {}); });

    const finalize = () => {
      if (aborted || completed) return;
      completed = true;
      updateHistory(hist.id, { status: 'completed', progress: 100, size: `${Math.round(stat.size / 1024 / 1024)} MB` });
      clearHistoryThrottle(hist.id);
      emitProgress(hist.id, { progress: 100, stage: 'completed', size: stat.size });
      try { pushSse(hist.id, { id: hist.id, status: 'completed' }, 'end'); } catch {}
      try { sseListeners.delete(hist.id); } catch {}
    };

    res.on('finish', finalize);
  } catch (err: any) {
    log.error('download_best_failed', err?.message || err);
    if (histId) {
      updateHistory(histId, { status: 'failed' });
      clearHistoryThrottle(histId);
      try {
        emitProgress(histId, { stage: 'failed' });
        pushSse(histId, { id: histId, status: 'failed' }, 'end');
        try { sseListeners.delete(histId); } catch {}
      } catch {}
    }
    res.status(500).json({ error: 'download_failed', details: String(err?.stderr || err?.message || err) });
  }
});

// ========================
// /api/download/audio (stream)
// ========================
app.get('/api/download/audio', requireAuth as any, async (req: any, res) => {
  const sourceUrl = (req.query.url as string) || '';
  const title = (req.query.title as string) || 'audio';
  const fmt = coerceAudioFormat(req.query.format, DEFAULT_AUDIO_FORMAT);
  if (!fmt) return res.status(400).json({ error: 'invalid_format' });
  if (!isUrlAllowed(sourceUrl, cfg)) return res.status(400).json({ error: 'invalid_url' });
  try { await assertPublicHttpHost(sourceUrl); } catch (e: any) { return res.status(400).json({ ok: false, error: { code: e?.code || 'SSRF_FORBIDDEN', message: e?.message || 'Forbidden host' } }); }

  const tmp = fs.realpathSync(os.tmpdir());
  const id = randomUUID();
  const outPath = path.join(tmp, `${id}.%(ext)s`);
  let histId: string | undefined;

  try {
    const policy = policyFor(req.user?.plan);
    log.info('download_audio_start', sourceUrl);
    const hist = appendHistory({ title, url: sourceUrl, type: 'audio', format: fmt.toUpperCase(), status: 'in-progress' });
    histId = hist.id;
    emitProgress(hist.id, { progress: 0, stage: 'starting' });

    let stream: fs.ReadStream | null = null;

    const child = (ytdlp as any).exec(
      sourceUrl,
      {
        extractAudio: true,
        audioFormat: fmt,
        output: outPath,
        addHeader: makeHeaders(sourceUrl),
        restrictFilenames: true,
        noCheckCertificates: true,
        noWarnings: true,
        newline: true,
        ffmpegLocation: ffmpegBinary || undefined,
        proxy: PROXY_URL,
        limitRate: chosenLimitRateK(policy.speedLimitKbps),
        ...(cfg.maxFileSizeMb ? { maxFilesize: `${cfg.maxFileSizeMb}M` } : {}),
        ...(cfg.maxDurationSec ? { matchFilter: `duration <= ${cfg.maxDurationSec}` } : {}),
      },
      { env: cleanedChildEnv(process.env) }
    );

    let aborted = false;
    let completed = false;
    const handleAbort = () => {
      if (aborted || res.writableFinished) return;
      aborted = true;
      try { child.kill('SIGTERM'); } catch {}
      try { stream?.destroy(); } catch {}
      try { updateHistory(hist.id, { status: 'canceled' }); } catch {}
      try { clearHistoryThrottle(hist.id); } catch {}
      try { emitProgress(hist.id, { stage: 'canceled' }); } catch {}
      try { pushSse(hist.id, { id: hist.id, status: 'canceled' }, 'end'); } catch {}
      try { sseListeners.delete(hist.id); } catch {}
    };
    res.on('close', handleAbort);
    res.on('aborted', handleAbort);

    const onProgress = (buf: Buffer) => {
      const text = buf.toString();
      const { pct } = parseDlLine(text);
      if (typeof pct === 'number') { updateHistoryThrottled(hist.id, pct); emitProgress(hist.id, { progress: pct, stage: 'downloading' }); }
      if (hasProgressHint(text, ['extractaudio', 'destination', 'convert', 'merging'])) {
        updateHistoryThrottled(hist.id, 90);
        emitProgress(hist.id, { progress: 90, stage: 'converting' });
      }
    };
    child.stdout?.on('data', onProgress);
    child.stderr?.on('data', onProgress);

    await new Promise<void>((resolve, reject) => {
      child.on('error', reject);
      child.on('close', (code: number) => (code === 0 ? resolve() : reject(new Error(`yt-dlp exited with code ${code}`))));
    });

    const produced = findProducedFile(tmp, id, ['.mp3', '.m4a', '.aac', '.opus', '.flac', '.wav', '.ogg', '.oga', '.alac']);
    if (!produced) return res.status(500).json({ error: 'output_not_found' });

    const full = path.join(tmp, produced);
    const stat = fs.statSync(full);
    const extname = path.extname(produced).replace(/^\./, '').toLowerCase();
    const contentType =
      extname === 'mp3' ? 'audio/mpeg'
      : extname === 'opus' ? 'audio/opus'
      : extname === 'ogg' || extname === 'oga' || extname === 'vorbis' ? 'audio/ogg'
      : extname === 'wav' ? 'audio/wav'
      : 'audio/mp4';
    res.setHeader('Content-Type', contentType);
    const safe = safeName(title || 'audio');
    const ext = extname || fmt;
    res.setHeader('Content-Disposition', `attachment; filename="${safe}.${ext}"`);
    res.setHeader('Content-Length', String(stat.size));
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Accept-Ranges', 'bytes');
    if (req.method === 'HEAD') return res.end();

    stream = fs.createReadStream(full);
    stream.pipe(res);
    stream.on('close', () => { fs.unlink(full, () => {}); });

    const finalize = () => {
      if (aborted || completed) return;
      completed = true;
      updateHistory(hist.id, { status: 'completed', progress: 100, size: `${Math.round(stat.size / 1024 / 1024)} MB` });
      clearHistoryThrottle(hist.id);
      emitProgress(hist.id, { progress: 100, stage: 'completed', size: stat.size });
      try { pushSse(hist.id, { id: hist.id, status: 'completed' }, 'end'); } catch {}
      try { sseListeners.delete(hist.id); } catch {}
    };

    res.on('finish', finalize);
  } catch (err: any) {
    log.error('download_audio_failed', err?.message || err);
    if (histId) {
      updateHistory(histId, { status: 'failed' });
      clearHistoryThrottle(histId);
      try {
        emitProgress(histId, { stage: 'failed' });
        pushSse(histId, { id: histId, status: 'failed' }, 'end');
        try { sseListeners.delete(histId); } catch {}
      } catch {}
    }
    res.status(500).json({ error: 'download_failed', details: String(err?.stderr || err?.message || err) });
  }
});

// ========================
// /api/download/chapter (sekcija)
// ========================
app.get('/api/download/chapter', requireAuth as any, async (req: any, res) => {
  try {
    const sourceUrl = String(req.query.url || '');
    const start = Number(req.query.start || 0);
    const end = Number(req.query.end || 0);
    const title = String(req.query.title || 'clip');
    const name = String(req.query.name || 'chapter');
    const index = String(req.query.index || '1');
    if (!isUrlAllowed(sourceUrl, cfg) || !Number.isFinite(start) || !(end > start)) {
      return res.status(400).json({ error: 'invalid_params' });
    }
    await assertPublicHttpHost(sourceUrl);

    const policy = policyFor(req.user?.plan);
    if (!policy.allowChapters) return res.status(403).json({ error: 'CHAPTERS_NOT_ALLOWED' });

    const tmp = fs.realpathSync(os.tmpdir());
    const id = randomUUID();
    const outPath = path.join(tmp, `${id}.%(ext)s`);
    const section = `${Math.max(0, start)}-${end}`;

    const child = (ytdlp as any).exec(
      sourceUrl,
      {
        format: `bv*[height<=?${policy.maxHeight}]+ba/b[height<=?${policy.maxHeight}]`,
        mergeOutputFormat: 'mp4',
        output: outPath,
        addHeader: makeHeaders(sourceUrl),
        noCheckCertificates: true,
        noWarnings: true,
        ffmpegLocation: ffmpegBinary || undefined,
        downloadSections: section,
        ...speedyDlArgs(),
        ...(cfg.maxFileSizeMb ? { maxFilesize: `${cfg.maxFileSizeMb}M` } : {}),
        ...(cfg.maxDurationSec ? { matchFilter: `duration <= ${cfg.maxDurationSec}` } : {}),
      },
      { env: cleanedChildEnv(process.env) }
    );
    trapChildPromise(child, 'yt_dlp_unhandled_clip');
    trapChildPromise(child, 'yt_dlp_unhandled_clip_audio');
    trapChildPromise(child, 'yt_dlp_unhandled_chapter');
    await new Promise<void>((resolve, reject) => {
      child.on('error', reject);
      child.on('close', (code: number) => (code === 0 ? resolve() : reject(new Error(`yt-dlp exit ${code}`))));
    });

    const produced = findProducedFile(tmp, id, ['.mp4', '.mkv', '.webm']);
    if (!produced) return res.status(500).json({ error: 'output_not_found' });

    const full = path.join(tmp, produced);
    const stat = fs.statSync(full);
    res.setHeader('Content-Type', /\.mkv$/i.test(full) ? 'video/x-matroska' : /\.webm$/i.test(full) ? 'video/webm' : 'video/mp4');
    const safeBase = safeName(String(title || 'clip'));
    const safeChap = safeName(String(name || 'chapter'));
    res.setHeader('Content-Disposition', `attachment; filename="${safeBase}.${index}_${safeChap}${path.extname(full)}"`);
    res.setHeader('Content-Length', String(stat.size));
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Accept-Ranges', 'bytes');
    if (req.method === 'HEAD') return res.end();

    const stream = fs.createReadStream(full);
    const endStream = () => { try { stream.destroy(); } catch {} };
    res.on('close', endStream);
    res.on('aborted', endStream);
    stream.pipe(res);
    stream.on('close', () => { try { fs.unlinkSync(full); } catch {} });
  } catch (err: any) {
    log.error('download_chapter_failed', err?.message || err);
    res.status(500).json({ error: 'download_failed' });
  }
});

// ========================
// Background jobs (queue)
// ========================
app.post('/api/job/start/best', requireAuth as any, async (req: any, res: Response) => {
  try {
    const { url: sourceUrl, title = 'video' } = (req.body || {}) as { url?: string; title?: string };
    if (!sourceUrl || !/^https?:\/\//i.test(sourceUrl) || !isUrlAllowed(sourceUrl, cfg)) return res.status(400).json({ error: 'invalid_url' });
    await assertPublicHttpHost(sourceUrl);

    const requestUser = {
      id: req.user?.id ?? 'anon',
      username: req.user?.username,
      plan: req.user?.plan ?? 'FREE',
      planExpiresAt: req.user?.planExpiresAt ?? undefined,
    } as const;
    const policyAtQueue = policyFor(requestUser.plan);

    const tmpDir = os.tmpdir();
    const tmpId = randomUUID();
    const outPath = path.join(fs.realpathSync(tmpDir), `${tmpId}.%(ext)s`);

    // disk guard
    try {
      const free = getFreeDiskBytes(tmpDir);
      if (MIN_FREE_DISK_BYTES > 0 && free > -1 && free < MIN_FREE_DISK_BYTES) {
        return res.status(507).json({ error: 'INSUFFICIENT_STORAGE' });
      }
    } catch {}

    const hist = appendHistory({ title, url: sourceUrl, type: 'video', format: 'MP4', status: 'queued' });
  const job: Job = { id: hist.id, type: 'video', tmpId, tmpDir, userId: requestUser.id, concurrencyCap: policyAtQueue.concurrentJobs, version: 1 };
    jobs.set(hist.id, job);
    emitProgress(hist.id, { progress: 0, stage: 'queued' });

    const run = () => {
      log.info('job_spawn_best', `url=${sourceUrl} user=${requestUser.id}`);
      const policy = policyAtQueue;
      const child = (ytdlp as any).exec(
        sourceUrl,
        {
          format: `bv*[height<=?${policy.maxHeight}]+ba/b[height<=?${policy.maxHeight}]`,
          mergeOutputFormat: 'mp4',
          output: outPath,
          addHeader: makeHeaders(sourceUrl),
          restrictFilenames: true,
          noCheckCertificates: true,
          noWarnings: true,
          newline: true,
          ffmpegLocation: ffmpegBinary || undefined,
          proxy: PROXY_URL,
          limitRate: chosenLimitRateK(policy.speedLimitKbps),
          ...(cfg.maxFileSizeMb ? { maxFilesize: `${cfg.maxFileSizeMb}M` } : {}),
          ...(cfg.maxDurationSec ? { matchFilter: `duration <= ${cfg.maxDurationSec}` } : {}),
          ...ytDlpArgsFromPolicy(policy),
          ...speedyDlArgs(),
        },
        { env: cleanedChildEnv(process.env) }
      );
      job.child = child as any;
      trapChildPromise(child, 'yt_dlp_unhandled_job_best');

      const onProgress = (buf: Buffer) => {
        const text = buf.toString();
        const { pct, speed, eta } = parseDlLine(text);
        if (typeof pct === 'number') {
          updateHistoryThrottled(hist.id, pct);
          emitProgress(hist.id, { progress: pct, stage: 'downloading', speed, eta });
        }
        if (hasProgressHint(text, ['merging formats', 'merging'])) {
          emitProgress(hist.id, { progress: 95, stage: 'merging', speed, eta });
        }
      };
      child.stdout?.on('data', onProgress);
      child.stderr?.on('data', onProgress);
      child.on('error', (err: any) => { try { log.error('yt_dlp_error_best', err?.message || String(err)); } catch {} });
      child.on('close', (code: number) => {
        try { log.info('yt_dlp_close_best', `code=${code}`); } catch {}
        running.delete(hist.id);
        let succeeded = false;
        try {
          const cur = readHistory().find((x) => x.id === hist.id);
          if (cur?.status === 'canceled') { schedule(); return; }
          if (code === 0) {
            const produced = findProducedFile(tmpDir, tmpId, ['.mp4', '.mkv', '.webm']);
            if (produced) {
              job.produced = produced;
              const full = path.join(tmpDir, produced);
              const stat = fs.statSync(full);
              updateHistory(hist.id, { status: 'completed', progress: 100, size: `${Math.round(stat.size / 1024 / 1024)} MB` });
              clearHistoryThrottle(hist.id);
              emitProgress(hist.id, { progress: 100, stage: 'completed', size: stat.size });
              finalizeJob(hist.id, 'completed', { job });
              succeeded = true;
            } else {
              updateHistory(hist.id, { status: 'failed' });
              clearHistoryThrottle(hist.id);
            }
          } else {
            updateHistory(hist.id, { status: 'failed' });
            clearHistoryThrottle(hist.id);
          }
        } catch {}
        if (!succeeded) {
          finalizeJob(hist.id, 'failed', { job, keepJob: false, keepFiles: false });
        }
        schedule();
      });
    };

    waiting.push({ job, run });
    schedule();
    return res.json({ id: hist.id });
  } catch (err: any) {
    log.error('job_start_best_failed', err?.message || err);
    return res.status(500).json({ error: 'job_start_failed' });
  }
});

app.post('/api/job/start/audio', requireAuth as any, async (req: any, res: Response) => {
  try {
    const { url: sourceUrl, title = 'audio', format = DEFAULT_AUDIO_FORMAT } = (req.body || {}) as { url?: string; title?: string; format?: string };
    if (!sourceUrl || !/^https?:\/\//i.test(sourceUrl) || !isUrlAllowed(sourceUrl, cfg)) return res.status(400).json({ error: 'invalid_url' });
    await assertPublicHttpHost(sourceUrl);

    const fmt = coerceAudioFormat(format, DEFAULT_AUDIO_FORMAT);
    if (!fmt) return res.status(400).json({ error: 'invalid_format' });

    const requestUser = {
      id: req.user?.id ?? 'anon',
      username: req.user?.username,
      plan: req.user?.plan ?? 'FREE',
      planExpiresAt: req.user?.planExpiresAt ?? undefined,
    } as const;
    const policyAtQueue = policyFor(requestUser.plan);

    const tmpDir = os.tmpdir();
    const tmpId = randomUUID();
    const outPath = path.join(fs.realpathSync(tmpDir), `${tmpId}.%(ext)s`);

    try {
      const free = getFreeDiskBytes(tmpDir);
      if (MIN_FREE_DISK_BYTES > 0 && free > -1 && free < MIN_FREE_DISK_BYTES) {
        return res.status(507).json({ error: 'INSUFFICIENT_STORAGE' });
      }
    } catch {}

    const hist = appendHistory({ title, url: sourceUrl, type: 'audio', format: fmt.toUpperCase(), status: 'queued' });
  const job: Job = { id: hist.id, type: 'audio', tmpId, tmpDir, userId: requestUser.id, concurrencyCap: policyAtQueue.concurrentJobs, version: 1 };
    jobs.set(hist.id, job);
    emitProgress(hist.id, { progress: 0, stage: 'queued' });

    const run = () => {
      log.info('job_spawn_audio', `url=${sourceUrl} fmt=${fmt} user=${requestUser.id}`);
      const policy = policyAtQueue;
      const child = (ytdlp as any).exec(
        sourceUrl,
        {
          extractAudio: true,
          audioFormat: fmt,
          output: outPath,
          addHeader: makeHeaders(sourceUrl),
          restrictFilenames: true,
          noCheckCertificates: true,
          noWarnings: true,
          newline: true,
          ffmpegLocation: ffmpegBinary || undefined,
          proxy: PROXY_URL,
          limitRate: chosenLimitRateK(policy.speedLimitKbps),
          ...(cfg.maxFileSizeMb ? { maxFilesize: `${cfg.maxFileSizeMb}M` } : {}),
          ...(cfg.maxDurationSec ? { matchFilter: `duration <= ${cfg.maxDurationSec}` } : {}),
          ...ytDlpArgsFromPolicy(policy),
          ...speedyDlArgs(),
        },
        { env: cleanedChildEnv(process.env) }
      );
      job.child = child as any;
      trapChildPromise(child, 'yt_dlp_unhandled_job_audio');

      const onProgress = (buf: Buffer) => {
        const text = buf.toString();
        const { pct, speed, eta } = parseDlLine(text);
        if (typeof pct === 'number') {
          updateHistoryThrottled(hist.id, pct);
          emitProgress(hist.id, { progress: pct, stage: 'downloading', speed, eta });
        }
        if (hasProgressHint(text, ['extractaudio', 'destination', 'convert', 'merging'])) {
          emitProgress(hist.id, { progress: 90, stage: 'converting', speed, eta });
        }
      };
      child.stdout?.on('data', onProgress);
      child.stderr?.on('data', onProgress);
      child.on('error', (err: any) => { try { log.error('yt_dlp_error_audio', err?.message || String(err)); } catch {} });
      child.on('close', (code: number) => {
        try { log.info('yt_dlp_close_audio', `code=${code}`); } catch {}
        running.delete(hist.id);
        let succeeded = false;
        try {
          const cur = readHistory().find((x) => x.id === hist.id);
          if (cur?.status === 'canceled') { schedule(); return; }
          if (code === 0) {
            const produced = findProducedFile(tmpDir, tmpId, ['.mp3', '.m4a', '.aac', '.opus', '.flac', '.wav', '.ogg', '.oga', '.alac']);
            if (produced) {
              job.produced = produced;
              const full = path.join(tmpDir, produced);
              const stat = fs.statSync(full);
              updateHistory(hist.id, { status: 'completed', progress: 100, size: `${Math.round(stat.size / 1024 / 1024)} MB` });
              clearHistoryThrottle(hist.id);
              emitProgress(hist.id, { progress: 100, stage: 'completed', size: stat.size });
              finalizeJob(hist.id, 'completed', { job });
              succeeded = true;
            } else {
              updateHistory(hist.id, { status: 'failed' });
              clearHistoryThrottle(hist.id);
            }
          } else {
            updateHistory(hist.id, { status: 'failed' });
            clearHistoryThrottle(hist.id);
          }
        } catch {}
        if (!succeeded) {
          finalizeJob(hist.id, 'failed', { job, keepJob: false, keepFiles: false });
        }
        schedule();
      });
    };

    waiting.push({ job, run });
    schedule();
    return res.json({ id: hist.id });
  } catch (err: any) {
    log.error('job_start_audio_failed', err?.message || err);
    return res.status(500).json({ error: 'job_start_failed' });
  }
});

// Clip
app.post('/api/job/start/clip', requireAuth as any, async (req: any, res: Response) => {
  try {
    const { url: sourceUrl, title = 'clip', start, end } = (req.body || {}) as { url?: string; title?: string; start?: number; end?: number };
    if (!sourceUrl || !/^https?:\/\//i.test(sourceUrl) || !isUrlAllowed(sourceUrl, cfg)) return res.status(400).json({ error: 'invalid_url' });
    await assertPublicHttpHost(sourceUrl);
    const s = Number(start), e = Number(end);
    if (!Number.isFinite(s) || !Number.isFinite(e) || !(e > s)) return res.status(400).json({ error: 'invalid_range' });

    const requestUser = {
      id: req.user?.id ?? 'anon',
      username: req.user?.username,
      plan: req.user?.plan ?? 'FREE',
      planExpiresAt: req.user?.planExpiresAt ?? undefined,
    } as const;
    const policyAtQueue = policyFor(requestUser.plan);

    const section = `${Math.max(0, Math.floor(s))}-${Math.floor(e)}`;
    const tmpDir = os.tmpdir();
    const tmpId = randomUUID();
    const outPath = path.join(fs.realpathSync(tmpDir), `${tmpId}.%(ext)s`);

    try {
      const free = getFreeDiskBytes(tmpDir);
      if (MIN_FREE_DISK_BYTES > 0 && free > -1 && free < MIN_FREE_DISK_BYTES) {
        return res.status(507).json({ error: 'INSUFFICIENT_STORAGE' });
      }
    } catch {}

    const hist = appendHistory({ title, url: sourceUrl, type: 'video', format: 'MP4', status: 'queued' });
  const job: Job = { id: hist.id, type: 'video', tmpId, tmpDir, userId: requestUser.id, concurrencyCap: policyAtQueue.concurrentJobs, version: 1 };
    jobs.set(hist.id, job);
    emitProgress(hist.id, { progress: 0, stage: 'queued' });

    const run = () => {
      log.info('job_spawn_clip', `url=${sourceUrl} ${section} user=${requestUser.id}`);
      const policy = policyAtQueue;
      const child = (ytdlp as any).exec(sourceUrl, {
        format: `bv*[height<=?${policy.maxHeight}]+ba/b[height<=?${policy.maxHeight}]`,
        mergeOutputFormat: 'mp4',
        output: outPath,
        addHeader: makeHeaders(sourceUrl),
        noCheckCertificates: true,
        noWarnings: true,
        newline: true,
        ffmpegLocation: ffmpegBinary || undefined,
        downloadSections: section,
        proxy: PROXY_URL,
        limitRate: chosenLimitRateK(policy.speedLimitKbps),
        ...(cfg.maxFileSizeMb ? { maxFilesize: `${cfg.maxFileSizeMb}M` } : {}),
        ...(cfg.maxDurationSec ? { matchFilter: `duration <= ${cfg.maxDurationSec}` } : {}),
        ...ytDlpArgsFromPolicy(policy),
        ...speedyDlArgs(),
      });
      job.child = child as any;
      trapChildPromise(child, 'yt_dlp_unhandled_job_clip');

      const onProgress = (buf: Buffer) => {
        const { pct, speed, eta } = parseDlLine(buf.toString());
        if (typeof pct === 'number') { updateHistoryThrottled(hist.id, pct); emitProgress(hist.id, { progress: pct, stage: 'downloading', speed, eta }); }
      };
      child.stdout?.on('data', onProgress);
      child.stderr?.on('data', onProgress);
      child.on('close', (code: number) => {
        running.delete(hist.id);
        let succeeded = false;
        try {
          const cur = readHistory().find((x) => x.id === hist.id);
          if (cur?.status === 'canceled') { schedule(); return; }
          if (code === 0) {
            const produced = findProducedFile(tmpDir, tmpId, ['.mp4', '.mkv', '.webm']);
            if (produced) {
              job.produced = produced;
              const full = path.join(tmpDir, produced);
              const stat = fs.statSync(full);
              updateHistory(hist.id, { status: 'completed', progress: 100, size: `${Math.round(stat.size / 1024 / 1024)} MB` });
              clearHistoryThrottle(hist.id);
              emitProgress(hist.id, { progress: 100, stage: 'completed', size: stat.size });
              finalizeJob(hist.id, 'completed', { job });
              succeeded = true;
            } else { updateHistory(hist.id, { status: 'failed' }); clearHistoryThrottle(hist.id); }
          } else { updateHistory(hist.id, { status: 'failed' }); clearHistoryThrottle(hist.id); }
        } catch {}
        if (!succeeded) {
          finalizeJob(hist.id, 'failed', { job, keepJob: false, keepFiles: false });
        }
        schedule();
      });
    };

    waiting.push({ job, run });
    schedule();
    return res.json({ id: hist.id });
  } catch (err: any) {
    log.error('job_start_clip_failed', err?.message || err);
    return res.status(500).json({ error: 'job_start_failed' });
  }
});

// Embed subs
app.post('/api/job/start/embed-subs', requireAuth as any, async (req: any, res: Response) => {
  try {
    const { url: sourceUrl, title = 'video', lang, format = 'srt', container = 'mp4' } =
      (req.body || {}) as { url?: string; title?: string; lang?: string; format?: string; container?: string };
    if (!sourceUrl || !/^https?:\/\//i.test(sourceUrl) || !isUrlAllowed(sourceUrl, cfg)) return res.status(400).json({ error: 'invalid_url' });
    await assertPublicHttpHost(sourceUrl);
    if (!lang) return res.status(400).json({ error: 'missing_lang' });

    const requestUser = {
      id: req.user?.id ?? 'anon',
      username: req.user?.username,
      plan: req.user?.plan ?? 'FREE',
      planExpiresAt: req.user?.planExpiresAt ?? undefined,
    } as const;
    const policyAtQueue = policyFor(requestUser.plan);

    const fmt = /^(srt|vtt)$/i.test(String(format)) ? String(format).toLowerCase() : 'srt';
    const cont = /^(mp4|mkv|webm)$/i.test(String(container)) ? String(container).toLowerCase() : 'mp4';

    const tmpDir = os.tmpdir();
    const tmpId = randomUUID();
    const outPath = path.join(fs.realpathSync(tmpDir), `${tmpId}.%(ext)s`);

    try {
      const free = getFreeDiskBytes(tmpDir);
      if (MIN_FREE_DISK_BYTES > 0 && free > -1 && free < MIN_FREE_DISK_BYTES) {
        return res.status(507).json({ error: 'INSUFFICIENT_STORAGE' });
      }
    } catch {}

    const hist = appendHistory({ title, url: sourceUrl, type: 'video', format: cont.toUpperCase(), status: 'queued' });
  const job: Job = { id: hist.id, type: 'video', tmpId, tmpDir, userId: requestUser.id, concurrencyCap: policyAtQueue.concurrentJobs, version: 1 };
    jobs.set(hist.id, job);
    emitProgress(hist.id, { progress: 0, stage: 'queued' });

    const run = () => {
      log.info('job_spawn_embed_subs', `url=${sourceUrl} lang=${lang} fmt=${fmt} cont=${cont} user=${requestUser.id}`);
      const policy = policyAtQueue;
      const child = (ytdlp as any).exec(sourceUrl, {
        format: 'bv*+ba/b',
        mergeOutputFormat: cont,
        writeSubs: true,
        embedSubs: true,
        subLangs: lang,
        subFormat: fmt,
        output: outPath,
        addHeader: makeHeaders(sourceUrl),
        restrictFilenames: true,
        noCheckCertificates: true,
        noWarnings: true,
        newline: true,
        ffmpegLocation: ffmpegBinary || undefined,
        proxy: PROXY_URL,
        limitRate: chosenLimitRateK(policy.speedLimitKbps),
        ...(cfg.maxFileSizeMb ? { maxFilesize: `${cfg.maxFileSizeMb}M` } : {}),
        ...(cfg.maxDurationSec ? { matchFilter: `duration <= ${cfg.maxDurationSec}` } : {}),
        ...ytDlpArgsFromPolicy(policy),
        ...speedyDlArgs(),
      });
      job.child = child as any;
      trapChildPromise(child, 'yt_dlp_unhandled_job_embed_subs');

      const onProgress = (buf: Buffer) => {
        const text = buf.toString();
        const { pct, speed, eta } = parseDlLine(text);
        if (typeof pct === 'number') {
          updateHistoryThrottled(hist.id, pct);
          emitProgress(hist.id, { progress: pct, stage: 'downloading', speed, eta });
        }
        if (hasProgressHint(text, ['writing video subtitles', 'merging formats', 'merging', 'embedding subtitles'])) {
          emitProgress(hist.id, { progress: 95, stage: 'embedding', speed, eta });
        }
      };
      child.stdout?.on('data', onProgress);
      child.stderr?.on('data', onProgress);
      child.on('close', (code: number) => {
        running.delete(hist.id);
        let succeeded = false;
        try {
          const cur = readHistory().find((x) => x.id === hist.id);
          if (cur?.status === 'canceled') { schedule(); return; }
          if (code === 0) {
            const produced = findProducedFile(tmpDir, tmpId, ['.mp4', '.mkv', '.webm']);
            if (produced) {
              job.produced = produced;
              const full = path.join(tmpDir, produced);
              const stat = fs.statSync(full);
              updateHistory(hist.id, { status: 'completed', progress: 100, size: `${Math.round(stat.size / 1024 / 1024)} MB` });
              clearHistoryThrottle(hist.id);
              emitProgress(hist.id, { progress: 100, stage: 'completed', size: stat.size });
              finalizeJob(hist.id, 'completed', { job });
              succeeded = true;
            } else { updateHistory(hist.id, { status: 'failed' }); clearHistoryThrottle(hist.id); }
          } else { updateHistory(hist.id, { status: 'failed' }); clearHistoryThrottle(hist.id); }
        } catch {}
        if (!succeeded) {
          finalizeJob(hist.id, 'failed', { job, keepJob: false, keepFiles: false });
        }
        schedule();
      });
    };

    waiting.push({ job, run });
    schedule();
    return res.json({ id: hist.id });
  } catch (err: any) {
    log.error('job_start_embed_subs_failed', err?.message || err);
    return res.status(500).json({ error: 'job_start_failed' });
  }
});

// Convert/merge
app.post('/api/job/start/convert', requireAuth as any, async (req: any, res: Response) => {
  try {
    const { url: sourceUrl, title = 'video', container = 'mp4' } = (req.body || {}) as { url?: string; title?: string; container?: string };
    if (!sourceUrl || !/^https?:\/\//i.test(sourceUrl) || !isUrlAllowed(sourceUrl, cfg)) return res.status(400).json({ error: 'invalid_url' });
    await assertPublicHttpHost(sourceUrl);

    const requestUser = {
      id: req.user?.id ?? 'anon',
      username: req.user?.username,
      plan: req.user?.plan ?? 'FREE',
      planExpiresAt: req.user?.planExpiresAt ?? undefined,
    } as const;
    const policyAtQueue = policyFor(requestUser.plan);

    const fmt = String(container).toLowerCase();
    const valid = ['mp4', 'mkv', 'webm'];
    const mergeOut: any = valid.includes(fmt) ? fmt : 'mp4';

    const tmpDir = os.tmpdir();
    const tmpId = randomUUID();
    const outPath = path.join(fs.realpathSync(tmpDir), `${tmpId}.%(ext)s`);

    try {
      const free = getFreeDiskBytes(tmpDir);
      if (MIN_FREE_DISK_BYTES > 0 && free > -1 && free < MIN_FREE_DISK_BYTES) {
        return res.status(507).json({ error: 'INSUFFICIENT_STORAGE' });
      }
    } catch {}

    const hist = appendHistory({ title, url: sourceUrl, type: 'video', format: String(mergeOut).toUpperCase(), status: 'queued' });
  const job: Job = { id: hist.id, type: 'video', tmpId, tmpDir, userId: requestUser.id, concurrencyCap: policyAtQueue.concurrentJobs, version: 1 };
    jobs.set(hist.id, job);
    emitProgress(hist.id, { progress: 0, stage: 'queued' });

    const run = () => {
      log.info('job_spawn_convert', `url=${sourceUrl} container=${mergeOut} user=${requestUser.id}`);
      const policy = policyAtQueue;
      const child = (ytdlp as any).exec(
        sourceUrl,
        {
          format: `bv*[height<=?${policy.maxHeight}]+ba/b[height<=?${policy.maxHeight}]`,
          mergeOutputFormat: mergeOut,
          output: outPath,
          addHeader: makeHeaders(sourceUrl),
          restrictFilenames: true,
          noCheckCertificates: true,
          noWarnings: true,
          newline: true,
          ffmpegLocation: ffmpegBinary || undefined,
          proxy: PROXY_URL,
          limitRate: chosenLimitRateK(policy.speedLimitKbps),
          ...(cfg.maxFileSizeMb ? { maxFilesize: `${cfg.maxFileSizeMb}M` } : {}),
          ...(cfg.maxDurationSec ? { matchFilter: `duration <= ${cfg.maxDurationSec}` } : {}),
          ...ytDlpArgsFromPolicy(policy),
          ...speedyDlArgs(),
        }
      );
      job.child = child as any;
      trapChildPromise(child, 'yt_dlp_unhandled_job_convert');

      const onProgress = (buf: Buffer) => {
        const text = buf.toString();
        const { pct, speed, eta } = parseDlLine(text);
        if (typeof pct === 'number') {
          updateHistoryThrottled(hist.id, pct);
          emitProgress(hist.id, { progress: pct, stage: 'downloading', speed, eta });
        }
        if (hasProgressHint(text, ['merging formats', 'merging'])) {
          emitProgress(hist.id, { progress: 95, stage: 'merging', speed, eta });
        }
      };
      child.stdout?.on('data', onProgress);
      child.stderr?.on('data', onProgress);
      child.on('error', (err: any) => { try { log.error('yt_dlp_error_convert', err?.message || String(err)); } catch {} });
      child.on('close', (code: number) => {
        try { log.info('yt_dlp_close_convert', `code=${code}`); } catch {}
        running.delete(hist.id);
        let succeeded = false;
        try {
          const cur = readHistory().find((x) => x.id === hist.id);
          if (cur?.status === 'canceled') { schedule(); return; }
          if (code === 0) {
            const produced = findProducedFile(tmpDir, tmpId, ['.mp4', '.mkv', '.webm']);
            if (produced) {
              job.produced = produced;
              const full = path.join(tmpDir, produced);
              const stat = fs.statSync(full);
              updateHistory(hist.id, { status: 'completed', progress: 100, size: `${Math.round(stat.size / 1024 / 1024)} MB` });
              clearHistoryThrottle(hist.id);
              emitProgress(hist.id, { progress: 100, stage: 'completed', size: stat.size });
              finalizeJob(hist.id, 'completed', { job });
              succeeded = true;
            } else {
              updateHistory(hist.id, { status: 'failed' });
              clearHistoryThrottle(hist.id);
            }
          } else {
            updateHistory(hist.id, { status: 'failed' });
            clearHistoryThrottle(hist.id);
          }
        } catch {}
        if (!succeeded) {
          finalizeJob(hist.id, 'failed', { job, keepJob: false, keepFiles: false });
        }
        schedule();
      });
    };

    waiting.push({ job, run });
    schedule();
    return res.json({ id: hist.id });
  } catch (err: any) {
    log.error('job_start_convert_failed', err?.message || err);
    return res.status(500).json({ error: 'job_start_failed' });
  }
});

// ========================
// Batches
// ========================
app.post('/api/batch', batchRateLimit, requireAuth as any, async (req: any, res) => {
  try {
    const { urls, mode = 'video', audioFormat = DEFAULT_AUDIO_FORMAT, titleTemplate } =
      (req.body || {}) as { urls?: string[]; mode?: 'video'|'audio'; audioFormat?: string; titleTemplate?: string };
    if (!Array.isArray(urls) || !urls.length) return res.status(400).json({ error: 'missing_urls' });
    const requestUser = {
      id: req.user?.id ?? 'anon',
      username: req.user?.username,
      plan: req.user?.plan ?? 'FREE',
      planExpiresAt: req.user?.planExpiresAt ?? undefined,
    } as const;
    const policy = policyFor(requestUser.plan);
    const normalized = Array.from(new Set(urls.map(u => String(u || '').trim()).filter(u => /^https?:\/\//i.test(u))));
    const unique: string[] = [];
    for (const u of normalized) {
      if (!isUrlAllowed(u, cfg)) continue;
      await assertPublicHttpHost(u);
      unique.push(u);
    }
    if (!unique.length) return res.status(400).json({ error: 'no_valid_urls' });
    if (unique.length > policy.batchMax) return res.status(400).json({ error: 'BATCH_LIMIT_EXCEEDED', limit: policy.batchMax });

    let audioFmt: string | undefined;
    if (mode === 'audio') {
      const resolved = coerceAudioFormat(audioFormat, DEFAULT_AUDIO_FORMAT);
      if (!resolved) return res.status(400).json({ error: 'invalid_format' });
      audioFmt = resolved;
    }

    const batchId = randomUUID();
    const batch: Batch = { id: batchId, userId: requestUser.id, createdAt: Date.now(), mode, format: mode === 'audio' ? audioFmt : undefined, items: [] };
    batches.set(batchId, batch);

    for (const u of unique) {
      const title = titleTemplate ? titleTemplate.replace(/\{index\}/g, String(batch.items.length + 1)) : (mode === 'audio' ? 'audio' : 'video');
      const tmpDir = os.tmpdir();
      const tmpId = randomUUID();
      const outPath = path.join(fs.realpathSync(tmpDir), `${tmpId}.%(ext)s`);
    const hist = appendHistory({ title, url: u, type: mode, format: mode === 'audio' ? String(audioFmt).toUpperCase() : 'MP4', status: 'queued' });
  const job: Job = { id: hist.id, type: mode, tmpId, tmpDir, userId: requestUser.id, concurrencyCap: policy.concurrentJobs, version: 1 };
      jobs.set(hist.id, job);
      batch.items.push({ url: u, jobId: hist.id });
      emitProgress(hist.id, { progress: 0, stage: 'queued', batchId });
      const run = () => {
        const policyCur = policy;
        const commonArgs: any = {
          output: outPath,
          addHeader: makeHeaders(u),
          restrictFilenames: true,
          noCheckCertificates: true,
          noWarnings: true,
          newline: true,
          ffmpegLocation: ffmpegBinary || undefined,
          proxy: PROXY_URL,
          limitRate: chosenLimitRateK(policyCur.speedLimitKbps),
          ...(cfg.maxFileSizeMb ? { maxFilesize: `${cfg.maxFileSizeMb}M` } : {}),
          ...(cfg.maxDurationSec ? { matchFilter: `duration <= ${cfg.maxDurationSec}` } : {}),
          ...ytDlpArgsFromPolicy(policyCur),
          ...speedyDlArgs(),
        };

        let child: any;
        if (mode === 'audio' && audioFmt) {
          child = (ytdlp as any).exec(
            u,
            { extractAudio: true, audioFormat: audioFmt, ...commonArgs },
            { env: cleanedChildEnv(process.env) }
          );
        } else {
          child = (ytdlp as any).exec(
            u,
            { format: `bv*[height<=?${policyCur.maxHeight}]+ba/b[height<=?${policyCur.maxHeight}]`, mergeOutputFormat: 'mp4', ...commonArgs },
            { env: cleanedChildEnv(process.env) }
          );
    }

    job.child = child as any;
    trapChildPromise(child, mode === 'audio' ? 'yt_dlp_unhandled_batch_audio' : 'yt_dlp_unhandled_batch_video');

    const onProgress = (buf: Buffer) => {
          const text = buf.toString();
          const { pct, speed, eta } = parseDlLine(text);
          if (typeof pct === 'number') {
            updateHistoryThrottled(hist.id, pct);
            emitProgress(hist.id, { progress: pct, stage: 'downloading', speed, eta, batchId });
          }
          if (hasProgressHint(text, ['merging formats', 'merging', 'extractaudio', 'convert', 'destination', 'embedding subtitles'])) {
            emitProgress(hist.id, { stage: mode === 'audio' ? 'converting' : 'processing', batchId });
          }
        };
        child.stdout?.on('data', onProgress);
        child.stderr?.on('data', onProgress);

        child.on('close', (code: number) => {
          running.delete(hist.id);
          let succeeded = false;
          try {
            const produced = findProducedFile(tmpDir, tmpId, mode === 'audio'
              ? ['.mp3', '.m4a', '.aac', '.opus', '.flac', '.wav', '.ogg', '.oga', '.alac']
              : ['.mp4', '.mkv', '.webm']);
            if (code === 0 && produced) {
              job.produced = produced;
              const full = path.join(tmpDir, produced);
              let sizeMb = 0; try { sizeMb = Math.round(fs.statSync(full).size / 1024 / 1024); } catch {}
              updateHistory(hist.id, { status: 'completed', progress: 100, size: `${sizeMb} MB` });
              clearHistoryThrottle(hist.id);
              emitProgress(hist.id, { progress: 100, stage: 'completed', batchId });
              finalizeJob(hist.id, 'completed', { job, extra: { batchId } });
              succeeded = true;
            } else {
              updateHistory(hist.id, { status: 'failed' });
              clearHistoryThrottle(hist.id);
              emitProgress(hist.id, { stage: 'failed', batchId });
            }
          } catch {}
          if (!succeeded) {
            finalizeJob(hist.id, 'failed', { job, keepJob: false, keepFiles: false, extra: { batchId } });
          }
          schedule();
        });
      };
      waiting.push({ job, run });
    }

    schedule();
    return res.json({ batchId, total: batch.items.length, items: batch.items });
  } catch (e: any) {
    return res.status(500).json({ error: 'batch_create_failed', message: String(e?.message || e) });
  }
});

// Batch summary
app.get('/api/batch/:id', requireAuth as any, (req: any, res) => {
  const b = batches.get(req.params.id);
  if (!b) return res.status(404).json({ error: 'not_found' });
  if (b.userId && b.userId !== req.user?.id) return res.status(403).json({ error: 'forbidden' });
  return res.json(summarizeBatch(b));
});

// Batch cancel (queued + running)
app.post('/api/batch/:id/cancel', requireAuth as any, (req: any, res) => {
  const b = batches.get(req.params.id);
  if (!b) return res.status(404).json({ error: 'not_found' });
  if (b.userId && b.userId !== req.user?.id) return res.status(403).json({ error: 'forbidden' });

  for (const it of b.items) {
    const job = jobs.get(it.jobId);
    if (!job) continue;

    const idx = waiting.findIndex(w => w.job.id === it.jobId);
    if (idx >= 0) {
      waiting.splice(idx, 1);
      updateHistory(it.jobId, { status: 'canceled' });
      emitProgress(it.jobId, { stage: 'canceled', batchId: b.id });
      finalizeJob(it.jobId, 'canceled', { job, keepJob: false, keepFiles: false, extra: { batchId: b.id } });
      continue;
    }
    try { job.child?.kill('SIGTERM'); } catch {}
    updateHistory(it.jobId, { status: 'canceled' });
    emitProgress(it.jobId, { stage: 'canceled', batchId: b.id });
    finalizeJob(it.jobId, 'canceled', { job, keepJob: false, keepFiles: false, extra: { batchId: b.id } });
  }
  b.finishedAt = Date.now();
  return res.json({ ok: true });
});

// ========================
// SSE progress (per history id)
// ========================
app.get('/api/progress/:id', requireAuthOrSigned('progress'), progressBucket, (req: any, res) => {
  const id = req.params.id;
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Accel-Buffering', 'no');
  res.setHeader('Connection', 'keep-alive');
  appendVary(res, 'Authorization');
  (res as any).flushHeaders?.();

  res.write(`retry: 5000\n`);

  addSseListener(id, res);

  let closed = false;
  let hb: NodeJS.Timeout | undefined;
  let timeout: NodeJS.Timeout | undefined;

  const cleanup = () => {
    if (closed) return;
    closed = true;
    if (hb) {
      clearInterval(hb);
      hb = undefined;
    }
    if (timeout) {
      clearTimeout(timeout);
      timeout = undefined;
    }
    removeSseListener(id, res);
    try { res.end(); } catch {}
  };

  const safeWrite = (chunk: string) => {
    if (closed || res.writableEnded || (res as any).destroyed) return;
    try { res.write(chunk); } catch { cleanup(); }
  };

  const lastEventHeader = req.header('Last-Event-ID');
  const lastEventId = lastEventHeader && !Number.isNaN(Number(lastEventHeader)) ? Number(lastEventHeader) : undefined;
  if (typeof lastEventId === 'number') {
    const buf = sseBuffers.get(id) || [];
    for (const frame of buf) {
      const match = frame.match(/^id:\s*(\d+)/m);
      const frameId = match ? Number(match[1]) : undefined;
      if (typeof frameId === 'number' && frameId > lastEventId) {
        safeWrite(frame);
      }
    }
  }

  const onErr = (err: any) => {
    const msg = String(err?.message || err || '');
    if (!/aborted|socket hang up|ECONNRESET|ERR_STREAM_PREMATURE_CLOSE/i.test(msg)) {
      try { log.warn('progress_sse_stream_error', msg); } catch {}
    }
    cleanup();
  };

  req.on('close', cleanup);
  req.on('aborted', cleanup);
  req.on('error', onErr);
  res.on('error', onErr);
  (req.socket as any)?.on?.('error', onErr);
  (req.socket as any)?.on?.('close', cleanup);

  safeWrite(`event: ping\ndata: {"ok":true}\n\n`);
  hb = setInterval(() => safeWrite(`event: ping\ndata: {"ts":${Date.now()}}\n\n`), 15000);
  timeout = setTimeout(() => {
    pushSse(id, { id, status: 'timeout' }, 'end');
    cleanup();
  }, 10 * 60 * 1000);
});

// ========================
// Job cancel / all-cancel
// ========================
app.post('/api/job/cancel/:id', requireAuth as any, (req, res) => {
  const id = req.params.id;
  const job = jobs.get(id);
  if (!job) return res.status(404).json({ error: 'not_found' });

  const idx = waiting.findIndex(w => w.job.id === id);
  if (idx >= 0) {
    waiting.splice(idx, 1);
    updateHistory(id, { status: 'canceled' });
    emitProgress(id, { stage: 'canceled' });
    finalizeJob(id, 'canceled', { job, keepJob: false, keepFiles: false });
    return res.json({ ok: true });
  }

  try {
    job.child?.kill('SIGTERM');
    const pid = job.child?.pid;
    if (pid && !job.child?.killed) setTimeout(() => { try { process.kill(pid, 'SIGKILL'); } catch {} }, 5000);
    updateHistory(id, { status: 'canceled' });
    emitProgress(id, { stage: 'canceled' });
    finalizeJob(id, 'canceled', { job, keepJob: false, keepFiles: false });
  } catch {}
  return res.json({ ok: true });
});

app.post('/api/jobs/cancel-all', requireAuth as any, (_req, res) => {
  // queued
  while (waiting.length) {
    const next = waiting.shift()!;
    const id = next.job.id;
    updateHistory(id, { status: 'canceled' });
    emitProgress(id, { stage: 'canceled' });
    finalizeJob(id, 'canceled', { job: next.job, keepJob: false, keepFiles: false });
  }
  // running
  for (const id of Array.from(running)) {
    const job = jobs.get(id);
    try { job?.child?.kill('SIGTERM'); } catch {}
    try {
      const pid = job?.child?.pid;
      if (pid && !job?.child?.killed) setTimeout(() => { try { process.kill(pid, 'SIGKILL'); } catch {} }, 5000);
    } catch {}
    updateHistory(id, { status: 'canceled' });
    emitProgress(id, { stage: 'canceled' });
    finalizeJob(id, 'canceled', { job: job, keepJob: false, keepFiles: false });
  }
  res.json({ ok: true });
});

// ========================
// Job file download (range + cleanup)
// ========================
app.post('/api/job/file/:id/sign', requireAuth as any, signBucket, (req, res) => {
  const id = req.params.id;
  const job = jobs.get(id);
  if (!job || !job.produced) {
    return res.status(404).json({ error: 'not_found' });
  }

  const requested = Number((req.body as any)?.expiresIn ?? 0);
  const ttl = Number.isFinite(requested) && requested > 0 ? Math.min(Math.floor(requested), 3600) : 1800;
  const scope = 'download' as const;
  const token = signToken({ sub: `job:${id}`, scope, ver: job.version }, ttl);
  signIssued.inc({ scope });
  signTtl.observe(ttl);
  res.setHeader('Cache-Control', 'no-store');
  return res.json({ token, expiresAt: Date.now() + ttl * 1000, queryParam: 's' });
});

app.post('/api/progress/:id/sign', requireAuth as any, signBucket, (req, res) => {
  const id = req.params.id;
  const job = jobs.get(id);
  if (!job) {
    return res.status(404).json({ error: 'not_found' });
  }

  const requested = Number((req.body as any)?.expiresIn ?? 0);
  const ttl = Number.isFinite(requested) && requested > 0 ? Math.min(Math.floor(requested), 3600) : 600;
  const scope = 'progress' as const;
  const token = signToken({ sub: `job:${id}`, scope, ver: job.version }, ttl);
  signIssued.inc({ scope });
  signTtl.observe(ttl);
  res.setHeader('Cache-Control', 'no-store');
  return res.json({ token, expiresAt: Date.now() + ttl * 1000, queryParam: 's' });
});

app.get('/api/job/file/:id', requireAuthOrSigned('download'), jobBucket, (req: any, res) => {
  const id = req.params.id;
  const job = jobs.get(id);
  if (!job || !job.produced) return res.status(404).json({ error: 'not_found' });
  const full = path.join(job.tmpDir, job.produced);
  if (!fs.existsSync(full)) return res.status(404).json({ error: 'file_missing' });

  try {
    const stat = fs.statSync(full);
    appendVary(res, 'Authorization');
    const ext = path.extname(full).toLowerCase();
    const audioExts = new Set(['.mp3', '.m4a', '.aac', '.opus', '.flac', '.wav', '.ogg', '.oga', '.alac']);
    const isAudio = audioExts.has(ext);
    const videoType = ext === '.mkv' ? 'video/x-matroska' : ext === '.webm' ? 'video/webm' : 'video/mp4';
    const audioType =
      ext === '.mp3' ? 'audio/mpeg'
      : ext === '.opus' ? 'audio/opus'
      : ext === '.ogg' || ext === '.oga' ? 'audio/ogg'
      : ext === '.flac' ? 'audio/flac'
      : ext === '.wav' ? 'audio/wav'
      : 'audio/mp4';
    res.setHeader('Content-Type', isAudio ? audioType : videoType);

    const etag = `W/"${stat.size.toString(16)}-${Math.floor(stat.mtimeMs).toString(16)}"`;
    res.setHeader('ETag', etag);
    res.setHeader('Last-Modified', stat.mtime.toUTCString());

    const h = readHistory().find((x) => x.id === id);
    const base = (h?.title || (job.type === 'audio' ? 'audio' : 'video')).replace(/[^\w.-]+/g, '_');
    const extName = path.extname(full).replace(/^\./, '') || (job.type === 'audio' ? 'm4a' : 'mp4');
    res.setHeader('Content-Disposition', `attachment; filename="${base}.${extName}"`);
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Accept-Ranges', 'bytes');

    const ifNoneMatch = req.headers['if-none-match'];
    if (ifNoneMatch) {
      const tags = String(ifNoneMatch).split(',').map((t) => t.trim());
      const matches = tags.some((t) => t === etag || t === '*');
      if (matches) {
        res.status(304);
        return res.end();
      }
    }

    const range = req.headers.range;
    if (range) {
      const m = String(range).match(/bytes=(\d+)-(\d+)?/);
      if (m) {
        const start = parseInt(m[1], 10);
        const end = m[2] ? parseInt(m[2], 10) : (stat.size - 1);
        if (Number.isFinite(start) && start >= 0 && start < stat.size && end >= start) {
          res.status(206);
          res.setHeader('Content-Range', `bytes ${start}-${end}/${stat.size}`);
          res.setHeader('Content-Length', String(end - start + 1));
          const stream = fs.createReadStream(full, { start, end });
          const ender = () => { try { stream.destroy(); } catch {} };
          res.on('close', ender); res.on('aborted', ender);
          stream.pipe(res);
          return;
        }
      }

      res.status(416);
      res.setHeader('Content-Range', `bytes */${stat.size}`);
      return res.end();
    }

    res.setHeader('Content-Length', String(stat.size));
    if (req.method === 'HEAD') return res.end();

    const stream = fs.createReadStream(full);
    const ender = () => { try { stream.destroy(); } catch {} };
    res.on('close', ender); res.on('aborted', ender);
    stream.pipe(res);
    stream.on('close', () => {
      try { fs.unlink(full, () => {}); } catch {}
      finalizeJob(id, 'completed', { job, keepJob: false, keepFiles: false });
    });
  } catch (err: any) {
    log.error('job_file_failed', err?.message || err);
    res.status(500).json({ error: 'job_file_failed' });
  }
});

// ========================
// Subtitles download (+offset convert via ffmpeg)
// ========================
app.get('/api/subtitles/download', requireAuth as any, async (req: any, res) => {
  try {
    const src = String(req.query.url || '');
    const title = String(req.query.title || 'subtitles');
    const outFmt = String(req.query.format || 'vtt').toLowerCase(); // 'vtt' | 'srt'
    const offsetSec = Number(req.query.offset || 0) || 0;
    if (!src || !/^https?:\/\//i.test(src)) return res.status(400).json({ error: 'invalid_src' });
    await assertPublicHttpHost(src);

    const policy = policyFor(req.user?.plan);
    if (!policy.allowSubtitles) return res.status(403).json({ error: 'SUBTITLES_NOT_ALLOWED' });

    const tmp = fs.realpathSync(os.tmpdir());
    const id = randomUUID();
    const outExt = outFmt === 'srt' ? 'srt' : 'vtt';
    const outPath = path.join(tmp, `${id}.${outExt}`);

    if (offsetSec === 0 && /\.vtt($|\?|#)/i.test(src) && outExt === 'vtt') {
      const upstream = await fetch(src, { headers: { 'user-agent': 'Mozilla/5.0' } });
      if (!upstream.ok || !upstream.body) return res.status(502).json({ error: 'upstream_failed', status: upstream.status });
      res.setHeader('Content-Type', 'text/vtt; charset=utf-8');
      const safe = safeName(title || 'subtitles');
      res.setHeader('Content-Disposition', `attachment; filename="${safe}.vtt"`);
      return (Readable as any).fromWeb(upstream.body as any).pipe(res);
    }

    const args: string[] = [];
    if (offsetSec !== 0) args.push('-itsoffset', String(offsetSec));
    args.push('-i', src);
    args.push('-map', '0:s?');
    if (outExt === 'srt') args.push('-c:s', 'srt'); else args.push('-c:s', 'webvtt');
    args.push('-f', outExt === 'srt' ? 'srt' : 'webvtt');
    args.push(outPath);

    const ff = spawnSync(ffmpegBinary || 'ffmpeg', args, { encoding: 'utf8' });
    if (ff.status !== 0 || !fs.existsSync(outPath)) {
      try { if (fs.existsSync(outPath)) fs.unlinkSync(outPath); } catch {}
      return res.status(500).json({ error: 'convert_failed', details: ff.stderr || ff.stdout || '' });
    }

    const stat = fs.statSync(outPath);
    res.setHeader('Content-Type', outExt === 'srt' ? 'application/x-subrip; charset=utf-8' : 'text/vtt; charset=utf-8');
    const safe = safeName(title || 'subtitles');
    res.setHeader('Content-Disposition', `attachment; filename="${safe}.${outExt}"`);
    res.setHeader('Content-Length', String(stat.size));
    if (req.method === 'HEAD') { try { fs.unlinkSync(outPath); } catch {}; return res.end(); }
    const stream = fs.createReadStream(outPath);
    stream.pipe(res);
    stream.on('close', () => { try { fs.unlinkSync(outPath); } catch {} });
  } catch (err: any) {
    log.error('subtitles_download_failed', err?.message || err);
    res.status(500).json({ error: 'subtitles_failed' });
  }
});

// ========================
// Cleanup & metrics
// ========================
app.post('/api/jobs/cleanup-temp', requireAuth as any, (_req, res) => {
  let removed = 0;
  for (const job of jobs.values()) {
    try {
      const before = fs.readdirSync(job.tmpDir).filter(f => f.startsWith(job.tmpId + '.')).length;
      cleanupJobFiles(job);
      const after = fs.readdirSync(job.tmpDir).filter(f => f.startsWith(job.tmpId + '.')).length;
      removed += Math.max(0, before - after);
    } catch {}
  }
  res.json({ ok: true, removed });
});

app.get('/api/metrics', requireAuth as any, (_req, res) => {
  const listeners = Array.from(sseListeners.values()).reduce((a, s) => a + s.size, 0);
  res.json({ running: running.size, queued: waiting.length, listeners });
});

// ========================
// Orphan reaper
// ========================
const REAPER_MS = 10 * 60 * 1000; // 10m
if (process.env.NODE_ENV !== 'test') {
  setInterval(() => {
    try {
      for (const job of jobs.values()) {
        if (!job.produced) continue;
        const full = path.join(job.tmpDir, job.produced);
        if (fs.existsSync(full)) {
          const age = Date.now() - fs.statSync(full).mtimeMs;
          if (age > REAPER_MS) {
            try { fs.unlinkSync(full); } catch {}
            try { jobs.delete(job.id); } catch {}
          }
        } else {
          try { jobs.delete(job.id); } catch {}
        }
      }
    } catch {}
  }, REAPER_MS);
}

// ========================
// Error middleware last
// ========================
app.use(errorHandler);

// ========================
// Start server (retry on EADDRINUSE)
// ========================
function startServerWithRetry(port: number, maxAttempts = 40): Promise<import('http').Server> {
  let attempts = 0;
  return new Promise((resolve, reject) => {
    const tryListen = () => {
      attempts += 1;
      const server = app.listen(port);
      server.keepAliveTimeout = 120_000;
      server.headersTimeout = 125_000;
      server.requestTimeout = 0;
      const onError = (err: any) => {
        server.off('listening', onListening);
        if (err && err.code === 'EADDRINUSE') {
          try { server.close(() => {}); } catch {}
          if (attempts >= maxAttempts) {
            const message = `Port ${port} busy after ${maxAttempts} attempts`;
            try { log.error('port_in_use_exhausted', message); } catch {}
            return reject(new Error(message));
          }
          const delay = Math.min(1_500, 150 * attempts);
          try { log.warn('port_in_use_retry', `Port ${port} busy, retrying in ${delay}ms (attempt ${attempts}/${maxAttempts})...`); } catch {}
          setTimeout(tryListen, delay);
          return;
        }
        try { log.error('server_error', err?.message || String(err)); } catch {}
        reject(err);
      };
      const onListening = () => {
        server.off('error', onError);
        try { writeServerSettings({ lastPort: port }); } catch {}
        try { log.info(`yt-dlp server listening on http://localhost:${port} (CORS: ${String(cfg.corsOrigin || 'disabled')})`); } catch {}
        resolve(server);
      };
      server.once('error', onError);
      server.once('listening', onListening);
    };
    tryListen();
  });
}

const initialPort = Number(cfg.port || 5176);
if (process.env.NODE_ENV !== 'test') {
  startServerWithRetry(initialPort).catch((e) => {
    log.error('fatal_startup', e?.message || String(e));
    process.exitCode = 1;
  });
}

// ========================
// Graceful shutdown & crash guards
// ========================
async function gracefulShutdown(signal: string) {
  try {
    log.info(`shutdown_${signal.toLowerCase()}`, 'Shutting down, canceling jobs...');
    while (waiting.length) {
      const next = waiting.shift()!;
      const id = next.job.id;
      try { cleanupJobFiles(next.job); } catch {}
      try { jobs.delete(id); } catch {}
    }
    for (const id of Array.from(running)) {
      const job = jobs.get(id);
      try { job?.child?.kill('SIGTERM'); } catch {}
      try { if (job) cleanupJobFiles(job); } catch {}
      try { jobs.delete(id); } catch {}
    }
  } catch {}
  setTimeout(() => process.exit(0), 300);
}

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

process.on('uncaughtException', (err) => {
  const msg = String(err?.message || err || '').toLowerCase();
  if (/aborted|socket hang up|econnreset|stream prematurely closed/.test(msg)) return;
  try { log.error('uncaught_exception', err?.stack || String(err)); } catch {}
});
process.on('unhandledRejection', (reason: any) => {
  const msg = String((reason as any)?.message || reason || '').toLowerCase();
  if (/aborted|socket hang up|econnreset|stream prematurely closed/.test(msg)) return;
  try { log.error('unhandled_rejection', (reason as any)?.stack || String(reason)); } catch {}
});

