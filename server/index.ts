import express, { type Response, type NextFunction } from 'express';
import rateLimit from 'express-rate-limit';
import cors from 'cors';
import ytdlp from 'youtube-dl-exec';
import path from 'node:path';
import { Readable } from 'node:stream';
import { getLogger } from './core/logger.js';
import { loadConfig } from './core/config.js';
import { isUrlAllowed } from './core/urlAllow.js';
import { buildCorsOrigin } from './core/corsOrigin.js';
import { appendHistory, readHistory, updateHistory, removeHistory, clearHistory } from './core/history.js';
import os from 'node:os';
import fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import type { ChildProcess } from 'node:child_process';
import { spawnSync } from 'node:child_process';
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

// Attempt to load ffmpeg-static optionally (server should still run without it if system ffmpeg is present)
let ffmpegBinary: string | undefined;
try {
  const mod = await import('ffmpeg-static');
  ffmpegBinary = (mod as any)?.default || (mod as any);
} catch {}

const log = getLogger('server');
const cfg = loadConfig();
const proxyDownload = createProxyDownloadHandler(cfg);

const app = express();
app.set('trust proxy', 1);
applySecurity(app, process.env.CORS_ORIGIN);
const limiter = rateLimit({ windowMs: 60_000, max: 120 });
app.use(limiter);
app.use(cors({ origin: buildCorsOrigin(process.env.CORS_ORIGIN), exposedHeaders: ['Content-Disposition', 'Content-Length', 'Content-Type'] }));
// Minimal param sanitizer to avoid HTTP Parameter Pollution issues
app.use((req, _res, next) => {
  try {
    for (const k of Object.keys(req.query)) {
      const v: any = (req.query as any)[k];
      if (Array.isArray(v)) (req.query as any)[k] = v[0];
    }
  } catch {}
  next();
});
app.use((req, res, next) => {
  const len = Number(req.headers['content-length'] || 0);
  if (len > 2_000_000) return res.status(413).end();
  next();
});
app.use(express.json({ limit: '200kb' }));
app.use(requestLogger);

// --- Global job settings/state (moved up to avoid TS2448) ---
type Job = {
  id: string;
  type: 'video' | 'audio';
  child?: ChildProcess & { killed?: boolean };
  tmpId: string;
  tmpDir: string;
  // resolved produced filename (basename in tmpDir), set when finished
  produced?: string;
  // auth & policy
  userId?: string;
  concurrencyCap?: number;
};
const jobs = new Map<string, Job>();
type WaitingItem = { job: Job; run: () => void };
const waiting: WaitingItem[] = [];
const running = new Set<string>();
let MAX_CONCURRENT = 2;
let PROXY_URL: string | undefined;
let LIMIT_RATE: number | undefined; // in KiB/s
// Load persisted setting if present
try {
  const saved = readServerSettings();
  if (saved.maxConcurrent && Number.isFinite(saved.maxConcurrent)) {
    MAX_CONCURRENT = Math.max(1, Math.min(6, Math.floor(saved.maxConcurrent)));
  }
  if (saved.proxyUrl) PROXY_URL = saved.proxyUrl;
  if (saved.limitRateKbps && Number.isFinite(saved.limitRateKbps)) LIMIT_RATE = Math.max(0, Math.floor(saved.limitRateKbps));
} catch {}

// ytdlp is a function that runs the yt-dlp binary; the package manages the binary on Windows.
// Note: Do not enable compression() globally for streaming routes that proxy or pipe binary content.

// Simple network tuning; disabled aria2c to avoid env-specific issues (can be re-enabled later)
function speedyDlArgs() {
  const base: any = {
    concurrentFragments: 10,
    httpChunkSize: '10M',
    socketTimeout: 20,
    retries: 10,
    fragmentRetries: 10,
  };
  return base;
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

app.get('/health', (_req, res) => res.json({ ok: true }));
app.get('/ready', (_req, res) => res.json({ ok: true }));

// Auth and identity routes
mountAuthRoutes(app);
app.post('/auth/activate', authActivate);

// Basic server/version info for UI diagnostics
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
    let ffmpegVersion = '';
    try {
      const out = spawnSync('ffmpeg', ['-version'], { encoding: 'utf8' });
      if (out?.status === 0) ffmpegVersion = String(out.stdout || '').split(/\r?\n/, 1)[0];
    } catch {}
    const info = {
      name: pkg?.name || 'yt-dlp-server',
      version: pkg?.version || '0.0.0',
      node: process.version,
      platform: `${process.platform} ${process.arch}`,
      ytDlp: ytVersion || 'unknown',
      ffmpeg: ffmpegBinary || 'system/unknown',
      ffmpegVersion: ffmpegVersion || '',
      checks: {
        ytdlpAvailable: Boolean(ytVersion),
        ffmpegAvailable: Boolean(ffmpegVersion || ffmpegBinary),
      },
      port: cfg.port,
      settings: {
        maxConcurrent: MAX_CONCURRENT,
        proxyUrl: PROXY_URL || '',
        limitRateKbps: LIMIT_RATE || 0,
      },
    };
    res.json(info);
  } catch (err: any) {
    res.status(500).json({ error: 'version_failed', details: String(err?.message || err) });
  }
});

// Tail server logs for quick diagnostics (dev-only style, bounded)
app.get('/api/logs/tail', (req, res) => {
  try {
    const max = Math.max(1, Math.min(500, parseInt(String(req.query.lines || '200'), 10) || 200));
    const logDir = path.resolve(process.cwd(), 'logs');
    const logFile = path.join(logDir, 'app.log');
    if (!fs.existsSync(logFile)) return res.json({ lines: [] });
    const buf = fs.readFileSync(logFile, 'utf8');
    const lines = buf.split(/\r?\n/);
    const tail = lines.slice(-max);
    res.json({ lines: tail });
  } catch (err: any) {
    res.status(500).json({ error: 'tail_failed', details: String(err?.message || err) });
  }
});

// History endpoints
app.get('/api/history', requireAuth as any, (_req, res) => {
  res.json({ items: readHistory() });
});
app.delete('/api/history/:id', requireAuth as any, (req, res) => {
  try {
    const id = req.params.id;
    // If a job exists for this history id, ensure it's canceled and cleaned
    try {
      const job = jobs.get(id);
      if (job) {
        const idx = waiting.findIndex((w) => w.job.id === id);
        if (idx >= 0) waiting.splice(idx, 1);
        try { job.child?.kill('SIGTERM'); } catch {}
        // best-effort cleanup
        cleanupJobFiles(job);
        jobs.delete(id);
      }
    } catch {}
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

// In-memory SSE listeners per history id
const sseListeners = new Map<string, Set<Response>>();
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
function emitProgress(id: string, data: any) {
  const set = sseListeners.get(id);
  if (!set || set.size === 0) return;
  const payload = `data: ${JSON.stringify({ id, ...data })}\n\n`;
  for (const res of set) {
    try { res.write(payload); } catch {}
  }
}

// Parse common yt-dlp progress lines to extract percent, speed and ETA
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

// Simple in-memory job registry and queue for cancellable downloads

function schedule() {
  // helper: count running jobs for a given user
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
    // find the first job whose user's concurrent cap isn't exceeded
    const idx = waiting.findIndex(({ job }) => {
      const cap = Math.max(1, Number(job.concurrencyCap || 1));
      return runningCountFor(job.userId) < cap;
    });
    if (idx < 0) break; // no eligible jobs currently
    const next = waiting.splice(idx, 1)[0]!;
    running.add(next.job.id);
    // mark as in-progress
    updateHistory(next.job.id, { status: 'in-progress' });
    emitProgress(next.job.id, { progress: 0, stage: 'starting' });
    try { next.run(); } catch {
      running.delete(next.job.id);
      updateHistory(next.job.id, { status: 'failed' });
      emitProgress(next.job.id, { stage: 'failed' });
    }
  }
}
// Throttle helpers for history progress to avoid excessive disk writes
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
    if (should) updateHistory(id, { ...(typeof pct === 'number' ? { progress: pct } : {}), ...(extra || {}) });
  } catch {}
}
function clearHistoryThrottle(id: string) { lastPctWritten.delete(id); }


