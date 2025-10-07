// server.ts (clean, drop-in zamena)
// ESM + TypeScript (Node 18+). Zadržava postojeći API i ponašanje.
import express, {} from 'express';
import rateLimit from 'express-rate-limit';
import ytdlp from 'youtube-dl-exec';
import path from 'node:path';
import { Readable } from 'node:stream';
import os from 'node:os';
import fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { getLogger } from './core/logger.js';
import { loadConfig } from './core/config.js';
import { isUrlAllowed } from './core/urlAllow.js';
import { isOriginAllowed } from './core/corsOrigin.js';
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
import { SseHub } from './core/SseHub.js';
import { JobManager } from './core/JobManager.js';
import { Downloader } from './core/Downloader.js';
import { ffmpegEnabled } from './core/env.js';
import { setNoStore, setSseHeaders, setDownloadHeaders, safeKill, appendVary } from './core/http.js';
import { makeHeaders, coerceAudioFormat, selectVideoFormat, selectAudioFormat, parseDlLine, hasProgressHint, chosenLimitRateK, findProducedFile, trunc, safeName, getFreeDiskBytes, formatDuration, speedyDlArgs, trapChildPromise, cleanedChildEnv as cleanedChildEnvHelper, DEFAULT_AUDIO_FORMAT, } from './core/ytHelpers.js';
import { setupDownloadRoutes } from './routes/downloads.js';
// ---- App init / middleware ----
const log = getLogger('server');
const cfg = loadConfig();
// NOTE: noCheckCertificates is currently hard-coded to true in all yt-dlp calls.
// If you make this configurable via env var in future, add warning log here:
// if (process.env.NO_CHECK_CERTS === '1') { log.warn('insecure_tls_enabled', 'TLS verification disabled'); }
export const metrics = createMetricsRegistry();
const proxyDownload = createProxyDownloadHandler(cfg, metrics);
const MIN_FREE_DISK_BYTES = typeof cfg.minFreeDiskMb === 'number' && cfg.minFreeDiskMb > 0
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
}
else {
    // Railway is behind a single proxy hop - trust first proxy for accurate rate limit key
    app.set('trust proxy', 1);
}
applySecurity(app, process.env.CORS_ORIGIN);
// Rate limit (global + token-aware za job/download)
// Global
const limiter = rateLimit({ windowMs: 60000, max: 120 });
app.use(limiter);
// Manual CORS implementation - cors package was not deploying correctly to Railway
app.use((req, res, next) => {
    const origin = req.headers.origin;
    const corsOriginEnv = process.env.CORS_ORIGIN;
    // Log CORS check for debugging (only on first request or OPTIONS)
    if (req.method === 'OPTIONS' || !res.locals.corsLogged) {
        log.debug(`CORS check: origin=${origin}, allowed=${corsOriginEnv || 'ALL'}`);
        res.locals.corsLogged = true;
    }
    // Check if origin is allowed
    const isAllowed = isOriginAllowed(origin, corsOriginEnv);
    if (origin && isAllowed) {
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Access-Control-Allow-Credentials', 'true');
        if (req.method === 'OPTIONS') {
            log.debug(`CORS: ✅ Allowed origin ${origin}`);
        }
    }
    else if (!corsOriginEnv) {
        // Development mode - no CORS_ORIGIN set, allow all
        // CRITICAL: Only set credentials if we echo a concrete origin, NOT with wildcard
        if (origin) {
            res.setHeader('Access-Control-Allow-Origin', origin);
            res.setHeader('Access-Control-Allow-Credentials', 'true');
        }
        else {
            res.setHeader('Access-Control-Allow-Origin', '*');
            // Do NOT set Access-Control-Allow-Credentials with wildcard (spec violation)
        }
        if (req.method === 'OPTIONS') {
            log.debug(`CORS: ✅ Dev mode - allowing all origins`);
        }
    }
    else if (origin) {
        // Origin not allowed - log detailed comparison
        const allowedList = (corsOriginEnv || '').split(',').map(s => s.trim()).filter(Boolean);
        log.warn(`CORS: ❌ Rejected origin "${origin}"`);
        log.warn(`CORS: Allowed origins: [${allowedList.map(o => `"${o}"`).join(', ')}]`);
        log.warn(`CORS: Origin length: ${origin.length}, first allowed length: ${allowedList[0]?.length || 0}`);
        log.warn(`CORS: Exact match check: "${origin}" === "${allowedList[0]}" → ${origin === allowedList[0]}`);
    }
    // Always set these headers regardless of origin
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS,HEAD');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization,Accept,X-Requested-With,Range,If-Range,If-None-Match,If-Modified-Since,X-Req-Id,x-req-id,X-Request-Id,X-Client-Trace,Traceparent,traceparent,X-Traceparent');
    res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition,Content-Length,Content-Type,ETag,Last-Modified,Accept-Ranges,Content-Range,X-Request-Id,Proxy-Status,Retry-After,X-Traceparent');
    res.setHeader('Access-Control-Max-Age', '86400');
    res.setHeader('Vary', 'Origin');
    if (req.method === 'OPTIONS') {
        res.status(204).end();
        return;
    }
    next();
});
// Minimalna HPP sanitizacija (query samo 1 vrednost po ključu)
app.use((req, _res, next) => {
    try {
        for (const k of Object.keys(req.query)) {
            const v = req.query[k];
            if (Array.isArray(v))
                req.query[k] = v[0];
        }
    }
    catch { }
    next();
});
// Hard body cap pre JSON parsera (DoS guard)
app.use((req, res, next) => {
    const len = Number(req.headers['content-length'] || 0);
    if (len > 2000000)
        return res.status(413).end();
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
function bumpJobVersion(job) {
    if (!job)
        return;
    const current = Number.isFinite(job.version) ? job.version : 0;
    job.version = Math.max(1, current + 1);
}
// Legacy Maps - gradually migrate to JobManager
const jobs = new Map();
const waiting = [];
const running = new Set(); // jobIds
// Legacy SSE - gradually migrate to SseHub
const sseListeners = new Map();
const sseBuffers = new Map();
const sseEventCounters = new Map(); // Monotonic event ID per channel
const SSE_BUFFER_SIZE = 20;
Object.assign(app.locals, {
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
});
let MAX_CONCURRENT = 2;
let PROXY_URL;
let LIMIT_RATE; // KiB/s
const batches = new Map();
// Učitaj perzistirane postavke ako postoje
try {
    const saved = readServerSettings();
    if (saved.maxConcurrent && Number.isFinite(saved.maxConcurrent)) {
        MAX_CONCURRENT = Math.max(1, Math.min(6, Math.floor(saved.maxConcurrent)));
    }
    if (saved.proxyUrl)
        PROXY_URL = saved.proxyUrl;
    if (saved.limitRateKbps && Number.isFinite(saved.limitRateKbps)) {
        LIMIT_RATE = Math.max(0, Math.floor(saved.limitRateKbps));
    }
}
catch { }
// ========================
// Pomoćne funkcije sada importovane iz core/ytHelpers.ts
// appendVary je iz core/http.ts
// ========================
// SSE listeners & ring buffer
// ========================
function addSseListener(id, res) {
    if (!sseListeners.has(id))
        sseListeners.set(id, new Set());
    sseListeners.get(id).add(res);
}
function removeSseListener(id, res) {
    const set = sseListeners.get(id);
    if (!set)
        return;
    set.delete(res);
    if (set.size === 0)
        sseListeners.delete(id);
}
function pushSse(id, payload, event, explicitId) {
    // Use monotonic counter per channel for stable event IDs (immune to clock jumps)
    let eventId;
    if (explicitId !== undefined) {
        eventId = explicitId;
    }
    else {
        const current = sseEventCounters.get(id) ?? 0;
        eventId = current + 1;
        sseEventCounters.set(id, eventId);
    }
    const frame = `${event ? `event: ${event}\n` : ''}id: ${eventId}\n` + `data: ${JSON.stringify(payload)}\n\n`;
    let buf = sseBuffers.get(id);
    if (!buf) {
        buf = [];
        sseBuffers.set(id, buf);
    }
    buf.push(frame);
    if (buf.length > SSE_BUFFER_SIZE)
        buf.shift();
    const set = sseListeners.get(id);
    if (set && set.size > 0) {
        for (const res of Array.from(set)) {
            try {
                res.write(frame);
            }
            catch {
                try {
                    res.end();
                }
                catch { }
                try {
                    set.delete(res);
                }
                catch { }
            }
        }
        if (set.size === 0)
            sseListeners.delete(id);
    }
    return eventId;
}
function emitProgress(id, data) {
    pushSse(id, { id, ...data });
}
// ========================
// Queue & throttling
// ========================
const lastPctWritten = new Map();
function updateHistoryThrottled(id, pct, extra) {
    try {
        let should = true;
        if (typeof pct === 'number') {
            const last = lastPctWritten.get(id) ?? -1;
            const step = Math.floor(pct);
            if (step === last)
                should = false;
            else
                lastPctWritten.set(id, step);
        }
        if (should) {
            updateHistory(id, { ...(typeof pct === 'number' ? { progress: pct } : {}), ...(extra || {}) });
        }
    }
    catch { }
}
function clearHistoryThrottle(id) {
    lastPctWritten.delete(id);
}
function cleanupJobFiles(job) {
    bumpJobVersion(job);
    try {
        const list = fs.readdirSync(job.tmpDir);
        for (const f of list) {
            if (f.startsWith(job.tmpId + '.')) {
                const full = path.join(job.tmpDir, f);
                try {
                    fs.unlinkSync(full);
                }
                catch { }
            }
        }
    }
    catch { }
}
function finalizeJob(id, status, options = {}) {
    const { job, keepJob = status === 'completed', keepFiles = status === 'completed', removeListeners = true, reason = status === 'completed' ? 'ok' : status === 'canceled' ? 'user_cancel' : 'error', extra, } = options;
    try {
        clearHistoryThrottle(id);
    }
    catch { }
    pushSse(id, { id, status, reason, ...(extra || {}) }, 'end');
    if (removeListeners) {
        const set = sseListeners.get(id);
        if (set) {
            for (const res of Array.from(set)) {
                try {
                    res.end();
                }
                catch { }
                try {
                    set.delete(res);
                }
                catch { }
            }
            if (set.size === 0) {
                try {
                    sseListeners.delete(id);
                }
                catch { }
            }
        }
        // Cleanup monotonic event counter
        try {
            sseEventCounters.delete(id);
        }
        catch { }
    }
    // Bump job version to invalidate all signed tokens (download/progress URLs)
    // This ensures that completed/failed/canceled jobs cannot be accessed with old tokens
    if (job) {
        try {
            bumpJobVersion(job);
        }
        catch { }
    }
    if (!keepFiles && job) {
        try {
            cleanupJobFiles(job);
        }
        catch { }
    }
    if (!keepJob) {
        try {
            jobs.delete(id);
        }
        catch { }
    }
    // Clean up SSE ring buffer to prevent memory leak
    try {
        sseBuffers.delete(id);
    }
    catch { }
    try {
        running.delete(id);
    }
    catch { }
}
/**
 * Close all SSE connections and clean up buffers for a history/stream ID.
 * Use this for non-job streaming endpoints (/api/download/best, /audio, etc.)
 * where there's no Job object but SSE cleanup is still needed.
 */
function endSseFor(id, status = 'completed') {
    try {
        // Send final event
        pushSse(id, { id, status }, 'end');
        // Close all connected SSE responses
        const set = sseListeners.get(id);
        if (set) {
            for (const res of Array.from(set)) {
                try {
                    res.end();
                }
                catch { }
                try {
                    set.delete(res);
                }
                catch { }
            }
            if (set.size === 0) {
                try {
                    sseListeners.delete(id);
                }
                catch { }
            }
        }
        // Clean up ring buffer (CRITICAL for memory leak prevention)
        sseBuffers.delete(id);
        // Clean up throttle
        clearHistoryThrottle(id);
    }
    catch (err) {
        log.error('endSseFor_failed', { id, error: String(err) });
    }
}
Object.assign(app.locals, {
    finalizeJob,
    endSseFor,
    pushSse,
    emitProgress,
    minFreeDiskBytes: MIN_FREE_DISK_BYTES,
});
function schedule() {
    const runningCountFor = (uid) => {
        if (!uid)
            return 0;
        let n = 0;
        for (const id of running) {
            const j = jobs.get(id);
            if (j?.userId === uid)
                n++;
        }
        return n;
    };
    while (running.size < MAX_CONCURRENT && waiting.length > 0) {
        const idx = waiting.findIndex(({ job }) => {
            const cap = Math.max(1, Number(job.concurrencyCap || 1));
            return runningCountFor(job.userId) < cap;
        });
        if (idx < 0)
            break;
        const next = waiting.splice(idx, 1)[0];
        running.add(next.job.id);
        updateHistory(next.job.id, { status: 'in-progress' });
        emitProgress(next.job.id, { progress: 0, stage: 'starting' });
        try {
            next.run();
        }
        catch {
            running.delete(next.job.id);
            updateHistory(next.job.id, { status: 'failed' });
            emitProgress(next.job.id, { stage: 'failed' });
        }
    }
}
// ========================
// Helpers za batch
// ========================
function summarizeBatch(b) {
    const items = readHistory();
    let completed = 0, failed = 0, canceled = 0, runningCt = 0, queuedCt = 0;
    for (const it of b.items) {
        const h = items.find((x) => x.id === it.jobId);
        switch (h?.status) {
            case 'completed':
                completed++;
                break;
            case 'failed':
                failed++;
                break;
            case 'canceled':
                canceled++;
                break;
            case 'in-progress':
                runningCt++;
                break;
            case 'queued':
                queuedCt++;
                break;
        }
    }
    const total = b.items.length;
    const done = completed + failed + canceled;
    if (!b.finishedAt && done === total)
        b.finishedAt = Date.now();
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
// Internal stats endpoint (for development/monitoring)
app.get('/api/stats', requireAuth, (_req, res) => {
    res.json({
        sse: sseHub.getStats(),
        jobs: jobManager.getStats(),
        queue: jobManager.getQueueInfo(),
        legacy: {
            jobs: jobs.size,
            waiting: waiting.length,
            running: running.size,
            sseListeners: sseListeners.size,
            sseBuffers: sseBuffers.size,
        },
    });
});
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
// /api/version (diag) - with caching
// ========================
let ytVersionCache = null;
const YT_VERSION_CACHE_TTL = 5 * 60 * 1000; // 5 minutes
function getYtDlpVersion() {
    const now = Date.now();
    if (ytVersionCache && (now - ytVersionCache.timestamp) < YT_VERSION_CACHE_TTL) {
        return ytVersionCache.version;
    }
    let version = '';
    try {
        const out = spawnSync('yt-dlp', ['--version'], { encoding: 'utf8', timeout: 2000 });
        if (out?.status === 0)
            version = String(out.stdout || '').trim();
    }
    catch (err) {
        log.warn('ytdlp_version_check_failed', { error: String(err) });
    }
    ytVersionCache = { version, timestamp: now };
    return version;
}
app.get('/api/version', (_req, res) => {
    try {
        let pkg = {};
        try {
            const p = path.join(process.cwd(), 'package.json');
            if (fs.existsSync(p))
                pkg = JSON.parse(fs.readFileSync(p, 'utf8'));
        }
        catch { }
        const ytVersion = getYtDlpVersion();
        const freeBytes = getFreeDiskBytes(os.tmpdir());
        res.json({
            name: pkg?.name || 'yt-dlp-server',
            version: pkg?.version || '0.0.0',
            node: process.version,
            platform: `${process.platform} ${process.arch}`,
            ytDlp: ytVersion || 'unknown',
            checks: {
                ytdlpAvailable: Boolean(ytVersion),
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
                for (const b of batches.values())
                    if (!b.finishedAt)
                        active++;
                return { total: batches.size, active };
            })(),
        });
    }
    catch (err) {
        res.status(500).json({ error: 'version_failed', details: String(err?.message || err) });
    }
});
// ========================
// Logs (tail/recent/download)
// ========================
app.get('/api/logs/tail', requireAuth, (req, res) => {
    try {
        const max = Math.max(1, Math.min(500, parseInt(String(req.query.lines || '200'), 10) || 200));
        const logDir = path.resolve(process.cwd(), 'logs');
        const logFile = path.join(logDir, 'app.log');
        if (!fs.existsSync(logFile))
            return res.json({ lines: [] });
        const buf = fs.readFileSync(logFile, 'utf8');
        const tail = buf.split(/\r?\n/).slice(-max);
        res.json({ lines: tail });
    }
    catch (err) {
        res.status(500).json({ error: 'tail_failed', details: String(err?.message || err) });
    }
});
app.get('/api/logs/recent', requireAuth, (req, res) => {
    try {
        const logDir = path.resolve(process.cwd(), 'logs');
        const logFile = path.join(logDir, 'app.log');
        if (!fs.existsSync(logFile))
            return res.json({ lines: [] });
        const max = Math.max(1, Math.min(1000, parseInt(String(req.query.lines || '300'), 10) || 300));
        const level = String(req.query.level || '').toLowerCase();
        const q = String(req.query.q || '').trim().toLowerCase();
        let lines = fs.readFileSync(logFile, 'utf8').split(/\r?\n/).filter(Boolean);
        if (level && ['debug', 'info', 'warn', 'error'].includes(level)) {
            const token = `| ${level.toUpperCase()} |`;
            lines = lines.filter((l) => l.includes(token));
        }
        if (q)
            lines = lines.filter((l) => l.toLowerCase().includes(q));
        const out = lines.slice(-max);
        res.json({ lines: out, count: out.length });
    }
    catch (err) {
        res.status(500).json({ error: 'recent_failed', details: String(err?.message || err) });
    }
});
app.get('/api/logs/download', requireAuth, (req, res) => {
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
        if (q)
            lines = lines.filter((l) => l.toLowerCase().includes(q));
        const out = lines.slice(-max).join('\n');
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.setHeader('Content-Disposition', 'attachment; filename="logs.txt"');
        res.end(out);
    }
    catch (err) {
        res.status(500).json({ error: 'download_failed', details: String(err?.message || err) });
    }
});
// ========================
// History CRUD
// ========================
app.get('/api/history', requireAuth, (_req, res) => {
    res.json({ items: readHistory() });
});
app.delete('/api/history/:id', requireAuth, (req, res) => {
    try {
        const id = req.params.id;
        const job = jobs.get(id);
        if (job) {
            const idx = waiting.findIndex((w) => w.job.id === id);
            if (idx >= 0)
                waiting.splice(idx, 1);
            safeKill(job.child);
            finalizeJob(id, 'canceled', { job, keepJob: false, keepFiles: false });
        }
        removeHistory(id);
        res.json({ ok: true });
    }
    catch {
        res.status(500).json({ error: 'delete_failed' });
    }
});
app.delete('/api/history', requireAuth, (_req, res) => {
    try {
        clearHistory();
        res.json({ ok: true });
    }
    catch {
        res.status(500).json({ error: 'clear_failed' });
    }
});
// ========================
// Jobs metrike / podešavanja
// ========================
app.get('/api/jobs/metrics', requireAuth, (_req, res) => {
    res.json({ running: running.size, queued: waiting.length, maxConcurrent: MAX_CONCURRENT });
});
// List all active jobs (running + queued) for current user
app.get('/api/job/list', requireAuth, (req, res) => {
    const userId = req.user?.id;
    if (!userId)
        return res.status(401).json({ error: 'Unauthorized' });
    // Collect all jobs belonging to this user
    const userJobs = [];
    // Running jobs
    for (const jobId of running) {
        const job = jobs.get(jobId);
        if (job && job.userId === userId) {
            userJobs.push({
                id: job.id,
                type: job.type,
                status: 'running',
                tmpId: job.tmpId,
            });
        }
    }
    // Queued jobs
    for (const waitingItem of waiting) {
        if (waitingItem.job.userId === userId) {
            userJobs.push({
                id: waitingItem.job.id,
                type: waitingItem.job.type,
                status: 'queued',
                tmpId: waitingItem.job.tmpId,
            });
        }
    }
    res.json({ jobs: userJobs });
});
app.get('/api/jobs/settings', requireAuth, (_req, res) => {
    res.json({ maxConcurrent: MAX_CONCURRENT, proxyUrl: PROXY_URL || '', limitRateKbps: LIMIT_RATE ?? 0 });
});
app.post('/api/jobs/settings', requireAuth, (req, res) => {
    try {
        const { maxConcurrent, proxyUrl, limitRateKbps } = (req.body || {});
        const n = Number(maxConcurrent);
        if (!Number.isFinite(n))
            return res.status(400).json({ error: 'invalid_number' });
        MAX_CONCURRENT = Math.max(1, Math.min(6, Math.floor(n)));
        PROXY_URL = typeof proxyUrl === 'string' ? proxyUrl.trim() || undefined : PROXY_URL;
        const lr = Number(limitRateKbps);
        if (Number.isFinite(lr) && lr >= 0)
            LIMIT_RATE = Math.floor(lr);
        writeServerSettings({ maxConcurrent: MAX_CONCURRENT, proxyUrl: PROXY_URL, limitRateKbps: LIMIT_RATE });
        schedule();
        res.json({ ok: true, maxConcurrent: MAX_CONCURRENT, proxyUrl: PROXY_URL || '', limitRateKbps: LIMIT_RATE ?? 0 });
    }
    catch {
        res.status(500).json({ error: 'update_failed' });
    }
});
app.post('/api/jobs/settings/reset', requireAuth, (_req, res) => {
    try {
        MAX_CONCURRENT = 2;
        PROXY_URL = undefined;
        LIMIT_RATE = 0;
        writeServerSettings({ maxConcurrent: 2, proxyUrl: '', limitRateKbps: 0 });
        schedule();
        res.json({ ok: true, maxConcurrent: MAX_CONCURRENT, proxyUrl: '', limitRateKbps: LIMIT_RATE });
    }
    catch {
        res.status(500).json({ error: 'reset_failed' });
    }
});
// ========================
// Analyze (yt-dlp -j)
// ========================
app.post('/api/analyze', analyzeRateLimit, requireAuth, async (req, res, next) => {
    try {
        const { url } = AnalyzeBody.parse(req.body);
        if (!isUrlAllowed(url, cfg))
            return res.status(400).json({ error: 'Invalid or missing url' });
        await assertPublicHttpHost(url);
        const json = await dumpInfoJson(url, {
            args: {
                preferFreeFormats: true,
                addHeader: makeHeaders(url),
                ...(cfg.maxFileSizeMb ? { maxFilesize: `${cfg.maxFileSizeMb}M` } : {}),
                ...(cfg.maxDurationSec ? { matchFilter: `duration <= ${cfg.maxDurationSec}` } : {}),
            },
        });
        res.json(json);
    }
    catch (err) {
        const { status, code, message } = normalizeYtError(err);
        log.error('analyze_failed', err?.message || err);
        return next(new HttpError(status, code, message));
    }
});
// ========================
// Proxy download
// ========================
const proxyLimiter = rateLimit({ windowMs: 60000, max: (cfg.proxyDownloadMaxPerMin ?? 60) });
app.get('/api/proxy-download', requireAuth, proxyBucket, proxyLimiter, wrap(proxyDownload));
// Token-aware limiter za /api/download i /api/job
const extractForwardedFor = (value) => {
    if (!value)
        return undefined;
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
const resolveClientIp = (req) => {
    try {
        const forwarded = extractForwardedFor(req?.headers?.['x-forwarded-for']);
        if (forwarded)
            return forwarded;
    }
    catch { }
    const ip = req?.ip || req?.socket?.remoteAddress || req?.connection?.remoteAddress;
    return typeof ip === 'string' && ip ? ip : 'unknown';
};
const keyer = (req) => {
    if (req.user?.id)
        return String(req.user.id);
    return resolveClientIp(req);
};
const dlLimiter = rateLimit({ windowMs: 60000, max: 20, keyGenerator: keyer });
// Only apply auth + limiter to /api/download, NOT /api/job (job routes use per-route auth or signed URLs)
app.use('/api/download', requireAuth, dlLimiter);
// ========================
// get-url (-g)
// ========================
app.post('/api/get-url', requireAuth, async (req, res, next) => {
    try {
        const { url, formatId } = req.body;
        if (!url || !formatId || !isUrlAllowed(url, cfg)) {
            return res.status(400).json({ error: 'missing_or_invalid_params' });
        }
        // Security: validate formatId to prevent injection attacks
        const FORMAT_ID_RE = /^[0-9a-zA-Z+*/.\-]{1,32}$/;
        if (!FORMAT_ID_RE.test(formatId)) {
            return res.status(400).json({ error: 'invalid_format_id' });
        }
        await assertPublicHttpHost(url);
        const output = await ytdlp(url, {
            getUrl: true,
            format: formatId,
            noCheckCertificates: true,
            noWarnings: true,
            addHeader: makeHeaders(url),
            ...(cfg.maxFileSizeMb ? { maxFilesize: `${cfg.maxFileSizeMb}M` } : {}),
            ...(cfg.maxDurationSec ? { matchFilter: `duration <= ${cfg.maxDurationSec}` } : {}),
        }, { env: cleanedChildEnv(process.env) });
        const lines = String(output).trim().split(/\r?\n/).filter(Boolean);
        res.json({ url: lines[0] || '' });
    }
    catch (err) {
        log.error('get_url_failed', err?.message || err);
        return next(new HttpError(400, 'GET_URL_FAILED', String(err?.stderr || err?.message || err)));
    }
});
// ========================
// Download Routes (Refactored to routes/downloads.ts)
// ========================
setupDownloadRoutes(app, requireAuth, cfg, log, { appendHistory, updateHistory, updateHistoryThrottled }, { emitProgress, endSseFor }, { PROXY_URL });
// ========================
// Background jobs (queue)
// ========================
app.post('/api/job/start/best', requireAuth, async (req, res) => {
    try {
        const { url: sourceUrl, title = 'video' } = (req.body || {});
        if (!sourceUrl || !/^https?:\/\//i.test(sourceUrl) || !isUrlAllowed(sourceUrl, cfg))
            return res.status(400).json({ error: 'invalid_url' });
        await assertPublicHttpHost(sourceUrl);
        const requestUser = {
            id: req.user?.id ?? 'anon',
            username: req.user?.username,
            plan: req.user?.plan ?? 'FREE',
            planExpiresAt: req.user?.planExpiresAt ?? undefined,
        };
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
        }
        catch { }
        const hist = appendHistory({ title, url: sourceUrl, type: 'video', format: 'MP4', status: 'queued' });
        const job = { id: hist.id, type: 'video', tmpId, tmpDir, userId: requestUser.id, concurrencyCap: policyAtQueue.concurrentJobs, version: 1 };
        jobs.set(hist.id, job);
        emitProgress(hist.id, { progress: 0, stage: 'queued' });
        const run = () => {
            log.info('job_spawn_best', `url=${sourceUrl} user=${requestUser.id}`);
            const policy = policyAtQueue;
            const child = ytdlp.exec(sourceUrl, {
                format: selectVideoFormat(policy),
                output: outPath,
                addHeader: makeHeaders(sourceUrl),
                restrictFilenames: true,
                noCheckCertificates: true,
                noWarnings: true,
                newline: true,
                proxy: PROXY_URL,
                limitRate: chosenLimitRateK(policy.speedLimitKbps),
                ...(cfg.maxFileSizeMb ? { maxFilesize: `${cfg.maxFileSizeMb}M` } : {}),
                ...(cfg.maxDurationSec ? { matchFilter: `duration <= ${cfg.maxDurationSec}` } : {}),
                ...ytDlpArgsFromPolicy(policy),
                ...speedyDlArgs(),
            }, { env: cleanedChildEnv(process.env) });
            job.child = child;
            trapChildPromise(child, 'yt_dlp_unhandled_job_best');
            const onProgress = (buf) => {
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
            child.on('error', (err) => { try {
                log.error('yt_dlp_error_best', err?.message || String(err));
            }
            catch { } });
            child.on('close', (code) => {
                try {
                    log.info('yt_dlp_close_best', `code=${code}`);
                }
                catch { }
                running.delete(hist.id);
                let succeeded = false;
                try {
                    const cur = readHistory().find((x) => x.id === hist.id);
                    if (cur?.status === 'canceled') {
                        schedule();
                        return;
                    }
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
                        }
                        else {
                            updateHistory(hist.id, { status: 'failed' });
                            clearHistoryThrottle(hist.id);
                        }
                    }
                    else {
                        updateHistory(hist.id, { status: 'failed' });
                        clearHistoryThrottle(hist.id);
                    }
                }
                catch { }
                if (!succeeded) {
                    finalizeJob(hist.id, 'failed', { job, keepJob: false, keepFiles: false });
                }
                schedule();
            });
        };
        waiting.push({ job, run });
        schedule();
        return res.json({ id: hist.id });
    }
    catch (err) {
        log.error('job_start_best_failed', err?.message || err);
        return res.status(500).json({ error: 'job_start_failed' });
    }
});
app.post('/api/job/start/audio', requireAuth, async (req, res) => {
    try {
        const { url: sourceUrl, title = 'audio', format = DEFAULT_AUDIO_FORMAT } = (req.body || {});
        if (!sourceUrl || !/^https?:\/\//i.test(sourceUrl) || !isUrlAllowed(sourceUrl, cfg))
            return res.status(400).json({ error: 'invalid_url' });
        await assertPublicHttpHost(sourceUrl);
        const fmt = coerceAudioFormat(format, DEFAULT_AUDIO_FORMAT);
        if (!fmt)
            return res.status(400).json({ error: 'invalid_format' });
        const requestUser = {
            id: req.user?.id ?? 'anon',
            username: req.user?.username,
            plan: req.user?.plan ?? 'FREE',
            planExpiresAt: req.user?.planExpiresAt ?? undefined,
        };
        const policyAtQueue = policyFor(requestUser.plan);
        const tmpDir = os.tmpdir();
        const tmpId = randomUUID();
        const outPath = path.join(fs.realpathSync(tmpDir), `${tmpId}.%(ext)s`);
        try {
            const free = getFreeDiskBytes(tmpDir);
            if (MIN_FREE_DISK_BYTES > 0 && free > -1 && free < MIN_FREE_DISK_BYTES) {
                return res.status(507).json({ error: 'INSUFFICIENT_STORAGE' });
            }
        }
        catch { }
        const hist = appendHistory({ title, url: sourceUrl, type: 'audio', format: fmt.toUpperCase(), status: 'queued' });
        const job = { id: hist.id, type: 'audio', tmpId, tmpDir, userId: requestUser.id, concurrencyCap: policyAtQueue.concurrentJobs, version: 1 };
        jobs.set(hist.id, job);
        emitProgress(hist.id, { progress: 0, stage: 'queued' });
        const run = () => {
            log.info('job_spawn_audio', `url=${sourceUrl} fmt=${fmt} user=${requestUser.id}`);
            const policy = policyAtQueue;
            const child = ytdlp.exec(sourceUrl, {
                ...selectAudioFormat(fmt),
                output: outPath,
                addHeader: makeHeaders(sourceUrl),
                restrictFilenames: true,
                noCheckCertificates: true,
                noWarnings: true,
                newline: true,
                proxy: PROXY_URL,
                limitRate: chosenLimitRateK(policy.speedLimitKbps),
                ...(cfg.maxFileSizeMb ? { maxFilesize: `${cfg.maxFileSizeMb}M` } : {}),
                ...(cfg.maxDurationSec ? { matchFilter: `duration <= ${cfg.maxDurationSec}` } : {}),
                ...ytDlpArgsFromPolicy(policy),
                ...speedyDlArgs(),
            }, { env: cleanedChildEnv(process.env) });
            job.child = child;
            trapChildPromise(child, 'yt_dlp_unhandled_job_audio');
            const onProgress = (buf) => {
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
            child.on('error', (err) => { try {
                log.error('yt_dlp_error_audio', err?.message || String(err));
            }
            catch { } });
            child.on('close', (code) => {
                try {
                    log.info('yt_dlp_close_audio', `code=${code}`);
                }
                catch { }
                running.delete(hist.id);
                let succeeded = false;
                try {
                    const cur = readHistory().find((x) => x.id === hist.id);
                    if (cur?.status === 'canceled') {
                        schedule();
                        return;
                    }
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
                        }
                        else {
                            updateHistory(hist.id, { status: 'failed' });
                            clearHistoryThrottle(hist.id);
                        }
                    }
                    else {
                        updateHistory(hist.id, { status: 'failed' });
                        clearHistoryThrottle(hist.id);
                    }
                }
                catch { }
                if (!succeeded) {
                    finalizeJob(hist.id, 'failed', { job, keepJob: false, keepFiles: false });
                }
                schedule();
            });
        };
        waiting.push({ job, run });
        schedule();
        return res.json({ id: hist.id });
    }
    catch (err) {
        log.error('job_start_audio_failed', err?.message || err);
        return res.status(500).json({ error: 'job_start_failed' });
    }
});
// Clip
app.post('/api/job/start/clip', requireAuth, async (req, res) => {
    try {
        const { url: sourceUrl, title = 'clip', start, end } = (req.body || {});
        if (!sourceUrl || !/^https?:\/\//i.test(sourceUrl) || !isUrlAllowed(sourceUrl, cfg))
            return res.status(400).json({ error: 'invalid_url' });
        await assertPublicHttpHost(sourceUrl);
        const s = Number(start), e = Number(end);
        if (!Number.isFinite(s) || !Number.isFinite(e) || !(e > s))
            return res.status(400).json({ error: 'invalid_range' });
        const requestUser = {
            id: req.user?.id ?? 'anon',
            username: req.user?.username,
            plan: req.user?.plan ?? 'FREE',
            planExpiresAt: req.user?.planExpiresAt ?? undefined,
        };
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
        }
        catch { }
        const hist = appendHistory({ title, url: sourceUrl, type: 'video', format: 'MP4', status: 'queued' });
        const job = { id: hist.id, type: 'video', tmpId, tmpDir, userId: requestUser.id, concurrencyCap: policyAtQueue.concurrentJobs, version: 1 };
        jobs.set(hist.id, job);
        emitProgress(hist.id, { progress: 0, stage: 'queued' });
        const run = () => {
            log.info('job_spawn_clip', `url=${sourceUrl} ${section} user=${requestUser.id}`);
            const policy = policyAtQueue;
            const child = ytdlp.exec(sourceUrl, {
                format: selectVideoFormat(policy),
                output: outPath,
                addHeader: makeHeaders(sourceUrl),
                noCheckCertificates: true,
                noWarnings: true,
                newline: true,
                downloadSections: section,
                proxy: PROXY_URL,
                limitRate: chosenLimitRateK(policy.speedLimitKbps),
                ...(cfg.maxFileSizeMb ? { maxFilesize: `${cfg.maxFileSizeMb}M` } : {}),
                ...(cfg.maxDurationSec ? { matchFilter: `duration <= ${cfg.maxDurationSec}` } : {}),
                ...ytDlpArgsFromPolicy(policy),
                ...speedyDlArgs(),
            });
            job.child = child;
            trapChildPromise(child, 'yt_dlp_unhandled_job_clip');
            const onProgress = (buf) => {
                const { pct, speed, eta } = parseDlLine(buf.toString());
                if (typeof pct === 'number') {
                    updateHistoryThrottled(hist.id, pct);
                    emitProgress(hist.id, { progress: pct, stage: 'downloading', speed, eta });
                }
            };
            child.stdout?.on('data', onProgress);
            child.stderr?.on('data', onProgress);
            child.on('close', (code) => {
                running.delete(hist.id);
                let succeeded = false;
                try {
                    const cur = readHistory().find((x) => x.id === hist.id);
                    if (cur?.status === 'canceled') {
                        schedule();
                        return;
                    }
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
                        }
                        else {
                            updateHistory(hist.id, { status: 'failed' });
                            clearHistoryThrottle(hist.id);
                        }
                    }
                    else {
                        updateHistory(hist.id, { status: 'failed' });
                        clearHistoryThrottle(hist.id);
                    }
                }
                catch { }
                if (!succeeded) {
                    finalizeJob(hist.id, 'failed', { job, keepJob: false, keepFiles: false });
                }
                schedule();
            });
        };
        waiting.push({ job, run });
        schedule();
        return res.json({ id: hist.id });
    }
    catch (err) {
        log.error('job_start_clip_failed', err?.message || err);
        return res.status(500).json({ error: 'job_start_failed' });
    }
});
// Embed subs
app.post('/api/job/start/embed-subs', requireAuth, async (req, res) => {
    try {
        // FFmpeg gate - embedding subtitles requires FFmpeg for muxing
        if (!ffmpegEnabled()) {
            return res.status(501).json({
                error: 'feature_disabled',
                message: 'Embedding subtitles requires FFmpeg which is disabled in this deployment'
            });
        }
        const { url: sourceUrl, title = 'video', lang, format = 'srt', container = 'mp4' } = (req.body || {});
        if (!sourceUrl || !/^https?:\/\//i.test(sourceUrl) || !isUrlAllowed(sourceUrl, cfg))
            return res.status(400).json({ error: 'invalid_url' });
        await assertPublicHttpHost(sourceUrl);
        if (!lang)
            return res.status(400).json({ error: 'missing_lang' });
        const requestUser = {
            id: req.user?.id ?? 'anon',
            username: req.user?.username,
            plan: req.user?.plan ?? 'FREE',
            planExpiresAt: req.user?.planExpiresAt ?? undefined,
        };
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
        }
        catch { }
        const hist = appendHistory({ title, url: sourceUrl, type: 'video', format: cont.toUpperCase(), status: 'queued' });
        const job = { id: hist.id, type: 'video', tmpId, tmpDir, userId: requestUser.id, concurrencyCap: policyAtQueue.concurrentJobs, version: 1 };
        jobs.set(hist.id, job);
        emitProgress(hist.id, { progress: 0, stage: 'queued' });
        const run = () => {
            log.info('job_spawn_embed_subs', `url=${sourceUrl} lang=${lang} fmt=${fmt} cont=${cont} user=${requestUser.id}`);
            const policy = policyAtQueue;
            const child = ytdlp.exec(sourceUrl, {
                format: 'bv*+ba/b',
                writeSubs: true,
                subLangs: lang,
                subFormat: fmt,
                output: outPath,
                addHeader: makeHeaders(sourceUrl),
                restrictFilenames: true,
                noCheckCertificates: true,
                noWarnings: true,
                newline: true,
                proxy: PROXY_URL,
                limitRate: chosenLimitRateK(policy.speedLimitKbps),
                ...(cfg.maxFileSizeMb ? { maxFilesize: `${cfg.maxFileSizeMb}M` } : {}),
                ...(cfg.maxDurationSec ? { matchFilter: `duration <= ${cfg.maxDurationSec}` } : {}),
                ...ytDlpArgsFromPolicy(policy),
                ...speedyDlArgs(),
            });
            job.child = child;
            trapChildPromise(child, 'yt_dlp_unhandled_job_embed_subs');
            const onProgress = (buf) => {
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
            child.on('close', (code) => {
                running.delete(hist.id);
                let succeeded = false;
                try {
                    const cur = readHistory().find((x) => x.id === hist.id);
                    if (cur?.status === 'canceled') {
                        schedule();
                        return;
                    }
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
                        }
                        else {
                            updateHistory(hist.id, { status: 'failed' });
                            clearHistoryThrottle(hist.id);
                        }
                    }
                    else {
                        updateHistory(hist.id, { status: 'failed' });
                        clearHistoryThrottle(hist.id);
                    }
                }
                catch { }
                if (!succeeded) {
                    finalizeJob(hist.id, 'failed', { job, keepJob: false, keepFiles: false });
                }
                schedule();
            });
        };
        waiting.push({ job, run });
        schedule();
        return res.json({ id: hist.id });
    }
    catch (err) {
        log.error('job_start_embed_subs_failed', err?.message || err);
        return res.status(500).json({ error: 'job_start_failed' });
    }
});
// Convert/merge
app.post('/api/job/start/convert', requireAuth, async (req, res) => {
    try {
        const { url: sourceUrl, title = 'video', container = 'mp4' } = (req.body || {});
        if (!sourceUrl || !/^https?:\/\//i.test(sourceUrl) || !isUrlAllowed(sourceUrl, cfg))
            return res.status(400).json({ error: 'invalid_url' });
        await assertPublicHttpHost(sourceUrl);
        const requestUser = {
            id: req.user?.id ?? 'anon',
            username: req.user?.username,
            plan: req.user?.plan ?? 'FREE',
            planExpiresAt: req.user?.planExpiresAt ?? undefined,
        };
        const policyAtQueue = policyFor(requestUser.plan);
        const fmt = String(container).toLowerCase();
        const valid = ['mp4', 'mkv', 'webm'];
        const mergeOut = valid.includes(fmt) ? fmt : 'mp4';
        const tmpDir = os.tmpdir();
        const tmpId = randomUUID();
        const outPath = path.join(fs.realpathSync(tmpDir), `${tmpId}.%(ext)s`);
        try {
            const free = getFreeDiskBytes(tmpDir);
            if (MIN_FREE_DISK_BYTES > 0 && free > -1 && free < MIN_FREE_DISK_BYTES) {
                return res.status(507).json({ error: 'INSUFFICIENT_STORAGE' });
            }
        }
        catch { }
        const hist = appendHistory({ title, url: sourceUrl, type: 'video', format: String(mergeOut).toUpperCase(), status: 'queued' });
        const job = { id: hist.id, type: 'video', tmpId, tmpDir, userId: requestUser.id, concurrencyCap: policyAtQueue.concurrentJobs, version: 1 };
        jobs.set(hist.id, job);
        emitProgress(hist.id, { progress: 0, stage: 'queued' });
        const run = () => {
            log.info('job_spawn_convert', `url=${sourceUrl} container=${mergeOut} user=${requestUser.id}`);
            const policy = policyAtQueue;
            const child = ytdlp.exec(sourceUrl, {
                format: selectVideoFormat(policy),
                output: outPath,
                addHeader: makeHeaders(sourceUrl),
                restrictFilenames: true,
                noCheckCertificates: true,
                noWarnings: true,
                newline: true,
                proxy: PROXY_URL,
                limitRate: chosenLimitRateK(policy.speedLimitKbps),
                ...(cfg.maxFileSizeMb ? { maxFilesize: `${cfg.maxFileSizeMb}M` } : {}),
                ...(cfg.maxDurationSec ? { matchFilter: `duration <= ${cfg.maxDurationSec}` } : {}),
                ...ytDlpArgsFromPolicy(policy),
                ...speedyDlArgs(),
            });
            job.child = child;
            trapChildPromise(child, 'yt_dlp_unhandled_job_convert');
            const onProgress = (buf) => {
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
            child.on('error', (err) => { try {
                log.error('yt_dlp_error_convert', err?.message || String(err));
            }
            catch { } });
            child.on('close', (code) => {
                try {
                    log.info('yt_dlp_close_convert', `code=${code}`);
                }
                catch { }
                running.delete(hist.id);
                let succeeded = false;
                try {
                    const cur = readHistory().find((x) => x.id === hist.id);
                    if (cur?.status === 'canceled') {
                        schedule();
                        return;
                    }
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
                        }
                        else {
                            updateHistory(hist.id, { status: 'failed' });
                            clearHistoryThrottle(hist.id);
                        }
                    }
                    else {
                        updateHistory(hist.id, { status: 'failed' });
                        clearHistoryThrottle(hist.id);
                    }
                }
                catch { }
                if (!succeeded) {
                    finalizeJob(hist.id, 'failed', { job, keepJob: false, keepFiles: false });
                }
                schedule();
            });
        };
        waiting.push({ job, run });
        schedule();
        return res.json({ id: hist.id });
    }
    catch (err) {
        log.error('job_start_convert_failed', err?.message || err);
        return res.status(500).json({ error: 'job_start_failed' });
    }
});
// ========================
// Batches
// ========================
app.post('/api/batch', batchRateLimit, requireAuth, async (req, res) => {
    try {
        const { urls, mode = 'video', audioFormat = DEFAULT_AUDIO_FORMAT, titleTemplate } = (req.body || {});
        if (!Array.isArray(urls) || !urls.length)
            return res.status(400).json({ error: 'missing_urls' });
        const requestUser = {
            id: req.user?.id ?? 'anon',
            username: req.user?.username,
            plan: req.user?.plan ?? 'FREE',
            planExpiresAt: req.user?.planExpiresAt ?? undefined,
        };
        const policy = policyFor(requestUser.plan);
        const normalized = Array.from(new Set(urls.map(u => String(u || '').trim()).filter(u => /^https?:\/\//i.test(u))));
        const unique = [];
        for (const u of normalized) {
            if (!isUrlAllowed(u, cfg))
                continue;
            await assertPublicHttpHost(u);
            unique.push(u);
        }
        if (!unique.length)
            return res.status(400).json({ error: 'no_valid_urls' });
        if (unique.length > policy.batchMax)
            return res.status(400).json({ error: 'BATCH_LIMIT_EXCEEDED', limit: policy.batchMax });
        let audioFmt;
        if (mode === 'audio') {
            const resolved = coerceAudioFormat(audioFormat, DEFAULT_AUDIO_FORMAT);
            if (!resolved)
                return res.status(400).json({ error: 'invalid_format' });
            audioFmt = resolved;
        }
        const batchId = randomUUID();
        const batch = { id: batchId, userId: requestUser.id, createdAt: Date.now(), mode, format: mode === 'audio' ? audioFmt : undefined, items: [] };
        batches.set(batchId, batch);
        for (const u of unique) {
            const title = titleTemplate ? titleTemplate.replace(/\{index\}/g, String(batch.items.length + 1)) : (mode === 'audio' ? 'audio' : 'video');
            const tmpDir = os.tmpdir();
            const tmpId = randomUUID();
            const outPath = path.join(fs.realpathSync(tmpDir), `${tmpId}.%(ext)s`);
            const hist = appendHistory({ title, url: u, type: mode, format: mode === 'audio' ? String(audioFmt).toUpperCase() : 'MP4', status: 'queued' });
            const job = { id: hist.id, type: mode, tmpId, tmpDir, userId: requestUser.id, concurrencyCap: policy.concurrentJobs, version: 1 };
            jobs.set(hist.id, job);
            batch.items.push({ url: u, jobId: hist.id });
            emitProgress(hist.id, { progress: 0, stage: 'queued', batchId });
            const run = () => {
                const policyCur = policy;
                const commonArgs = {
                    output: outPath,
                    addHeader: makeHeaders(u),
                    restrictFilenames: true,
                    noCheckCertificates: true,
                    noWarnings: true,
                    newline: true,
                    proxy: PROXY_URL,
                    limitRate: chosenLimitRateK(policyCur.speedLimitKbps),
                    ...(cfg.maxFileSizeMb ? { maxFilesize: `${cfg.maxFileSizeMb}M` } : {}),
                    ...(cfg.maxDurationSec ? { matchFilter: `duration <= ${cfg.maxDurationSec}` } : {}),
                    ...ytDlpArgsFromPolicy(policyCur),
                    ...speedyDlArgs(),
                };
                let child;
                if (mode === 'audio' && audioFmt) {
                    child = ytdlp.exec(u, {
                        ...selectAudioFormat(audioFmt),
                        ...commonArgs
                    }, { env: cleanedChildEnv(process.env) });
                }
                else {
                    child = ytdlp.exec(u, {
                        format: selectVideoFormat(policyCur),
                        ...commonArgs
                    }, { env: cleanedChildEnv(process.env) });
                }
                job.child = child;
                trapChildPromise(child, mode === 'audio' ? 'yt_dlp_unhandled_batch_audio' : 'yt_dlp_unhandled_batch_video');
                let stderrBuf = '';
                const onProgress = (buf) => {
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
                const onStderr = (buf) => {
                    stderrBuf += buf.toString();
                    onProgress(buf);
                };
                child.stdout?.on('data', onProgress);
                child.stderr?.on('data', onStderr);
                child.on('close', (code) => {
                    running.delete(hist.id);
                    let succeeded = false;
                    try {
                        const produced = findProducedFile(tmpDir, tmpId, mode === 'audio'
                            ? ['.mp3', '.m4a', '.aac', '.opus', '.flac', '.wav', '.ogg', '.oga', '.alac']
                            : ['.mp4', '.mkv', '.webm']);
                        if (code === 0 && produced) {
                            job.produced = produced;
                            const full = path.join(tmpDir, produced);
                            let sizeMb = 0;
                            try {
                                sizeMb = Math.round(fs.statSync(full).size / 1024 / 1024);
                            }
                            catch { }
                            updateHistory(hist.id, { status: 'completed', progress: 100, size: `${sizeMb} MB` });
                            clearHistoryThrottle(hist.id);
                            emitProgress(hist.id, { progress: 100, stage: 'completed', batchId });
                            finalizeJob(hist.id, 'completed', { job, extra: { batchId } });
                            succeeded = true;
                        }
                        else {
                            updateHistory(hist.id, { status: 'failed' });
                            clearHistoryThrottle(hist.id);
                            emitProgress(hist.id, { stage: 'failed', batchId });
                        }
                    }
                    catch { }
                    if (!succeeded) {
                        // Normalize yt-dlp error for better UX
                        const normalized = normalizeYtError(stderrBuf);
                        finalizeJob(hist.id, 'failed', {
                            job,
                            keepJob: false,
                            keepFiles: false,
                            extra: { batchId, errorCode: normalized.code, errorMessage: normalized.message }
                        });
                    }
                    schedule();
                });
            };
            waiting.push({ job, run });
        }
        schedule();
        return res.json({ batchId, total: batch.items.length, items: batch.items });
    }
    catch (e) {
        return res.status(500).json({ error: 'batch_create_failed', message: String(e?.message || e) });
    }
});
// Batch summary
app.get('/api/batch/:id', requireAuth, (req, res) => {
    const b = batches.get(req.params.id);
    if (!b)
        return res.status(404).json({ error: 'not_found' });
    if (b.userId && b.userId !== req.user?.id)
        return res.status(403).json({ error: 'forbidden' });
    return res.json(summarizeBatch(b));
});
// Batch cancel (queued + running)
app.post('/api/batch/:id/cancel', requireAuth, (req, res) => {
    const b = batches.get(req.params.id);
    if (!b)
        return res.status(404).json({ error: 'not_found' });
    if (b.userId && b.userId !== req.user?.id)
        return res.status(403).json({ error: 'forbidden' });
    for (const it of b.items) {
        const job = jobs.get(it.jobId);
        if (!job)
            continue;
        const idx = waiting.findIndex(w => w.job.id === it.jobId);
        if (idx >= 0) {
            waiting.splice(idx, 1);
            updateHistory(it.jobId, { status: 'canceled' });
            emitProgress(it.jobId, { stage: 'canceled', batchId: b.id });
            finalizeJob(it.jobId, 'canceled', { job, keepJob: false, keepFiles: false, extra: { batchId: b.id } });
            continue;
        }
        safeKill(job.child);
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
app.get('/api/progress/:id', requireAuthOrSigned('progress'), progressBucket, (req, res) => {
    const id = req.params.id;
    setSseHeaders(res);
    appendVary(res, 'Authorization');
    res.flushHeaders?.();
    res.write(`retry: 5000\n`);
    addSseListener(id, res);
    let closed = false;
    let hb;
    let timeout;
    const cleanup = () => {
        if (closed)
            return;
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
        try {
            res.end();
        }
        catch { }
    };
    const safeWrite = (chunk) => {
        if (closed || res.writableEnded || res.destroyed)
            return;
        try {
            res.write(chunk);
        }
        catch {
            cleanup();
        }
    };
    // Activity-based timeout reset: 1 hour instead of 10 minutes
    const arm = () => {
        if (timeout)
            clearTimeout(timeout);
        timeout = setTimeout(() => {
            pushSse(id, { id, status: 'timeout' }, 'end');
            cleanup();
        }, 60 * 60 * 1000); // 1 hour
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
    const onErr = (err) => {
        const msg = String(err?.message || err || '');
        if (!/aborted|socket hang up|ECONNRESET|ERR_STREAM_PREMATURE_CLOSE/i.test(msg)) {
            try {
                log.warn('progress_sse_stream_error', msg);
            }
            catch { }
        }
        cleanup();
    };
    req.on('close', cleanup);
    req.on('aborted', cleanup);
    req.on('error', onErr);
    res.on('error', onErr);
    req.socket?.on?.('error', onErr);
    req.socket?.on?.('close', cleanup);
    safeWrite(`event: ping\ndata: {"ok":true}\n\n`);
    arm(); // Set initial timeout
    hb = setInterval(() => {
        safeWrite(`event: ping\ndata: {"ts":${Date.now()}}\n\n`);
        arm(); // Reset timeout on each heartbeat (activity-based)
    }, 15000);
});
// ========================
// Job cancel / all-cancel
// ========================
app.post('/api/job/cancel/:id', requireAuth, (req, res) => {
    const id = req.params.id;
    const job = jobs.get(id);
    if (!job)
        return res.status(404).json({ error: 'not_found' });
    const idx = waiting.findIndex(w => w.job.id === id);
    if (idx >= 0) {
        waiting.splice(idx, 1);
        updateHistory(id, { status: 'canceled' });
        emitProgress(id, { stage: 'canceled' });
        finalizeJob(id, 'canceled', { job, keepJob: false, keepFiles: false });
        return res.json({ ok: true });
    }
    try {
        safeKill(job.child);
        updateHistory(id, { status: 'canceled' });
        emitProgress(id, { stage: 'canceled' });
        finalizeJob(id, 'canceled', { job, keepJob: false, keepFiles: false });
    }
    catch { }
    return res.json({ ok: true });
});
app.post('/api/jobs/cancel-all', requireAuth, (_req, res) => {
    // queued
    while (waiting.length) {
        const next = waiting.shift();
        const id = next.job.id;
        updateHistory(id, { status: 'canceled' });
        emitProgress(id, { stage: 'canceled' });
        finalizeJob(id, 'canceled', { job: next.job, keepJob: false, keepFiles: false });
    }
    // running
    for (const id of Array.from(running)) {
        const job = jobs.get(id);
        try {
            job?.child?.kill('SIGTERM');
        }
        catch { }
        try {
            const pid = job?.child?.pid;
            if (pid && !job?.child?.killed)
                setTimeout(() => { try {
                    process.kill(pid, 'SIGKILL');
                }
                catch { } }, 5000);
        }
        catch { }
        updateHistory(id, { status: 'canceled' });
        emitProgress(id, { stage: 'canceled' });
        finalizeJob(id, 'canceled', { job: job, keepJob: false, keepFiles: false });
    }
    res.json({ ok: true });
});
// ========================
// Job file download (range + cleanup)
// ========================
app.post('/api/job/file/:id/sign', requireAuth, signBucket, (req, res) => {
    const id = req.params.id;
    const job = jobs.get(id);
    if (!job || !job.produced) {
        return res.status(404).json({ error: 'not_found' });
    }
    const requested = Number(req.body?.expiresIn ?? 0);
    const ttl = Number.isFinite(requested) && requested > 0 ? Math.min(Math.floor(requested), 3600) : 1800;
    const scope = 'download';
    const token = signToken({ sub: `job:${id}`, scope, ver: job.version }, ttl);
    signIssued.inc({ scope });
    signTtl.observe(ttl);
    setNoStore(res);
    return res.json({ token, expiresAt: Date.now() + ttl * 1000, queryParam: 's' });
});
app.post('/api/progress/:id/sign', requireAuth, signBucket, (req, res) => {
    const id = req.params.id;
    const job = jobs.get(id);
    if (!job) {
        return res.status(404).json({ error: 'not_found' });
    }
    const requested = Number(req.body?.expiresIn ?? 0);
    const ttl = Number.isFinite(requested) && requested > 0 ? Math.min(Math.floor(requested), 3600) : 600;
    const scope = 'progress';
    const token = signToken({ sub: `job:${id}`, scope, ver: job.version }, ttl);
    signIssued.inc({ scope });
    signTtl.observe(ttl);
    setNoStore(res);
    return res.json({ token, expiresAt: Date.now() + ttl * 1000, queryParam: 's' });
});
app.get('/api/job/file/:id', requireAuthOrSigned('download'), jobBucket, (req, res) => {
    const id = req.params.id;
    const job = jobs.get(id);
    if (!job || !job.produced)
        return res.status(404).json({ error: 'not_found' });
    const full = path.join(job.tmpDir, job.produced);
    if (!fs.existsSync(full))
        return res.status(404).json({ error: 'file_missing' });
    try {
        const stat = fs.statSync(full);
        appendVary(res, 'Authorization');
        const ext = path.extname(full).toLowerCase();
        const audioExts = new Set(['.mp3', '.m4a', '.aac', '.opus', '.flac', '.wav', '.ogg', '.oga', '.alac']);
        const isAudio = audioExts.has(ext);
        const videoType = ext === '.mkv' ? 'video/x-matroska' : ext === '.webm' ? 'video/webm' : 'video/mp4';
        const audioType = ext === '.mp3' ? 'audio/mpeg'
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
        setDownloadHeaders(res, `${base}.${extName}`, undefined, etag);
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
            const rangeStr = String(range);
            // Parse standard range (bytes=start-end) or suffix range (bytes=-N)
            let start, end;
            const suffixMatch = rangeStr.match(/bytes=-(\d+)$/);
            const standardMatch = rangeStr.match(/bytes=(\d+)-(\d+)?$/);
            if (suffixMatch) {
                // Suffix range: bytes=-N → last N bytes
                const suffix = parseInt(suffixMatch[1], 10);
                if (suffix <= 0 || !Number.isFinite(suffix)) {
                    res.status(416);
                    res.setHeader('Content-Range', `bytes */${stat.size}`);
                    return res.end();
                }
                start = Math.max(0, stat.size - suffix);
                end = stat.size - 1;
            }
            else if (standardMatch) {
                // Standard range: bytes=start-end
                start = parseInt(standardMatch[1], 10);
                end = standardMatch[2] ? parseInt(standardMatch[2], 10) : (stat.size - 1);
            }
            else {
                // Invalid range syntax
                res.status(416);
                res.setHeader('Content-Range', `bytes */${stat.size}`);
                return res.end();
            }
            // Validate range bounds
            if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end < start || start >= stat.size) {
                res.status(416);
                res.setHeader('Content-Range', `bytes */${stat.size}`);
                return res.end();
            }
            // Clamp end to file size
            end = Math.min(end, stat.size - 1);
            res.status(206);
            res.setHeader('Content-Range', `bytes ${start}-${end}/${stat.size}`);
            res.setHeader('Content-Length', String(end - start + 1));
            appendVary(res, 'Range');
            const stream = fs.createReadStream(full, { start, end });
            const isFull = (start === 0 && end === stat.size - 1);
            const ender = () => { try {
                stream.destroy();
            }
            catch { } };
            res.on('close', ender);
            res.on('aborted', ender);
            stream.pipe(res);
            // Finalize job only if complete file was delivered (0..size-1)
            stream.on('close', () => {
                if (isFull) {
                    try {
                        fs.unlinkSync(full);
                    }
                    catch { }
                    finalizeJob(id, 'completed', { job, keepJob: false, keepFiles: false });
                }
            });
            return;
        }
        res.setHeader('Content-Length', String(stat.size));
        appendVary(res, 'Range'); // Prevent CDN from caching 200 and returning it for Range requests
        if (req.method === 'HEAD')
            return res.end();
        const stream = fs.createReadStream(full);
        const ender = () => { try {
            stream.destroy();
        }
        catch { } };
        res.on('close', ender);
        res.on('aborted', ender);
        stream.pipe(res);
        stream.on('close', () => {
            try {
                fs.unlink(full, () => { });
            }
            catch { }
            finalizeJob(id, 'completed', { job, keepJob: false, keepFiles: false });
        });
    }
    catch (err) {
        log.error('job_file_failed', err?.message || err);
        res.status(500).json({ error: 'job_file_failed' });
    }
});
// ========================
// Subtitles download (+offset convert via ffmpeg)
// NOTE: This endpoint requires FFmpeg and is deprecated in FFmpeg-free mode
// ========================
app.get('/api/subtitles/download', requireAuth, async (req, res) => {
    // FFmpeg-free mode: subtitles feature disabled
    if (!ffmpegEnabled()) {
        return res.status(501).json({
            error: 'feature_disabled',
            message: 'Subtitle extraction requires FFmpeg which is disabled in this deployment'
        });
    }
    try {
        const src = String(req.query.url || '');
        const title = String(req.query.title || 'subtitles');
        const outFmt = String(req.query.format || 'vtt').toLowerCase(); // 'vtt' | 'srt'
        const offsetSec = Number(req.query.offset || 0) || 0;
        if (!src || !/^https?:\/\//i.test(src))
            return res.status(400).json({ error: 'invalid_src' });
        await assertPublicHttpHost(src);
        const policy = policyFor(req.user?.plan);
        if (!policy.allowSubtitles)
            return res.status(403).json({ error: 'SUBTITLES_NOT_ALLOWED' });
        const tmp = fs.realpathSync(os.tmpdir());
        const id = randomUUID();
        const outExt = outFmt === 'srt' ? 'srt' : 'vtt';
        const outPath = path.join(tmp, `${id}.${outExt}`);
        if (offsetSec === 0 && /\.vtt($|\?|#)/i.test(src) && outExt === 'vtt') {
            const upstream = await fetch(src, { headers: { 'user-agent': 'Mozilla/5.0' } });
            if (!upstream.ok || !upstream.body)
                return res.status(502).json({ error: 'upstream_failed', status: upstream.status });
            res.setHeader('Content-Type', 'text/vtt; charset=utf-8');
            const safe = safeName(title || 'subtitles');
            res.setHeader('Content-Disposition', `attachment; filename="${safe}.vtt"`);
            return Readable.fromWeb(upstream.body).pipe(res);
        }
        // FFmpeg subtitle conversion not implemented in FFmpeg-free mode
        // If we reach here, it means the request requires FFmpeg processing
        return res.status(501).json({ error: 'ffmpeg_not_available' });
    }
    catch (err) {
        log.error('subtitles_download_failed', err?.message || err);
        res.status(500).json({ error: 'subtitles_failed' });
    }
});
// ========================
// Cleanup & metrics
// ========================
app.post('/api/jobs/cleanup-temp', requireAuth, (_req, res) => {
    let removed = 0;
    for (const job of jobs.values()) {
        try {
            const before = fs.readdirSync(job.tmpDir).filter(f => f.startsWith(job.tmpId + '.')).length;
            cleanupJobFiles(job);
            const after = fs.readdirSync(job.tmpDir).filter(f => f.startsWith(job.tmpId + '.')).length;
            removed += Math.max(0, before - after);
        }
        catch { }
    }
    res.json({ ok: true, removed });
});
app.get('/api/metrics', requireAuth, (_req, res) => {
    const listeners = Array.from(sseListeners.values()).reduce((a, s) => a + s.size, 0);
    res.json({ running: running.size, queued: waiting.length, listeners });
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
                if (!job.produced)
                    continue;
                const full = path.join(job.tmpDir, job.produced);
                if (fs.existsSync(full)) {
                    const stat = fs.statSync(full);
                    const age = now - stat.mtimeMs;
                    if (age > REAPER_MS) {
                        try {
                            fs.unlinkSync(full);
                            metrics.reaper.filesReaped += 1;
                        }
                        catch (err) {
                            // Could be race with finalize - file already deleted
                            reaperRaces++;
                            log.debug('reaper_file_race', { jobId: job.id, file: job.produced });
                        }
                        try {
                            jobs.delete(job.id);
                            metrics.reaper.jobsDeleted += 1;
                        }
                        catch { }
                    }
                }
                else {
                    try {
                        jobs.delete(job.id);
                        metrics.reaper.jobsDeleted += 1;
                    }
                    catch { }
                }
            }
            // Clean up finished batches older than TTL (prevents memory leak)
            let batchesReaped = 0;
            for (const [id, batch] of batches) {
                if (batch.finishedAt && (now - batch.finishedAt) > BATCH_TTL_MS) {
                    try {
                        batches.delete(id);
                        batchesReaped++;
                        log.debug('batch_reaped', { id, age: Math.floor((now - batch.finishedAt) / 60000) + 'min' });
                    }
                    catch { }
                }
            }
            if (reaperRaces > 0) {
                metrics.reaper.reaperFinalizeRace += reaperRaces;
                log.debug('reaper_races_detected', { count: reaperRaces });
            }
            if (batchesReaped > 0) {
                log.info('reaper_batches_cleaned', { count: batchesReaped });
            }
        }
        catch (err) {
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
function startServerWithRetry(port, maxAttempts = 40) {
    let attempts = 0;
    return new Promise((resolve, reject) => {
        const tryListen = () => {
            attempts += 1;
            const server = app.listen(port);
            server.keepAliveTimeout = 120000;
            server.headersTimeout = 125000;
            server.requestTimeout = 0;
            const onError = (err) => {
                server.off('listening', onListening);
                if (err && err.code === 'EADDRINUSE') {
                    try {
                        server.close(() => { });
                    }
                    catch { }
                    if (attempts >= maxAttempts) {
                        const message = `Port ${port} busy after ${maxAttempts} attempts`;
                        try {
                            log.error('port_in_use_exhausted', message);
                        }
                        catch { }
                        return reject(new Error(message));
                    }
                    const delay = Math.min(1500, 150 * attempts);
                    try {
                        log.warn('port_in_use_retry', `Port ${port} busy, retrying in ${delay}ms (attempt ${attempts}/${maxAttempts})...`);
                    }
                    catch { }
                    setTimeout(tryListen, delay);
                    return;
                }
                try {
                    log.error('server_error', err?.message || String(err));
                }
                catch { }
                reject(err);
            };
            const onListening = () => {
                server.off('error', onError);
                try {
                    writeServerSettings({ lastPort: port });
                }
                catch { }
                const corsValue = process.env.CORS_ORIGIN || 'ALL (no restrictions)';
                try {
                    log.info(`yt-dlp server listening on http://localhost:${port}`);
                }
                catch { }
                try {
                    log.info(`CORS allowed origins: ${corsValue}`);
                }
                catch { }
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
async function gracefulShutdown(signal) {
    try {
        log.info(`shutdown_${signal.toLowerCase()}`, 'Shutting down, canceling jobs...');
        while (waiting.length) {
            const next = waiting.shift();
            const id = next.job.id;
            try {
                cleanupJobFiles(next.job);
            }
            catch { }
            try {
                jobs.delete(id);
            }
            catch { }
        }
        for (const id of Array.from(running)) {
            const job = jobs.get(id);
            try {
                job?.child?.kill('SIGTERM');
            }
            catch { }
            try {
                if (job)
                    cleanupJobFiles(job);
            }
            catch { }
            try {
                jobs.delete(id);
            }
            catch { }
        }
    }
    catch { }
    setTimeout(() => process.exit(0), 300);
}
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('uncaughtException', (err) => {
    const msg = String(err?.message || err || '').toLowerCase();
    if (/aborted|socket hang up|econnreset|stream prematurely closed/.test(msg))
        return;
    try {
        log.error('uncaught_exception', err?.stack || String(err));
    }
    catch { }
});
process.on('unhandledRejection', (reason) => {
    const msg = String(reason?.message || reason || '').toLowerCase();
    if (/aborted|socket hang up|econnreset|stream prematurely closed/.test(msg))
        return;
    try {
        log.error('unhandled_rejection', reason?.stack || String(reason));
    }
    catch { }
});
