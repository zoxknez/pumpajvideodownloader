/**
 * Direct download routes (streaming endpoints)
 * Handles /api/download/best, /api/download/audio, /api/download/chapter
 */

import type { Response, Request } from 'express';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import ytdlp from 'youtube-dl-exec';
import { policyFor } from '../core/policy.js';
import { ytDlpArgsFromPolicy } from '../core/policyEnforce.js';
import { isUrlAllowed } from '../core/urlAllow.js';
import { assertPublicHttpHost } from '../core/ssrfGuard.js';
import { setDownloadHeaders, appendVary, safeKill } from '../core/http.js';
import {
  makeHeaders,
  coerceAudioFormat,
  selectVideoFormat,
  selectAudioFormat,
  parseDlLine,
  hasProgressHint,
  chosenLimitRateK,
  findProducedFile,
  safeName,
  speedyDlArgs,
  trapChildPromise,
  cleanedChildEnv as cleanedChildEnvHelper,
  getFreeDiskBytes,
  DEFAULT_AUDIO_FORMAT,
} from '../core/ytHelpers.js';
import type { AppConfig } from '../core/config.js';
import type { Logger } from '../core/logger.js';

type HistoryFunctions = {
  appendHistory: (item: any) => { id: string };
  updateHistory: (id: string, updates: any) => void;
  updateHistoryThrottled: (id: string, progress: number) => void;
};

type SseFunctions = {
  emitProgress: (id: string, payload: any) => void;
  endSseFor: (id: string, status?: 'completed' | 'failed' | 'canceled') => void;
};

/**
 * Setup download routes
 */