// Remove temporary files produced/created by a job (best-effort)
function cleanupJobFiles(job: Job) {
  try {
    const { tmpDir, tmpId } = job;
    const list = fs.readdirSync(tmpDir);
    for (const f of list) {
      if (f.startsWith(tmpId + '.')) {
        const full = path.join(tmpDir, f);
        try { fs.unlinkSync(full); } catch {}
      }
    }
  } catch {}
}

// Jobs metrics for UI
app.get('/api/jobs/metrics', requireAuth as any, (_req, res) => {
  res.json({ running: running.size, queued: waiting.length, maxConcurrent: MAX_CONCURRENT });
});

// Read/update job settings (currently only max concurrency)
app.get('/api/jobs/settings', requireAuth as any, (_req, res) => {
  res.json({ maxConcurrent: MAX_CONCURRENT, proxyUrl: PROXY_URL || '', limitRateKbps: LIMIT_RATE ?? 0 });
});
app.post('/api/jobs/settings', requireAuth as any, (req, res) => {
  try {
    const { maxConcurrent, proxyUrl, limitRateKbps } = (req.body || {}) as { maxConcurrent?: number; proxyUrl?: string; limitRateKbps?: number };
    const n = Number(maxConcurrent);
    if (!Number.isFinite(n)) return res.status(400).json({ error: 'invalid_number' });
    const clamped = Math.max(1, Math.min(6, Math.floor(n)));
    MAX_CONCURRENT = clamped;
    // proxy
    if (typeof proxyUrl === 'string') PROXY_URL = proxyUrl.trim() || undefined;
    // limit rate
    const lr = Number(limitRateKbps);
    if (Number.isFinite(lr) && lr >= 0) LIMIT_RATE = Math.floor(lr);
    // persist
    writeServerSettings({ maxConcurrent: clamped, proxyUrl: PROXY_URL, limitRateKbps: LIMIT_RATE });
    // kick the scheduler in case we can start more jobs now
    schedule();
    res.json({ ok: true, maxConcurrent: MAX_CONCURRENT, proxyUrl: PROXY_URL || '', limitRateKbps: LIMIT_RATE ?? 0 });
  } catch {
    res.status(500).json({ error: 'update_failed' });
  }
});
// Reset job settings to defaults
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
// Progress SSE endpoint (subscribe per history id)
app.get('/api/progress/:id', requireAuth as any, (req, res) => {
  const id = req.params.id;
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();
  addSseListener(id, res);
  // Send initial ping to open stream
  res.write(`event: ping\n` + `data: {"ok":true}\n\n`);
  const hb = setInterval(() => {
    try { res.write(`event: ping\n` + `data: {"ts":${Date.now()}}\n\n`); } catch {}
  }, 15000);
  // Auto-timeout SSE after 10 minutes of being open
  const timeout = setTimeout(() => {
    try { res.write(`event: end\n` + `data: {"status":"timeout"}\n\n`); } catch {}
    clearInterval(hb);
    removeSseListener(id, res);
    try { res.end(); } catch {}
  }, 10 * 60 * 1000);
  req.on('close', () => {
    clearInterval(hb);
    clearTimeout(timeout);
    removeSseListener(id, res);
    try { res.end(); } catch {}
  });
});

app.post('/api/analyze', requireAuth as any, async (req: any, res, next: NextFunction) => {
  try {
  const { url } = AnalyzeBody.parse(req.body);
    if (!isUrlAllowed(url, cfg)) {
      return res.status(400).json({ error: 'Invalid or missing url' });
    }
    await assertPublicHttpHost(url);

  const json = await dumpInfoJson(url!, { args: {
      preferFreeFormats: true,
      addHeader: makeHeaders(url!),
      ...(cfg.maxFileSizeMb ? { maxFilesize: `${cfg.maxFileSizeMb}M` } : {}),
      ...(cfg.maxDurationSec ? { matchFilter: `duration <= ${cfg.maxDurationSec}` } : {}),
    }});

    res.json(json);
  } catch (err: any) {
    const { status, code, message } = normalizeYtError(err);
    log.error('analyze_failed', err?.message || err);
    return next({ status, code, message });
  }
});

// Simple proxy to stream a direct media URL to the browser as an attachment
const proxyLimiter = rateLimit({ windowMs: 60_000, max: (cfg.proxyDownloadMaxPerMin ?? 60) });
app.get('/api/proxy-download', requireAuth as any, proxyLimiter, proxyDownload);

// Resolve a direct URL for a given format ID using yt-dlp (-g)
app.post('/api/get-url', requireAuth as any, async (req, res, next: NextFunction) => {
  try {
    const { url, formatId } = req.body as { url?: string; formatId?: string };
  if (!formatId || !isUrlAllowed(url, cfg)) return res.status(400).json({ error: 'missing_or_invalid_params' });
  await assertPublicHttpHost(url!);
  const output: string = await (ytdlp as any)(url, {
    getUrl: true,
    format: formatId,
    noCheckCertificates: true,
    noWarnings: true,
    addHeader: makeHeaders(url!),
    ...(cfg.maxFileSizeMb ? { maxFilesize: `${cfg.maxFileSizeMb}M` } : {}),
    ...(cfg.maxDurationSec ? { matchFilter: `duration <= ${cfg.maxDurationSec}` } : {}),
  }, { env: cleanedChildEnv(process.env) });
    const lines = String(output).trim().split(/\r?\n/).filter(Boolean);
    res.json({ url: lines[0] || '' });
  } catch (err: any) {
    log.error('get_url_failed', err?.message || err);
    return next({ status: 400, code: 'GET_URL_FAILED', message: String(err?.stderr || err?.message || err) });
  }
});

