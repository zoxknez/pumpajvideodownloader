// server.ts (clean, drop-in zamena)
// ESM + TypeScript (Node 18+). Zadržava postojeći API i ponašanje.

import express from 'express';
import rateLimit from 'express-rate-limit';
import fs from 'node:fs';
import path from 'node:path';

import { getLogger } from './core/logger.js';
import { loadConfig } from './core/config.js';
import { appendHistory, readHistory, updateHistory, removeHistory, clearHistory } from './core/history.js';
import { readServerSettings, writeServerSettings } from './core/settings.js';
import { requestLogger } from './middleware/requestLog.js';
import { errorHandler } from './middleware/error.js';
import { mountAuthRoutes } from './routes/auth.js';
import { applySecurity } from './middleware/security.js';
import { createProxyDownloadHandler } from './routes/proxyDownload.js';
import { authActivate } from './routes/authActivate.js';
import { requireAuth } from './middleware/auth.js';
import { mountPromMetrics } from './routes/metricsProm.js';
import { createMetricsRegistry } from './core/metrics.js';
import { tokenBucket } from './middleware/tokenBucket.js';
import { requireAuthOrSigned } from './middleware/signed.js';
import { metricsMiddleware, signIssued, signTtl } from './middleware/httpMetrics.js';
import { traceContext } from './middleware/trace.js';
import { analyzeRateLimit, batchRateLimit } from './middleware/rateLimit.js';
import { SseHub } from './core/SseHub.js';
import { JobManager } from './core/JobManager.js';
import { Downloader } from './core/Downloader.js';
import { createJobState, cleanupJobFiles } from './core/jobState.js';
import type { JobState, WaitingItem } from './core/jobState.js';
import type { Job } from './core/jobHelpers.js';
import { ffmpegEnabled } from './core/env.js';
import { setupDownloadRoutes } from './routes/downloads.js';
import { setupJobRoutes } from './routes/jobs.js';
import { setupSseRoutes } from './routes/sse.js';
import { setupLogRoutes } from './routes/logs.js';
import { setupBatchRoutes } from './routes/batch.js';
import { setupHistoryRoutes } from './routes/history.js';
import { setupJobAdminRoutes } from './routes/jobAdmin.js';
import { setupJobFileRoutes } from './routes/jobFiles.js';
import { setupSubtitleRoutes } from './routes/subtitles.js';
import { setupAnalyzeRoutes } from './routes/analyze.js';
import { setupSystemRoutes } from './routes/system.js';
import { createManualCorsMiddleware } from './middleware/corsManual.js';

// ---- App init / middleware ----
const log = getLogger('server');
const cfg = loadConfig();

// Decode YouTube cookies from base64 if provided (Railway deployment helper)
if (process.env.YOUTUBE_COOKIES_BASE64 && !process.env.YOUTUBE_COOKIES_PATH) {
  try {
    const decoded = Buffer.from(process.env.YOUTUBE_COOKIES_BASE64, 'base64').toString('utf8');
    const cookiesPath = '/tmp/youtube-cookies.txt';
    fs.writeFileSync(cookiesPath, decoded, 'utf8');
    process.env.YOUTUBE_COOKIES_PATH = cookiesPath;
    log.info('youtube_cookies_decoded', { path: cookiesPath });
  } catch (err: any) {
    log.error('youtube_cookies_decode_failed', err?.message || err);
  }
}

// Log cookies configuration for debugging
if (process.env.YOUTUBE_COOKIES_PATH) {
  log.info('youtube_cookies_enabled', { path: process.env.YOUTUBE_COOKIES_PATH });
} else if (process.env.COOKIES_FROM_BROWSER) {
  log.info('youtube_cookies_from_browser', { browser: process.env.COOKIES_FROM_BROWSER });
} else {
  log.warn('youtube_cookies_not_configured', 'YouTube may block requests due to bot detection');
}