export function setupDownloadRoutes(
  app: any,
  requireAuth: any,
  cfg: AppConfig,
  log: Logger,
  historyFns: HistoryFunctions,
  sseFns: SseFunctions,
  env: { PROXY_URL?: string; MIN_FREE_DISK_BYTES?: number }
) {
  const { appendHistory, updateHistory, updateHistoryThrottled } = historyFns;
  const { emitProgress, endSseFor } = sseFns;
  const { PROXY_URL, MIN_FREE_DISK_BYTES } = env;

  // ========================
  // /api/download/best (stream)
  // ========================
  app.get('/api/download/best', requireAuth as any, async (req: Request, res: Response) => {
    const sourceUrl = (req.query.url as string) || '';
    const requestUserId = String((req as any).user?.id || 'legacy');
    const title = (req.query.title as string) || 'video';
    if (!isUrlAllowed(sourceUrl, cfg)) return res.status(400).json({ error: 'invalid_url' });
    try {
      await assertPublicHttpHost(sourceUrl);
    } catch (e: any) {
      return res.status(400).json({
        ok: false,
        error: { code: e?.code || 'SSRF_FORBIDDEN', message: e?.message || 'Forbidden host' },
      });
    }

    const tmp = fs.realpathSync(os.tmpdir());
    const id = randomUUID();
    const outPath = path.join(tmp, `${id}.%(ext)s`);
    let histId: string | undefined;

    // Disk guard
    try {
      const free = getFreeDiskBytes(tmp);
      if ((MIN_FREE_DISK_BYTES ?? 0) > 0 && free > -1 && free < (MIN_FREE_DISK_BYTES as number)) {
        return res.status(507).json({ error: 'INSUFFICIENT_STORAGE' });
      }
    } catch {}

    try {
      const policy = policyFor((req as any).user?.plan);
      log.info('download_best_start', sourceUrl);
      const hist = appendHistory({
        userId: requestUserId,
        title,
        url: sourceUrl,
        type: 'video',
        format: 'MP4',
        status: 'in-progress',
      });
      histId = hist.id;
      emitProgress(hist.id, { progress: 0, stage: 'starting' });

      let stream: fs.ReadStream | null = null;

      const child = (ytdlp as any).exec(
        sourceUrl,
        {
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
        },
        { env: cleanedChildEnvHelper(process.env) }
      );

      let aborted = false;
      let completed = false;
      const handleAbort = () => {
        if (aborted || res.writableFinished) return;
        aborted = true;
        safeKill(child);
        try {
          stream?.destroy();
        } catch {}
        try {
          updateHistory(hist.id, { status: 'canceled' });
        } catch {}
        try {
          emitProgress(hist.id, { stage: 'canceled' });
        } catch {}
        endSseFor(hist.id, 'canceled');
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
      setDownloadHeaders(res, `${safe}${ext}`, stat.size);
      appendVary(res, 'Range'); // Prevent CDN from caching 200 and returning it for Range requests
      appendVary(res, 'Authorization'); // Prevent shared cache leakage across users
      if (req.method === 'HEAD') return res.end();

      stream = fs.createReadStream(full);
      stream.pipe(res);
      stream.on('close', () => {
        fs.unlink(full, () => {});
      });

      const finalize = () => {
        if (aborted || completed) return;
        completed = true;
        updateHistory(hist.id, {
          status: 'completed',
          progress: 100,
          size: `${Math.round(stat.size / 1024 / 1024)} MB`,
          sizeBytes: stat.size,
          completedAt: new Date().toISOString(),
        });
        emitProgress(hist.id, { progress: 100, stage: 'completed', size: stat.size });
        endSseFor(hist.id, 'completed');
      };

      res.on('finish', finalize);
    } catch (err: any) {
      log.error('download_best_failed', err?.message || err);
      if (histId) {
        updateHistory(histId, {
          status: 'failed',
          completedAt: new Date().toISOString(),
          error: String(err?.stderr || err?.message || err),
        });
        emitProgress(histId, { stage: 'failed' });
        endSseFor(histId, 'failed');
      }
      // Best-effort cleanup of temp files
      try {
        for (const f of fs.readdirSync(tmp)) {
          if (f.startsWith(id + '.')) fs.unlinkSync(path.join(tmp, f));
        }
      } catch {}
      res.status(500).json({ error: 'download_failed', details: String(err?.stderr || err?.message || err) });
    }
  });

  // ========================
  // /api/download/audio (stream)
  // ========================
  app.get('/api/download/audio', requireAuth as any, async (req: Request, res: Response) => {
    const sourceUrl = (req.query.url as string) || '';
    const requestUserId = String((req as any).user?.id || 'legacy');
    const title = (req.query.title as string) || 'audio';
    const fmt = coerceAudioFormat(req.query.format, DEFAULT_AUDIO_FORMAT);
    if (!fmt) return res.status(400).json({ error: 'invalid_format' });
    if (!isUrlAllowed(sourceUrl, cfg)) return res.status(400).json({ error: 'invalid_url' });
    try {
      await assertPublicHttpHost(sourceUrl);
    } catch (e: any) {
      return res.status(400).json({
        ok: false,
        error: { code: e?.code || 'SSRF_FORBIDDEN', message: e?.message || 'Forbidden host' },
      });
    }

    const tmp = fs.realpathSync(os.tmpdir());
    const id = randomUUID();
    const outPath = path.join(tmp, `${id}.%(ext)s`);
    let histId: string | undefined;

    // Disk guard
    try {
      const free = getFreeDiskBytes(tmp);
      if ((MIN_FREE_DISK_BYTES ?? 0) > 0 && free > -1 && free < (MIN_FREE_DISK_BYTES as number)) {
        return res.status(507).json({ error: 'INSUFFICIENT_STORAGE' });
      }
    } catch {}

    try {
      const policy = policyFor((req as any).user?.plan);
      log.info('download_audio_start', sourceUrl);
      const hist = appendHistory({
        userId: requestUserId,
        title,
        url: sourceUrl,
        type: 'audio',
        format: fmt.toUpperCase(),
        status: 'in-progress',
      });
      histId = hist.id;
      emitProgress(hist.id, { progress: 0, stage: 'starting' });

      let stream: fs.ReadStream | null = null;

      const child = (ytdlp as any).exec(
        sourceUrl,
        {
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
        },
        { env: cleanedChildEnvHelper(process.env) }
      );

      let aborted = false;
      let completed = false;
      const handleAbort = () => {
        if (aborted || res.writableFinished) return;
        aborted = true;
        safeKill(child);
        try {
          stream?.destroy();
        } catch {}
        try {
          updateHistory(hist.id, { status: 'canceled' });
        } catch {}
        try {
          emitProgress(hist.id, { stage: 'canceled' });
        } catch {}
        endSseFor(hist.id, 'canceled');
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
        extname === 'mp3'
          ? 'audio/mpeg'
          : extname === 'opus'
            ? 'audio/opus'
            : extname === 'ogg' || extname === 'oga' || extname === 'vorbis'
              ? 'audio/ogg'
              : extname === 'wav'
                ? 'audio/wav'
                : 'audio/mp4';
      res.setHeader('Content-Type', contentType);
      const safe = safeName(title || 'audio');
      const ext = extname || fmt;
      setDownloadHeaders(res, `${safe}.${ext}`, stat.size);
      appendVary(res, 'Range'); // Prevent CDN from caching 200 and returning it for Range requests
      appendVary(res, 'Authorization'); // Prevent shared cache leakage across users
      if (req.method === 'HEAD') return res.end();

      stream = fs.createReadStream(full);
      stream.pipe(res);
      stream.on('close', () => {
        fs.unlink(full, () => {});
      });

      const finalize = () => {
        if (aborted || completed) return;
        completed = true;
        updateHistory(hist.id, {
          status: 'completed',
          progress: 100,
          size: `${Math.round(stat.size / 1024 / 1024)} MB`,
          sizeBytes: stat.size,
          completedAt: new Date().toISOString(),
        });
        emitProgress(hist.id, { progress: 100, stage: 'completed', size: stat.size });
        endSseFor(hist.id, 'completed');
      };

      res.on('finish', finalize);
    } catch (err: any) {
      log.error('download_audio_failed', err?.message || err);
      if (histId) {
        updateHistory(histId, {
          status: 'failed',
          completedAt: new Date().toISOString(),
          error: String(err?.stderr || err?.message || err),
        });
        emitProgress(histId, { stage: 'failed' });
        endSseFor(histId, 'failed');
      }
      // Best-effort cleanup of temp files
      try {
        for (const f of fs.readdirSync(tmp)) {
          if (f.startsWith(id + '.')) fs.unlinkSync(path.join(tmp, f));
        }
      } catch {}
      res.status(500).json({ error: 'download_failed', details: String(err?.stderr || err?.message || err) });
    }
  });

  // ========================
  // /api/download/chapter (sekcija)
  // ========================
  app.get('/api/download/chapter', requireAuth as any, async (req: Request, res: Response) => {
    const tmp = fs.realpathSync(os.tmpdir());
    const id = randomUUID();
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

      const policy = policyFor((req as any).user?.plan);
      if (!policy.allowChapters) return res.status(403).json({ error: 'CHAPTERS_NOT_ALLOWED' });

      const outPath = path.join(tmp, `${id}.%(ext)s`);
      const section = `${Math.max(0, start)}-${end}`;

      // Disk guard
      try {
        const free = getFreeDiskBytes(tmp);
        if ((MIN_FREE_DISK_BYTES ?? 0) > 0 && free > -1 && free < (MIN_FREE_DISK_BYTES as number)) {
          return res.status(507).json({ error: 'INSUFFICIENT_STORAGE' });
        }
      } catch {}

      const child = (ytdlp as any).exec(
        sourceUrl,
        {
          format: selectVideoFormat(policy),
          output: outPath,
          addHeader: makeHeaders(sourceUrl),
          noCheckCertificates: true,
          noWarnings: true,
          downloadSections: section,
          proxy: PROXY_URL,
          limitRate: chosenLimitRateK(policy.speedLimitKbps),
          ...ytDlpArgsFromPolicy(policy),
          ...speedyDlArgs(),
          ...(cfg.maxFileSizeMb ? { maxFilesize: `${cfg.maxFileSizeMb}M` } : {}),
          ...(cfg.maxDurationSec ? { matchFilter: `duration <= ${cfg.maxDurationSec}` } : {}),
        },
        { env: cleanedChildEnvHelper(process.env) }
      );
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
      setDownloadHeaders(res, `${safeBase}.${index}_${safeChap}${path.extname(full)}`, stat.size);
      appendVary(res, 'Range'); // Prevent CDN from caching 200 and returning it for Range requests
      appendVary(res, 'Authorization'); // Prevent shared cache leakage across users
      if (req.method === 'HEAD') return res.end();

      const stream = fs.createReadStream(full);
      const endStream = () => {
        try {
          stream.destroy();
        } catch {}
      };
      res.on('close', endStream);
      res.on('aborted', endStream);
      stream.pipe(res);
      stream.on('close', () => {
        try {
          fs.unlinkSync(full);
        } catch {}
      });
    } catch (err: any) {
      log.error('download_chapter_failed', err?.message || err);
      // Best-effort cleanup of temp files
      try {
        const tmp = fs.realpathSync(os.tmpdir());
        for (const f of fs.readdirSync(tmp)) {
          if (f.startsWith(id + '.')) fs.unlinkSync(path.join(tmp, f));
        }
      } catch {}
      res.status(500).json({ error: 'download_failed' });
    }
  });
}