// Download best video+audio merged as MP4 and stream to client
app.get('/api/download/best', requireAuth as any, async (req: any, res) => {
  const sourceUrl = (req.query.url as string) || '';
  const title = (req.query.title as string) || 'video';
  if (!isUrlAllowed(sourceUrl, cfg)) return res.status(400).json({ error: 'invalid_url' });
  try { await assertPublicHttpHost(sourceUrl); } catch (e: any) { return res.status(400).json({ ok: false, error: { code: e?.code || 'SSRF_FORBIDDEN', message: e?.message || 'Forbidden host' } }); }
  // use ytdlp.raw to get progress
  const tmp = fs.realpathSync(os.tmpdir());
  const id = randomUUID();
  const outPath = path.join(tmp, `${id}.%(ext)s`);
  let histId: string | undefined;
  try {
    const policy = policyFor(req.user?.plan);
    log.info('download_best_start', sourceUrl);
    const hist = appendHistory({
      title,
      url: sourceUrl,
      type: 'video',
      format: 'MP4',
      status: 'in-progress',
    });
    histId = hist.id;
    // notify client that job created
    emitProgress(hist.id, { progress: 0, stage: 'starting' });
    // Use raw() to stream progress lines from stdout
  const child = (ytdlp as any).exec(sourceUrl, {
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
      // Apply the stricter of global limit and policy limit (0/undefined = unlimited)
      limitRate: (() => {
        const gl = Number(LIMIT_RATE || 0);
        const pl = Number(policy.speedLimitKbps || 0);
        const chosen = (gl > 0 && pl > 0) ? Math.min(gl, pl) : (gl > 0 ? gl : (pl > 0 ? pl : 0));
        return chosen > 0 ? `${chosen}K` : undefined;
      })(),
  ...(cfg.maxFileSizeMb ? { maxFilesize: `${cfg.maxFileSizeMb}M` } : {}),
  ...(cfg.maxDurationSec ? { matchFilter: `duration <= ${cfg.maxDurationSec}` } : {}),
      ...speedyDlArgs(),
  }, { env: cleanedChildEnv(process.env) });
    // abort child if client disconnects
    let aborted = false;
    const abort = () => {
      if (aborted) return;
      aborted = true;
      try { child.kill('SIGTERM'); } catch {}
    };
    res.on('close', abort);
    res.on('aborted', abort);
    // Parse progress lines to extract percentage and speed/eta when available
  const onProgress = (buf: Buffer) => {
      const text = buf.toString();
      // Example lines: "[download]  12.3% of ... at 3.44MiB/s ETA 00:42"
      const m = text.match(/(\d{1,3}(?:\.\d+)?)%/);
      if (m) {
        const pct = Math.max(0, Math.min(100, parseFloat(m[1])));
        updateHistoryThrottled(hist.id, pct);
        emitProgress(hist.id, { progress: pct, stage: 'downloading' });
      }
      if (/Merging formats|merging/i.test(text)) {
        updateHistoryThrottled(hist.id, 95);
        emitProgress(hist.id, { progress: 95, stage: 'merging' });
      }
    };
    child.stdout?.on('data', onProgress);
    child.stderr?.on('data', onProgress);
    await new Promise<void>((resolve, reject) => {
      child.on('error', reject);
      child.on('close', (code: number) => {
        if (code === 0) resolve();
        else reject(new Error(`yt-dlp exited with code ${code}`));
      });
    });
  // Find the produced file (mp4/mkv/webm)
    const dir = fs.readdirSync(tmp);
    const produced = dir.find((f) => f.startsWith(id + '.') && (f.endsWith('.mp4') || f.endsWith('.mkv') || f.endsWith('.webm')));
    if (!produced) return res.status(500).json({ error: 'output_not_found' });
  const full = path.join(tmp, produced);
    const stat = fs.statSync(full);
  const ext = path.extname(produced).toLowerCase();
  const videoType = ext === '.mkv' ? 'video/x-matroska' : ext === '.webm' ? 'video/webm' : 'video/mp4';
  res.setHeader('Content-Type', videoType);
  const safe = (title || 'video').replace(/[^\w.-]+/g, '_');
  res.setHeader('Content-Disposition', `attachment; filename="${safe}${ext}"`);
    res.setHeader('Content-Length', String(stat.size));
  if (req.method === 'HEAD') { return res.end(); }
  const stream = fs.createReadStream(full);
    stream.pipe(res);
    stream.on('close', () => {
      fs.unlink(full, () => {});
    });
  updateHistory(hist.id, { status: 'completed', progress: 100, size: `${Math.round(stat.size / 1024 / 1024)} MB` });
  clearHistoryThrottle(hist.id);
  emitProgress(hist.id, { progress: 100, stage: 'completed', size: stat.size });
  // send final end event
  const listeners = (sseListeners.get(hist.id) || new Set());
  for (const r of listeners) {
    try { r.write(`event: end\n` + `data: ${JSON.stringify({ id: hist.id, status: 'completed' })}\n\n`); } catch {}
  }
  try { sseListeners.delete(hist.id); } catch {}
  } catch (err: any) {
    log.error('download_best_failed', err?.message || err);
  // Best-effort: mark last in-progress as failed (optional)
    if (histId) {
  updateHistory(histId, { status: 'failed' });
  clearHistoryThrottle(histId);
      try {
        emitProgress(histId, { stage: 'failed' });
        const listeners = (sseListeners.get(histId) || new Set());
        for (const r of listeners) {
          try { r.write(`event: end\n` + `data: ${JSON.stringify({ id: histId, status: 'failed' })}\n\n`); } catch {}
        }
        try { sseListeners.delete(histId); } catch {}
      } catch {}
    }
    res.status(500).json({ error: 'download_failed', details: String(err?.stderr || err?.message || err) });
  }
});

// Stream a single chapter clip [start,end) seconds as MP4
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
  const child = (ytdlp as any).exec(sourceUrl, {
      format: `bv*[height<=?${policy.maxHeight}]+ba/b[height<=?${policy.maxHeight}]`,
      mergeOutputFormat: 'mp4',
      output: outPath,
      addHeader: makeHeaders(sourceUrl),
      noCheckCertificates: true,
      noWarnings: true,
      ffmpegLocation: ffmpegBinary || undefined,
      // Download only requested section
      downloadSections: section,
      // performance knobs
      ...speedyDlArgs(),
      ...(cfg.maxFileSizeMb ? { maxFilesize: `${cfg.maxFileSizeMb}M` } : {}),
      ...(cfg.maxDurationSec ? { matchFilter: `duration <= ${cfg.maxDurationSec}` } : {}),
  }, { env: cleanedChildEnv(process.env) });
    await new Promise<void>((resolve, reject) => {
      child.on('error', reject);
      child.on('close', (code: number) => (code === 0 ? resolve() : reject(new Error(`yt-dlp exit ${code}`))));
    });
    const dir = fs.readdirSync(tmp);
    const produced = dir.find((f) => f.startsWith(id + '.') && (f.endsWith('.mp4') || f.endsWith('.mkv') || f.endsWith('.webm')));
    if (!produced) return res.status(500).json({ error: 'output_not_found' });
    const full = path.join(tmp, produced);
    const stat = fs.statSync(full);
    res.setHeader('Content-Type', /\.mkv$/i.test(full) ? 'video/x-matroska' : /\.webm$/i.test(full) ? 'video/webm' : 'video/mp4');
    const safeBase = (title || 'clip').replace(/[^\w.-]+/g, '_');
    const safeName = (name || 'chapter').replace(/[^\w.-]+/g, '_');
    res.setHeader('Content-Disposition', `attachment; filename="${safeBase}.${index}_${safeName}${path.extname(full)}"`);
    res.setHeader('Content-Length', String(stat.size));
    if (req.method === 'HEAD') { return res.end(); }
    const stream = fs.createReadStream(full);
    stream.pipe(res);
    stream.on('close', () => { try { fs.unlinkSync(full); } catch {} });
  } catch (err: any) {
    log.error('download_chapter_failed', err?.message || err);
    res.status(500).json({ error: 'download_failed' });
  }
});