// NOTE: noCheckCertificates is currently hard-coded to true in all yt-dlp calls.
// If you make this configurable via env var in future, add warning log here:
// if (process.env.NO_CHECK_CERTS === '1') { log.warn('insecure_tls_enabled', 'TLS verification disabled'); }

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
  // Railway is behind a single proxy hop - trust first proxy for accurate rate limit key
  app.set('trust proxy', 1);
}
applySecurity(app, process.env.CORS_ORIGIN);

// Auth
// Global
const limiter = rateLimit({ windowMs: 60_000, max: 120 });
app.use(limiter);

// Manual CORS implementation - extracted into reusable middleware
app.use(createManualCorsMiddleware(log, { getAllowedOrigins: () => process.env.CORS_ORIGIN }));

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
// Refactored: SSE + Job Management
// ========================
const sseHub = new SseHub(log, 20);
const jobManager = new JobManager(log, sseHub, 2);
const downloader = new Downloader(log);

let MAX_CONCURRENT = 2;
let PROXY_URL: string | undefined;
let LIMIT_RATE: number | undefined; // KiB/s

const jobState: JobState = createJobState({
  log,
  getMaxConcurrent: () => MAX_CONCURRENT,
  updateHistory,
});

const {
  jobs,
  running,
  sseListeners,
  sseBuffers,
  addSseListener,
  removeSseListener,
  pushSse,
  emitProgress,
  updateHistoryThrottled,
  clearHistoryThrottle,
  finalizeJob,
  endSseFor,
  schedule,
} = jobState;
const waiting: WaitingItem[] = jobState.waiting;

Object.assign(app.locals as Record<string, unknown>, {
  jobs,
  waiting,
  running,
  sseListeners,
  sseBuffers,
  minFreeDiskBytes: MIN_FREE_DISK_BYTES,
  metrics,
  sseHub,
  jobManager,
  downloader,
  finalizeJob,
  endSseFor,
  pushSse,
  emitProgress,
});

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

const jobSettings = {
  getMaxConcurrent: () => MAX_CONCURRENT,
  setMaxConcurrent: (value: number) => {
    MAX_CONCURRENT = value;
  },
  getProxyUrl: () => PROXY_URL,
  setProxyUrl: (value?: string) => {
    PROXY_URL = value;
  },
  getLimitRate: () => (typeof LIMIT_RATE === 'number' ? LIMIT_RATE : undefined),
  setLimitRate: (value?: number) => {
    LIMIT_RATE = typeof value === 'number' ? value : undefined;
  },
};


// Token-aware limiter za /api/download i /api/job
const proxyLimiter = rateLimit({ windowMs: 60_000, max: (cfg.proxyDownloadMaxPerMin ?? 60) });

setupAnalyzeRoutes(app, requireAuth, {
  cfg,
  log,
  analyzeRateLimit,
  proxyBucket,
  proxyLimiter,
  proxyDownload,
});

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
// Only apply auth + limiter to /api/download, NOT /api/job (job routes use per-route auth or signed URLs)
app.use('/api/download', requireAuth as any, dlLimiter);
setupHistoryRoutes(app, requireAuth, log, {
  readHistory,
  updateHistory,
  removeHistory,
  clearHistory,
  jobs,
  waiting,
  finalizeJob,
});

setupJobAdminRoutes(app, requireAuth, log, {
  jobState: { jobs, waiting, running, schedule },
  settings: jobSettings,
  persistence: { writeServerSettings },
  cleanupJobFiles,
  sseListeners,
});

setupJobFileRoutes(
  app,
  { requireAuth, requireAuthOrSigned, signBucket, jobBucket },
  { jobs, finalizeJob, readHistory, log }
);

setupSubtitleRoutes(app, requireAuth, log, { ffmpegEnabled });

// Download Routes (Refactored to routes/downloads.ts)
// ========================
setupDownloadRoutes(
  app,
  requireAuth,
  cfg,
  log,
  { appendHistory, updateHistory, updateHistoryThrottled },
  { emitProgress, endSseFor },
  { PROXY_URL, MIN_FREE_DISK_BYTES }
);

