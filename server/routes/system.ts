import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import type { Request, Response } from 'express';
import type { Logger } from '../core/logger.js';
import type { AppConfig } from '../core/config.js';
import type { Job } from '../core/jobHelpers.js';
import type { WaitingItem } from '../core/jobState.js';
import { getFreeDiskBytes, formatDuration } from '../core/ytHelpers.js';

export type SystemDeps = {
  cfg: AppConfig;
  log: Logger;
  requireAuth: any;
  jobs: Map<string, Job>;
  waiting: WaitingItem[];
  running: Set<string>;
  sseListeners: Map<string, Set<Response>>;
  sseBuffers: Map<string, string[]>;
  sseHub: { getStats: () => unknown };
  jobManager: { getStats: () => unknown; getQueueInfo: () => unknown };
  getMaxConcurrent: () => number;
  getProxyUrl: () => string | undefined;
  getLimitRate: () => number | undefined;
  minFreeDiskBytes: number;
  getBatchStats: () => unknown;
};

const YT_VERSION_CACHE_TTL = 5 * 60 * 1000; // 5 minutes
let ytVersionCache: { version: string; timestamp: number } | null = null;

function getYtDlpVersion(log: Logger) {
  const now = Date.now();
  if (ytVersionCache && now - ytVersionCache.timestamp < YT_VERSION_CACHE_TTL) {
    return ytVersionCache.version;
  }

  let version = '';
  try {
    const out = spawnSync('yt-dlp', ['--version'], { encoding: 'utf8', timeout: 2000 });
    if (out?.status === 0) version = String(out.stdout || '').trim();
  } catch (err) {
    log.warn('ytdlp_version_check_failed', { error: String(err) });
  }

  ytVersionCache = { version, timestamp: now };
  return version;
}

export function setupSystemRoutes(app: any, deps: SystemDeps) {
  const {
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
    getMaxConcurrent,
    getProxyUrl,
    getLimitRate,
    minFreeDiskBytes,
    getBatchStats,
  } = deps;

  app.get('/health', (_req: Request, res: Response) => res.json({ ok: true }));
  app.get('/ready', (_req: Request, res: Response) => res.json({ ok: true }));

  app.get('/api/stats', requireAuth as any, (_req: Request, res: Response) => {
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

  app.get('/', (_req: Request, res: Response) => {
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

  app.get('/api/version', (_req: Request, res: Response) => {
    try {
      let pkg: any = {};
      try {
        const p = path.join(process.cwd(), 'package.json');
        if (fs.existsSync(p)) pkg = JSON.parse(fs.readFileSync(p, 'utf8'));
      } catch {}
      const ytVersion = getYtDlpVersion(log);
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
          maxConcurrent: getMaxConcurrent(),
          proxyUrl: getProxyUrl() || '',
          limitRateKbps: getLimitRate() || 0,
        },
        uptimeSeconds: Math.floor(process.uptime()),
        uptimeLabel: formatDuration(process.uptime()),
        disk: {
          tmpDir: os.tmpdir(),
          freeMB: freeBytes >= 0 ? Math.floor(freeBytes / (1024 * 1024)) : -1,
          freeBytes,
          guardMinMB: minFreeDiskBytes > 0 ? Math.floor(minFreeDiskBytes / (1024 * 1024)) : 0,
          guardEnabled: minFreeDiskBytes > 0,
        },
        queues: {
          totalJobs: jobs.size,
          running: running.size,
          waiting: waiting.length,
        },
        batches: getBatchStats(),
      });
    } catch (err: any) {
      res.status(500).json({ error: 'version_failed', details: String(err?.message || err) });
    }
  });
}