// Download best audio only (MP3 or M4A) and stream to client
app.get('/api/download/audio', requireAuth as any, async (req: any, res) => {
  const sourceUrl = (req.query.url as string) || '';
  const title = (req.query.title as string) || 'audio';
  const fmt = ((req.query.format as string) || 'm4a').toLowerCase(); // 'mp3' | 'm4a'
  if (!isUrlAllowed(sourceUrl, cfg)) return res.status(400).json({ error: 'invalid_url' });
  try { await assertPublicHttpHost(sourceUrl); } catch (e: any) { return res.status(400).json({ ok: false, error: { code: e?.code || 'SSRF_FORBIDDEN', message: e?.message || 'Forbidden host' } }); }
  // use ytdlp.raw to get progress
  const tmp = fs.realpathSync(os.tmpdir());
  const id = randomUUID();
  const outPath = path.join(tmp, `${id}.%(ext)s`);
  let histId: string | undefined;
  try {
  const policy = policyFor(req.user?.plan);
    log.info('download_audio_start', sourceUrl);
    const hist = appendHistory({
      title,
      url: sourceUrl,
      type: 'audio',
      format: fmt.toUpperCase(),
      status: 'in-progress',
    });
    histId = hist.id;
    emitProgress(hist.id, { progress: 0, stage: 'starting' });
  const child = (ytdlp as any).exec(sourceUrl, {
      extractAudio: true,
      audioFormat: fmt, // mp3 or m4a
      output: outPath,
      addHeader: makeHeaders(sourceUrl),
      restrictFilenames: true,
      noCheckCertificates: true,
      noWarnings: true,
      newline: true,
      ffmpegLocation: ffmpegBinary || undefined,
      proxy: PROXY_URL,
      limitRate: (() => {
        const gl = Number(LIMIT_RATE || 0);
        const pl = Number(policy.speedLimitKbps || 0);
        const chosen = (gl > 0 && pl > 0) ? Math.min(gl, pl) : (gl > 0 ? gl : (pl > 0 ? pl : 0));
        return chosen > 0 ? `${chosen}K` : undefined;
      })(),
  ...(cfg.maxFileSizeMb ? { maxFilesize: `${cfg.maxFileSizeMb}M` } : {}),
  ...(cfg.maxDurationSec ? { matchFilter: `duration <= ${cfg.maxDurationSec}` } : {}),
  }, { env: cleanedChildEnv(process.env) });
    // abort child if client disconnects
    let aborted = false;
    const abort = () => {
      if (aborted) return;
      aborted = true;
      try { child.kill('SIGTERM'); } catch {}
    };
    res.on('close', abort);
    res.on('aborted', abort);
    const onProgress = (buf: Buffer) => {
      const text = buf.toString();
      const m = text.match(/(\d{1,3}(?:\.\d+)?)%/);
      if (m) {
        const pct = Math.max(0, Math.min(100, parseFloat(m[1])));
        updateHistoryThrottled(hist.id, pct);
        emitProgress(hist.id, { progress: pct, stage: 'downloading' });
      }
      if (/ExtractAudio|Destination|\bconvert\b|merging/i.test(text)) {
        updateHistoryThrottled(hist.id, 90);
        emitProgress(hist.id, { progress: 90, stage: 'converting' });
      }
    };
    child.stdout?.on('data', onProgress);
    child.stderr?.on('data', onProgress);
    await new Promise<void>((resolve, reject) => {
      child.on('error', reject);
      child.on('close', (code: number) => {
        if (code === 0) resolve();
        else reject(new Error(`yt-dlp exited with code ${code}`));
      });
    });
    const dir = fs.readdirSync(tmp);
    const produced = dir.find((f) => f.startsWith(id + '.') && (f.endsWith('.mp3') || f.endsWith('.m4a') || f.endsWith('.aac') || f.endsWith('.opus')));
    if (!produced) return res.status(500).json({ error: 'output_not_found' });
  const full = path.join(tmp, produced);
    const stat = fs.statSync(full);
    const isMp3 = /\.mp3$/i.test(produced);
  res.setHeader('Content-Type', isMp3 ? 'audio/mpeg' : 'audio/mp4');
  const safe = (title || 'audio').replace(/[^\w.-]+/g, '_');
    const ext = isMp3 ? 'mp3' : 'm4a';
    res.setHeader('Content-Disposition', `attachment; filename="${safe}.${ext}"`);
    res.setHeader('Content-Length', String(stat.size));
    if (req.method === 'HEAD') { return res.end(); }
    const stream = fs.createReadStream(full);
    stream.pipe(res);
    stream.on('close', () => {
      fs.unlink(full, () => {});
    });
  updateHistory(hist.id, { status: 'completed', progress: 100, size: `${Math.round(stat.size / 1024 / 1024)} MB` });
  clearHistoryThrottle(hist.id);
    emitProgress(hist.id, { progress: 100, stage: 'completed', size: stat.size });
    const listeners = (sseListeners.get(hist.id) || new Set());
    for (const r of listeners) {
      try { r.write(`event: end\n` + `data: ${JSON.stringify({ id: hist.id, status: 'completed' })}\n\n`); } catch {}
    }
    try { sseListeners.delete(hist.id); } catch {}
  } catch (err: any) {
    log.error('download_audio_failed', err?.message || err);
    if (histId) {
  updateHistory(histId, { status: 'failed' });
  clearHistoryThrottle(histId);
      try {
        emitProgress(histId, { stage: 'failed' });
        const listeners = (sseListeners.get(histId) || new Set());
        for (const r of listeners) {
          try { r.write(`event: end\n` + `data: ${JSON.stringify({ id: histId, status: 'failed' })}\n\n`); } catch {}
        }
        try { sseListeners.delete(histId); } catch {}
      } catch {}
    }
    res.status(500).json({ error: 'download_failed', details: String(err?.stderr || err?.message || err) });
  }
});