// ========================
// Job Routes (Refactored to routes/jobs.ts)
// ========================
setupJobRoutes(
  app,
  requireAuth,
  cfg,
  log,
  { appendHistory, updateHistory, updateHistoryThrottled, clearHistoryThrottle, readHistory },
  { emitProgress },
  { jobs, running, waiting, schedule, finalizeJob, readHistory, updateHistory, clearHistoryThrottle, updateHistoryThrottled, emitProgress },
  { PROXY_URL, MIN_FREE_DISK_BYTES, ffmpegEnabled }
);

const batchModule = setupBatchRoutes(
  app,
  requireAuth,
  batchRateLimit,
  cfg,
  log,
  { appendHistory, updateHistory, updateHistoryThrottled, clearHistoryThrottle, readHistory },
  { emitProgress },
  { jobs, waiting, schedule, finalizeJob },
  {
    getProxyUrl: () => PROXY_URL,
    minFreeDiskBytes: () => MIN_FREE_DISK_BYTES,
  }
);

// ========================
// SSE Routes (Refactored to routes/sse.ts)
// ========================
setupSseRoutes(
  app,
  requireAuthOrSigned,
  progressBucket,
  log,
  { sseBuffers, addSseListener, removeSseListener, pushSse }
);

// ========================
// Log Routes (Refactored to routes/logs.ts)
// ========================
setupLogRoutes(app, requireAuth);

mountAuthRoutes(app);
app.post('/auth/activate', requireAuth as any, authActivate as any);

setupSystemRoutes(app, {
  cfg,
  log,
  requireAuth,
  jobs,
  waiting,
  running,
  sseListeners,
  sseBuffers,
  sseHub,
  jobManager,
  getMaxConcurrent: () => MAX_CONCURRENT,
  getProxyUrl: () => PROXY_URL,
  getLimitRate: () => (typeof LIMIT_RATE === 'number' ? LIMIT_RATE : undefined),
  minFreeDiskBytes: MIN_FREE_DISK_BYTES,
  getBatchStats: () => batchModule.getStats(),
});


// ========================
// Orphan reaper
// ========================
const REAPER_MS = 10 * 60 * 1000; // 10m
const BATCH_TTL_MS = 24 * 60 * 60 * 1000; // 24h - finished batches older than this will be deleted

if (process.env.NODE_ENV !== 'test') {
  setInterval(() => {
    try {
      metrics.reaper.lastRunTimestamp = Math.floor(Date.now() / 1000);
      const now = Date.now();
      let reaperRaces = 0;

      // Clean up old job files
      for (const job of jobs.values()) {
        if (!job.produced) continue;
        const full = path.join(job.tmpDir, job.produced);
        if (fs.existsSync(full)) {
          const stat = fs.statSync(full);
          const age = now - stat.mtimeMs;
          if (age > REAPER_MS) {
            try { 
              fs.unlinkSync(full); 
              metrics.reaper.filesReaped += 1;
            } catch (err) {
              // Could be race with finalize - file already deleted
              reaperRaces++;
              log.debug('reaper_file_race', { jobId: job.id, file: job.produced });
            }
            try { 
              jobs.delete(job.id); 
              metrics.reaper.jobsDeleted += 1;
            } catch {}
          }
        } else {
          try { 
            jobs.delete(job.id); 
            metrics.reaper.jobsDeleted += 1;
          } catch {}
        }
      }

      // Clean up finished batches older than TTL (prevents memory leak)
      const batchesReaped = batchModule.pruneExpired(BATCH_TTL_MS, now);

      if (reaperRaces > 0) {
        metrics.reaper.reaperFinalizeRace += reaperRaces;
        log.debug('reaper_races_detected', { count: reaperRaces });
      }
      if (batchesReaped > 0) {
        log.info('reaper_batches_cleaned', { count: batchesReaped });
      }
    } catch (err) {
      log.error('reaper_error', { error: String(err) });
    }
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
        const corsValue = process.env.CORS_ORIGIN || 'ALL (no restrictions)';
        try { log.info(`yt-dlp server listening on http://localhost:${port}`); } catch {}
        try { log.info(`CORS allowed origins: ${corsValue}`); } catch {}
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