// Start a background job to download best video+audio merged as MP4.
app.post('/api/job/start/best', requireAuth as any, async (req: any, res: Response) => {
  try {
    const { url: sourceUrl, title = 'video' } = (req.body || {}) as { url?: string; title?: string };
  if (!sourceUrl || !/^https?:\/\//i.test(sourceUrl)) return res.status(400).json({ error: 'invalid_url' });
  await assertPublicHttpHost(sourceUrl);
  // use ytdlp.raw to get progress
    const tmpDir = os.tmpdir();
    const tmpId = randomUUID();
  const outPath = path.join(fs.realpathSync(tmpDir), `${tmpId}.%(ext)s`);
    const hist = appendHistory({
      title,
      url: sourceUrl,
      type: 'video',
      format: 'MP4',
      status: 'queued',
    });
  const job: Job = { id: hist.id, type: 'video', tmpId, tmpDir, userId: (req.user?.id || 'anon'), concurrencyCap: policyFor(req.user?.plan).concurrentJobs };
    jobs.set(hist.id, job);
    emitProgress(hist.id, { progress: 0, stage: 'queued' });
    const run = () => {
      log.info('job_spawn_best', `url=${sourceUrl}`);
  const policy = policyFor(req.user?.plan);
  const child = (ytdlp as any).exec(sourceUrl, {
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
  limitRate: (() => {
    const gl = Number(LIMIT_RATE || 0);
    const pl = Number(policy.speedLimitKbps || 0);
    const chosen = (gl > 0 && pl > 0) ? Math.min(gl, pl) : (gl > 0 ? gl : (pl > 0 ? pl : 0));
    return chosen > 0 ? `${chosen}K` : undefined;
  })(),
  ...(cfg.maxFileSizeMb ? { maxFilesize: `${cfg.maxFileSizeMb}M` } : {}),
  ...(cfg.maxDurationSec ? { matchFilter: `duration <= ${cfg.maxDurationSec}` } : {}),
  ...ytDlpArgsFromPolicy(policy),
  ...speedyDlArgs(),
  }, { env: cleanedChildEnv(process.env) });
      job.child = child as any;
      const onProgress = (buf: Buffer) => {
        const text = buf.toString();
        const { pct, speed, eta } = parseDlLine(text);
        if (typeof pct === 'number') {
          updateHistoryThrottled(hist.id, pct);
          emitProgress(hist.id, { progress: pct, stage: 'downloading', speed, eta });
        }
        if (/Merging formats|merging/i.test(text)) emitProgress(hist.id, { progress: 95, stage: 'merging', speed, eta });
      };
      child.stdout?.on('data', onProgress);
      child.stderr?.on('data', onProgress);
      child.on('error', (err: any) => {
        try { log.error('yt_dlp_error_best', err?.message || String(err)); } catch {}
      });
      child.on('close', (code: number) => {
        try { log.info('yt_dlp_close_best', `code=${code}`); } catch {}
        running.delete(hist.id);
        try {
          // If canceled, don't override status
          const cur = readHistory().find((x) => x.id === hist.id);
          if (cur?.status === 'canceled') { schedule(); return; }
          if (code === 0) {
            const dir = fs.readdirSync(tmpDir);
            const produced = dir.find((f) => f.startsWith(tmpId + '.') && (f.endsWith('.mp4') || f.endsWith('.mkv') || f.endsWith('.webm')));
            if (produced) {
              job.produced = produced;
              const full = path.join(tmpDir, produced);
              const stat = fs.statSync(full);
              updateHistory(hist.id, { status: 'completed', progress: 100, size: `${Math.round(stat.size / 1024 / 1024)} MB` });
              clearHistoryThrottle(hist.id);
              emitProgress(hist.id, { progress: 100, stage: 'completed', size: stat.size });
              const listeners = (sseListeners.get(hist.id) || new Set());
              for (const r of listeners) {
                try { r.write(`event: end\n` + `data: ${JSON.stringify({ id: hist.id, status: 'completed' })}\n\n`); } catch {}
              }
              try { sseListeners.delete(hist.id); } catch {}
            } else {
              updateHistory(hist.id, { status: 'failed' });
              clearHistoryThrottle(hist.id);
            }
          } else {
            updateHistory(hist.id, { status: 'failed' });
            clearHistoryThrottle(hist.id);
          }
        } catch {}
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

// Start a background job to extract best audio to chosen format.
app.post('/api/job/start/audio', requireAuth as any, async (req: any, res: Response) => {
  try {
    const { url: sourceUrl, title = 'audio', format = 'm4a' } = (req.body || {}) as { url?: string; title?: string; format?: string };
  if (!sourceUrl || !/^https?:\/\//i.test(sourceUrl)) return res.status(400).json({ error: 'invalid_url' });
  await assertPublicHttpHost(sourceUrl);
  // use ytdlp.raw to get progress
    const tmpDir = os.tmpdir();
    const tmpId = randomUUID();
  const outPath = path.join(fs.realpathSync(tmpDir), `${tmpId}.%(ext)s`);
    const hist = appendHistory({
      title,
      url: sourceUrl,
      type: 'audio',
      format: String(format).toUpperCase(),
      status: 'queued',
    });
  const job: Job = { id: hist.id, type: 'audio', tmpId, tmpDir, userId: (req.user?.id || 'anon'), concurrencyCap: policyFor(req.user?.plan).concurrentJobs };
    jobs.set(hist.id, job);
    emitProgress(hist.id, { progress: 0, stage: 'queued' });
    const run = () => {
      log.info('job_spawn_audio', `url=${sourceUrl} fmt=${String(format).toLowerCase()}`);
  const policy2 = policyFor(req.user?.plan);
  const child = (ytdlp as any).exec(sourceUrl, {
        extractAudio: true,
        audioFormat: String(format).toLowerCase(),
        output: outPath,
        addHeader: makeHeaders(sourceUrl),
        restrictFilenames: true,
        noCheckCertificates: true,
        noWarnings: true,
        newline: true,
  ffmpegLocation: ffmpegBinary || undefined,
  proxy: PROXY_URL,
  limitRate: (() => {
    const gl = Number(LIMIT_RATE || 0);
    const pl = Number(policy2.speedLimitKbps || 0);
    const chosen = (gl > 0 && pl > 0) ? Math.min(gl, pl) : (gl > 0 ? gl : (pl > 0 ? pl : 0));
    return chosen > 0 ? `${chosen}K` : undefined;
  })(),
  ...(cfg.maxFileSizeMb ? { maxFilesize: `${cfg.maxFileSizeMb}M` } : {}),
  ...(cfg.maxDurationSec ? { matchFilter: `duration <= ${cfg.maxDurationSec}` } : {}),
  ...ytDlpArgsFromPolicy(policy2),
  ...speedyDlArgs(),
  }, { env: cleanedChildEnv(process.env) });
      job.child = child as any;
      const onProgress = (buf: Buffer) => {
        const text = buf.toString();
        const { pct, speed, eta } = parseDlLine(text);
        if (typeof pct === 'number') {
          updateHistoryThrottled(hist.id, pct);
          emitProgress(hist.id, { progress: pct, stage: 'downloading', speed, eta });
        }
        if (/ExtractAudio|Destination|\bconvert\b|merging/i.test(text)) emitProgress(hist.id, { progress: 90, stage: 'converting', speed, eta });
      };
      child.stdout?.on('data', onProgress);
      child.stderr?.on('data', onProgress);
      child.on('error', (err: any) => {
        try { log.error('yt_dlp_error_audio', err?.message || String(err)); } catch {}
      });
      child.on('close', (code: number) => {
        try { log.info('yt_dlp_close_audio', `code=${code}`); } catch {}
        running.delete(hist.id);
        try {
          const cur = readHistory().find((x) => x.id === hist.id);
          if (cur?.status === 'canceled') { schedule(); return; }
          if (code === 0) {
            const dir = fs.readdirSync(tmpDir);
            const produced = dir.find((f) => f.startsWith(tmpId + '.') && (f.endsWith('.mp3') || f.endsWith('.m4a') || f.endsWith('.aac') || f.endsWith('.opus')));
            if (produced) {
              job.produced = produced;
              const full = path.join(tmpDir, produced);
              const stat = fs.statSync(full);
              updateHistory(hist.id, { status: 'completed', progress: 100, size: `${Math.round(stat.size / 1024 / 1024)} MB` });
              clearHistoryThrottle(hist.id);
              emitProgress(hist.id, { progress: 100, stage: 'completed', size: stat.size });
              const listeners = (sseListeners.get(hist.id) || new Set());
              for (const r of listeners) {
                try { r.write(`event: end\n` + `data: ${JSON.stringify({ id: hist.id, status: 'completed' })}\n\n`); } catch {}
              }
              try { sseListeners.delete(hist.id); } catch {}
            } else {
              updateHistory(hist.id, { status: 'failed' });
              clearHistoryThrottle(hist.id);
            }
          } else {
            updateHistory(hist.id, { status: 'failed' });
            clearHistoryThrottle(hist.id);
          }
        } catch {}
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

// Cancel a running job by history id
app.post('/api/job/cancel/:id', requireAuth as any, (req, res) => {
  const id = req.params.id;
  const job = jobs.get(id);
  if (!job) return res.status(404).json({ error: 'not_found' });
  // If job is still in queue, remove and mark canceled
  const idx = waiting.findIndex((w) => w.job.id === id);
  if (idx >= 0) {
    waiting.splice(idx, 1);
    updateHistory(id, { status: 'canceled' });
  clearHistoryThrottle(id);
    emitProgress(id, { stage: 'canceled' });
    const listeners = (sseListeners.get(id) || new Set());
    for (const r of listeners) {
      try { r.write(`event: end\n` + `data: ${JSON.stringify({ id, status: 'canceled' })}\n\n`); } catch {}
    }
  try { cleanupJobFiles(job); jobs.delete(id); } catch {}
    try { sseListeners.delete(id); } catch {}
    return res.json({ ok: true });
  }
  try {
    job.child?.kill('SIGTERM');
    updateHistory(id, { status: 'canceled' });
  clearHistoryThrottle(id);
    emitProgress(id, { stage: 'canceled' });
    const listeners = (sseListeners.get(id) || new Set());
    for (const r of listeners) {
      try { r.write(`event: end\n` + `data: ${JSON.stringify({ id, status: 'canceled' })}\n\n`); } catch {}
    }
  try { cleanupJobFiles(job); jobs.delete(id); } catch {}
    try { running.delete(id); } catch {}
    try { sseListeners.delete(id); } catch {}
  } catch {}
  return res.json({ ok: true });
});

// Cancel all jobs (queued and running)
app.post('/api/jobs/cancel-all', requireAuth as any, (_req, res) => {
  // cancel queued
  while (waiting.length) {
    const next = waiting.shift()!;
    const id = next.job.id;
    updateHistory(id, { status: 'canceled' });
    emitProgress(id, { stage: 'canceled' });
    const listeners = (sseListeners.get(id) || new Set());
    for (const r of listeners) {
      try { r.write(`event: end\n` + `data: ${JSON.stringify({ id, status: 'canceled' })}\n\n`); } catch {}
    }
  try { cleanupJobFiles(next.job); jobs.delete(id); } catch {}
  }
  // cancel running
  for (const id of Array.from(running)) {
    const job = jobs.get(id);
    try { job?.child?.kill('SIGTERM'); } catch {}
    try { running.delete(id); } catch {}
    updateHistory(id, { status: 'canceled' });
  clearHistoryThrottle(id);
    emitProgress(id, { stage: 'canceled' });
    const listeners = (sseListeners.get(id) || new Set());
    for (const r of listeners) {
      try { r.write(`event: end\n` + `data: ${JSON.stringify({ id, status: 'canceled' })}\n\n`); } catch {}
    }
  if (job) try { cleanupJobFiles(job); jobs.delete(id); } catch {}
    try { sseListeners.delete(id); } catch {}
  }
  res.json({ ok: true });
});

// Download the produced file of a completed job
app.get('/api/job/file/:id', requireAuth as any, (req, res) => {
  const id = req.params.id;
  const job = jobs.get(id);
  if (!job || !job.produced) return res.status(404).json({ error: 'not_found' });
  const full = path.join(job.tmpDir, job.produced);
  if (!fs.existsSync(full)) return res.status(404).json({ error: 'file_missing' });
  try {
    const stat = fs.statSync(full);
  const isAudio = /\.(mp3|m4a|aac|opus)$/i.test(full);
  const extName = path.extname(full).toLowerCase();
  const videoType2 = extName === '.mkv' ? 'video/x-matroska' : extName === '.webm' ? 'video/webm' : 'video/mp4';
  res.setHeader('Content-Type', isAudio ? (/(mp3)$/i.test(full) ? 'audio/mpeg' : 'audio/mp4') : videoType2);
    // derive filename from history
    const items = readHistory();
    const h = items.find((x) => x.id === id);
  const base = (h?.title || (job.type === 'audio' ? 'audio' : 'video')).replace(/[^\w.-]+/g, '_');
    const ext = path.extname(full).replace(/^\./, '') || (job.type === 'audio' ? 'm4a' : 'mp4');
    res.setHeader('Content-Disposition', `attachment; filename="${base}.${ext}"`);
    res.setHeader('Content-Length', String(stat.size));
    if (req.method === 'HEAD') {
      return res.end();
    }
    // Handle tiny range probe (e.g., bytes=0-0) gracefully
    const range = req.headers.range;
    if (range) {
      const m = String(range).match(/bytes=(\d+)-(\d+)?/);
      if (m) {
        const start = parseInt(m[1], 10);
          const end = m[2] ? parseInt(m[2], 10) : (stat.size - 1);
        if (Number.isFinite(start) && start >= 0 && start < stat.size && end >= start) {
          res.status(206);
          res.setHeader('Accept-Ranges', 'bytes');
          res.setHeader('Content-Range', `bytes ${start}-${end}/${stat.size}`);
          res.setHeader('Content-Length', String(end - start + 1));
          const stream = fs.createReadStream(full, { start, end });
          stream.pipe(res);
          stream.on('close', () => {
            // do not delete file on partial probe
          });
          return;
        }
      }
    }
    const stream = fs.createReadStream(full);
    stream.pipe(res);
    stream.on('close', () => {
      // Cleanup
      fs.unlink(full, () => {});
      jobs.delete(id);
    });
  } catch (err: any) {
    log.error('job_file_failed', err?.message || err);
    res.status(500).json({ error: 'job_file_failed' });
  }
});

// Start a background job to create a clip between [start,end) seconds
app.post('/api/job/start/clip', requireAuth as any, async (req: any, res: Response) => {
  try {
    const { url: sourceUrl, title = 'clip', start, end } = (req.body || {}) as { url?: string; title?: string; start?: number; end?: number };
  if (!sourceUrl || !/^https?:\/\//i.test(sourceUrl)) return res.status(400).json({ error: 'invalid_url' });
  await assertPublicHttpHost(sourceUrl);
    const s = Number(start); const e = Number(end);
    if (!Number.isFinite(s) || !Number.isFinite(e) || !(e > s)) return res.status(400).json({ error: 'invalid_range' });
    const section = `${Math.max(0, Math.floor(s))}-${Math.floor(e)}`;
    const tmpDir = os.tmpdir();
    const tmpId = randomUUID();
    const outPath = path.join(fs.realpathSync(tmpDir), `${tmpId}.%(ext)s`);
  const hist = appendHistory({ title, url: sourceUrl, type: 'video', format: 'MP4', status: 'queued' });
  const job: Job = { id: hist.id, type: 'video', tmpId, tmpDir, userId: (req.user?.id || 'anon'), concurrencyCap: policyFor(req.user?.plan).concurrentJobs };
    jobs.set(hist.id, job);
    emitProgress(hist.id, { progress: 0, stage: 'queued' });
    const run = () => {
      log.info('job_spawn_clip', `url=${sourceUrl} ${section}`);
      const policy = policyFor(req.user?.plan);
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
        limitRate: (() => {
          const gl = Number(LIMIT_RATE || 0);
          const pl = Number(policy.speedLimitKbps || 0);
          const chosen = (gl > 0 && pl > 0) ? Math.min(gl, pl) : (gl > 0 ? gl : (pl > 0 ? pl : 0));
          return chosen > 0 ? `${chosen}K` : undefined;
        })(),
  ...(cfg.maxFileSizeMb ? { maxFilesize: `${cfg.maxFileSizeMb}M` } : {}),
  ...(cfg.maxDurationSec ? { matchFilter: `duration <= ${cfg.maxDurationSec}` } : {}),
  ...ytDlpArgsFromPolicy(policy),
  ...speedyDlArgs(),
      });
      job.child = child as any;
      const onProgress = (buf: Buffer) => {
        const text = buf.toString();
        const { pct, speed, eta } = parseDlLine(text);
        if (typeof pct === 'number') { updateHistoryThrottled(hist.id, pct); emitProgress(hist.id, { progress: pct, stage: 'downloading', speed, eta }); }
      };
      child.stdout?.on('data', onProgress);
      child.stderr?.on('data', onProgress);
      child.on('close', (code: number) => {
        running.delete(hist.id);
        try {
          const cur = readHistory().find((x) => x.id === hist.id);
          if (cur?.status === 'canceled') { schedule(); return; }
          if (code === 0) {
            const dir = fs.readdirSync(tmpDir);
            const produced = dir.find((f) => f.startsWith(tmpId + '.') && (f.endsWith('.mp4') || f.endsWith('.mkv') || f.endsWith('.webm')));
            if (produced) {
              job.produced = produced;
              const full = path.join(tmpDir, produced);
              const stat = fs.statSync(full);
              updateHistory(hist.id, { status: 'completed', progress: 100, size: `${Math.round(stat.size / 1024 / 1024)} MB` });
              clearHistoryThrottle(hist.id);
              emitProgress(hist.id, { progress: 100, stage: 'completed', size: stat.size });
              const listeners = (sseListeners.get(hist.id) || new Set());
              for (const r of listeners) { try { r.write(`event: end\n` + `data: ${JSON.stringify({ id: hist.id, status: 'completed' })}\n\n`); } catch {} }
              try { sseListeners.delete(hist.id); } catch {}
            } else { updateHistory(hist.id, { status: 'failed' }); clearHistoryThrottle(hist.id); }
          } else { updateHistory(hist.id, { status: 'failed' }); clearHistoryThrottle(hist.id); }
        } catch {}
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

// Start a background job to embed a selected subtitle language into the output container
app.post('/api/job/start/embed-subs', requireAuth as any, async (req: any, res: Response) => {
  try {
    const { url: sourceUrl, title = 'video', lang, format = 'srt', container = 'mp4' } = (req.body || {}) as { url?: string; title?: string; lang?: string; format?: string; container?: string };
  if (!sourceUrl || !/^https?:\/\//i.test(sourceUrl)) return res.status(400).json({ error: 'invalid_url' });
  await assertPublicHttpHost(sourceUrl);
    if (!lang) return res.status(400).json({ error: 'missing_lang' });
    const fmt = /^(srt|vtt)$/i.test(String(format)) ? String(format).toLowerCase() : 'srt';
    const cont = /^(mp4|mkv|webm)$/i.test(String(container)) ? String(container).toLowerCase() : 'mp4';
    const tmpDir = os.tmpdir();
    const tmpId = randomUUID();
    const outPath = path.join(fs.realpathSync(tmpDir), `${tmpId}.%(ext)s`);
  const hist = appendHistory({ title, url: sourceUrl, type: 'video', format: cont.toUpperCase(), status: 'queued' });
  const job: Job = { id: hist.id, type: 'video', tmpId, tmpDir, userId: (req.user?.id || 'anon'), concurrencyCap: policyFor(req.user?.plan).concurrentJobs };
    jobs.set(hist.id, job);
    emitProgress(hist.id, { progress: 0, stage: 'queued' });
    const run = () => {
      log.info('job_spawn_embed_subs', `url=${sourceUrl} lang=${lang} fmt=${fmt} cont=${cont}`);
      const policy = policyFor(req.user?.plan);
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
        limitRate: (() => {
          const gl = Number(LIMIT_RATE || 0);
          const pl = Number(policy.speedLimitKbps || 0);
          const chosen = (gl > 0 && pl > 0) ? Math.min(gl, pl) : (gl > 0 ? gl : (pl > 0 ? pl : 0));
          return chosen > 0 ? `${chosen}K` : undefined;
        })(),
  ...(cfg.maxFileSizeMb ? { maxFilesize: `${cfg.maxFileSizeMb}M` } : {}),
  ...(cfg.maxDurationSec ? { matchFilter: `duration <= ${cfg.maxDurationSec}` } : {}),
  ...ytDlpArgsFromPolicy(policy),
  ...speedyDlArgs(),
      });
      job.child = child as any;
      const onProgress = (buf: Buffer) => {
        const text = buf.toString();
        const { pct, speed, eta } = parseDlLine(text);
        if (typeof pct === 'number') { updateHistoryThrottled(hist.id, pct); emitProgress(hist.id, { progress: pct, stage: 'downloading', speed, eta }); }
        if (/Writing video subtitles|Merging formats|merging|Embedding subtitles/i.test(text)) emitProgress(hist.id, { progress: 95, stage: 'embedding', speed, eta });
      };
      child.stdout?.on('data', onProgress);
      child.stderr?.on('data', onProgress);
      child.on('close', (code: number) => {
        running.delete(hist.id);
        try {
          const cur = readHistory().find((x) => x.id === hist.id);
          if (cur?.status === 'canceled') { schedule(); return; }
          if (code === 0) {
            const dir = fs.readdirSync(tmpDir);
            const produced = dir.find((f) => f.startsWith(tmpId + '.') && (f.endsWith('.mp4') || f.endsWith('.mkv') || f.endsWith('.webm')));
            if (produced) {
              job.produced = produced;
              const full = path.join(tmpDir, produced);
              const stat = fs.statSync(full);
              updateHistory(hist.id, { status: 'completed', progress: 100, size: `${Math.round(stat.size / 1024 / 1024)} MB` });
              clearHistoryThrottle(hist.id);
              emitProgress(hist.id, { progress: 100, stage: 'completed', size: stat.size });
              const listeners = (sseListeners.get(hist.id) || new Set());
              for (const r of listeners) { try { r.write(`event: end\n` + `data: ${JSON.stringify({ id: hist.id, status: 'completed' })}\n\n`); } catch {} }
              try { sseListeners.delete(hist.id); } catch {}
            } else { updateHistory(hist.id, { status: 'failed' }); clearHistoryThrottle(hist.id); }
          } else { updateHistory(hist.id, { status: 'failed' }); clearHistoryThrottle(hist.id); }
        } catch {}
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
// Start a background job to convert/merge into a chosen container (mp4/mkv/webm)
app.post('/api/job/start/convert', requireAuth as any, async (req: any, res: Response) => {
  try {
    const { url: sourceUrl, title = 'video', container = 'mp4' } = (req.body || {}) as { url?: string; title?: string; container?: string };
    if (!sourceUrl || !/^https?:\/\//i.test(sourceUrl)) return res.status(400).json({ error: 'invalid_url' });
    const fmt = String(container).toLowerCase();
    const valid = ['mp4', 'mkv', 'webm'];
    const mergeOut: any = valid.includes(fmt) ? fmt : 'mp4';
    const tmpDir = os.tmpdir();
    const tmpId = randomUUID();
    const outPath = path.join(fs.realpathSync(tmpDir), `${tmpId}.%(ext)s`);
  const hist = appendHistory({ title, url: sourceUrl, type: 'video', format: String(mergeOut).toUpperCase(), status: 'queued' });
  const job: Job = { id: hist.id, type: 'video', tmpId, tmpDir, userId: (req.user?.id || 'anon'), concurrencyCap: policyFor(req.user?.plan).concurrentJobs };
    jobs.set(hist.id, job);
    emitProgress(hist.id, { progress: 0, stage: 'queued' });
    const run = () => {
      log.info('job_spawn_convert', `url=${sourceUrl} container=${mergeOut}`);
      const policy = policyFor(req.user?.plan);
  const child = (ytdlp as any).exec(sourceUrl, {
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
        limitRate: (() => {
          const gl = Number(LIMIT_RATE || 0);
          const pl = Number(policy.speedLimitKbps || 0);
          const chosen = (gl > 0 && pl > 0) ? Math.min(gl, pl) : (gl > 0 ? gl : (pl > 0 ? pl : 0));
          return chosen > 0 ? `${chosen}K` : undefined;
        })(),
  ...(cfg.maxFileSizeMb ? { maxFilesize: `${cfg.maxFileSizeMb}M` } : {}),
  ...(cfg.maxDurationSec ? { matchFilter: `duration <= ${cfg.maxDurationSec}` } : {}),
  ...ytDlpArgsFromPolicy(policy),
  ...speedyDlArgs(),
      });
      job.child = child as any;
      const onProgress = (buf: Buffer) => {
        const text = buf.toString();
        const { pct, speed, eta } = parseDlLine(text);
        if (typeof pct === 'number') { updateHistoryThrottled(hist.id, pct); emitProgress(hist.id, { progress: pct, stage: 'downloading', speed, eta }); }
        if (/Merging formats|merging/i.test(text)) emitProgress(hist.id, { progress: 95, stage: 'merging', speed, eta });
      };
      child.stdout?.on('data', onProgress);
      child.stderr?.on('data', onProgress);
      child.on('error', (err: any) => { try { log.error('yt_dlp_error_convert', err?.message || String(err)); } catch {} });
      child.on('close', (code: number) => {
        try { log.info('yt_dlp_close_convert', `code=${code}`); } catch {}
        running.delete(hist.id);
        try {
          const cur = readHistory().find((x) => x.id === hist.id);
          if (cur?.status === 'canceled') { schedule(); return; }
          if (code === 0) {
            const dir = fs.readdirSync(tmpDir);
            const produced = dir.find((f) => f.startsWith(tmpId + '.') && (f.endsWith('.mp4') || f.endsWith('.mkv') || f.endsWith('.webm')));
            if (produced) {
              job.produced = produced;
              const full = path.join(tmpDir, produced);
              const stat = fs.statSync(full);
              updateHistory(hist.id, { status: 'completed', progress: 100, size: `${Math.round(stat.size / 1024 / 1024)} MB` });
              clearHistoryThrottle(hist.id);
              emitProgress(hist.id, { progress: 100, stage: 'completed', size: stat.size });
              const listeners = (sseListeners.get(hist.id) || new Set());
              for (const r of listeners) {
                try { r.write(`event: end\n` + `data: ${JSON.stringify({ id: hist.id, status: 'completed' })}\n\n`); } catch {}
              }
              try { sseListeners.delete(hist.id); } catch {}
            } else {
              updateHistory(hist.id, { status: 'failed' });
              clearHistoryThrottle(hist.id);
            }
          } else {
            updateHistory(hist.id, { status: 'failed' });
            clearHistoryThrottle(hist.id);
          }
        } catch {}
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

// Subtitles: download and optional convert/offset
app.get('/api/subtitles/download', requireAuth as any, async (req: any, res) => {
  try {
    const src = String(req.query.url || '');
    const title = String(req.query.title || 'subtitles');
    const outFmt = String(req.query.format || 'vtt').toLowerCase(); // 'vtt' | 'srt'
    const offsetSec = Number(req.query.offset || 0) || 0; // can be negative
  if (!src || !/^https?:\/\//i.test(src)) return res.status(400).json({ error: 'invalid_src' });
  await assertPublicHttpHost(src);
    const policy = policyFor(req.user?.plan);
    if (!policy.allowSubtitles) return res.status(403).json({ error: 'SUBTITLES_NOT_ALLOWED' });
    const tmp = fs.realpathSync(os.tmpdir());
    const id = randomUUID();
    const outExt = outFmt === 'srt' ? 'srt' : 'vtt';
    const outPath = path.join(tmp, `${id}.${outExt}`);
    // If no conversion/offset and ext already matches, just proxy stream
    if (offsetSec === 0 && /\.vtt($|\?|#)/i.test(src) && outExt === 'vtt') {
      const upstream = await fetch(src, { headers: { 'user-agent': 'Mozilla/5.0' } });
      if (!upstream.ok || !upstream.body) return res.status(502).json({ error: 'upstream_failed', status: upstream.status });
      res.setHeader('Content-Type', 'text/vtt; charset=utf-8');
      const safe = (title || 'subtitles').replace(/[^\w.-]+/g, '_');
      res.setHeader('Content-Disposition', `attachment; filename="${safe}.vtt"`);
      return Readable.fromWeb(upstream.body as any).pipe(res);
    }
    // Use ffmpeg to convert/offset
  const args: string[] = [];
  if (offsetSec !== 0) args.push('-itsoffset', String(offsetSec));
  args.push('-i', src);
  // map only subtitle streams (tolerant)
  args.push('-map', '0:s?');
  if (outExt === 'srt') { args.push('-c:s', 'srt'); }
  else { args.push('-c:s', 'webvtt'); }
  args.push('-f', outExt === 'srt' ? 'srt' : 'webvtt');
  args.push(outPath);
    const ff = spawnSync(ffmpegBinary || 'ffmpeg', args, { encoding: 'utf8' });
    if (ff.status !== 0 || !fs.existsSync(outPath)) {
      try { if (fs.existsSync(outPath)) fs.unlinkSync(outPath); } catch {}
      return res.status(500).json({ error: 'convert_failed', details: ff.stderr || ff.stdout || '' });
    }
    const stat = fs.statSync(outPath);
    res.setHeader('Content-Type', outExt === 'srt' ? 'application/x-subrip; charset=utf-8' : 'text/vtt; charset=utf-8');
    const safe = (title || 'subtitles').replace(/[^\w.-]+/g, '_');
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

// Cleanup temp files for tracked jobs
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

// Error middleware should be last
app.use(errorHandler);

// Start server with auto-retry on EADDRINUSE and persist last working port
function startServerWithRetry(startPort: number, maxAttempts = 10): Promise<import('http').Server> {
  let port = startPort;
  let attempts = 0;
  return new Promise((resolve, reject) => {
    const tryListen = () => {
      attempts++;
      const server = app.listen(port);
      const onError = (err: any) => {
        server.off('listening', onListening);
        if (err && err.code === 'EADDRINUSE') {
          if (attempts >= maxAttempts) return reject(new Error(`Ports ${startPort}-${port} busy`));
          try { log.warn?.('port_in_use_retry', `Port ${port} busy, retrying on ${port + 1}...` as any); } catch {}
          try { server.close(); } catch {}
          port += 1;
          setTimeout(tryListen, 150);
        } else {
          try { log.error('server_error', err?.message || String(err)); } catch {}
          reject(err);
        }
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
startServerWithRetry(initialPort).catch((e) => {
  log.error('fatal_startup', e?.message || String(e));
  process.exitCode = 1;
});

// Graceful shutdown: cancel all jobs and cleanup temp files
async function gracefulShutdown(signal: string) {
  try {
    log.info(`shutdown_${signal.toLowerCase()}`, 'Shutting down, canceling jobs...');
    // cancel queued
    while (waiting.length) {
      const next = waiting.shift()!;
      const id = next.job.id;
      try { cleanupJobFiles(next.job); } catch {}
      try { jobs.delete(id); } catch {}
    }
    // cancel running
    for (const id of Array.from(running)) {
      const job = jobs.get(id);
      try { job?.child?.kill('SIGTERM'); } catch {}
      try { if (job) cleanupJobFiles(job); } catch {}
      try { jobs.delete(id); } catch {}
    }
  } catch {}
  // allow a brief moment for file handles
  setTimeout(() => process.exit(0), 300);
}

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

// Global crash guards: log and keep process alive
process.on('uncaughtException', (err) => {
  try { log.error('uncaught_exception', err?.stack || String(err)); } catch {}
});
process.on('unhandledRejection', (reason: any) => {
  try { log.error('unhandled_rejection', reason?.stack || String(reason)); } catch {}
});
