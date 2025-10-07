/**
 * Job queue routes (background processing)
 * Handles /api/job/start/*, /api/job/cancel, /api/jobs/cancel-all, /api/job/file/:id
 */

import type { Response, Request } from 'express';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import ytdlp from 'youtube-dl-exec';
import { policyFor } from '../core/policy.js';
import { isUrlAllowed } from '../core/urlAllow.js';
import { assertPublicHttpHost } from '../core/ssrfGuard.js';
import { setDownloadHeaders, appendVary } from '../core/http.js';
import { ffmpegEnabled } from '../core/env.js';
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
import { ytDlpArgsFromPolicy } from '../core/policyEnforce.js';
import type { AppConfig } from '../core/config.js';
import type { Logger } from '../core/logger.js';
import { type Job, type JobSystemState as JobSystemStateBase, runJobWithLifecycle, assertFreeSpace } from '../core/jobHelpers.js';

type WaitingItem = {
  job: Job;
  run: () => void;
};

type HistoryFunctions = {
  appendHistory: (item: any) => { id: string };
  updateHistory: (id: string, updates: any) => void;
  updateHistoryThrottled: (id: string, progress: number) => void;
  clearHistoryThrottle: (id: string) => void;
  readHistory: () => any[];
};

type SseFunctions = {
  emitProgress: (id: string, payload: any) => void;
};

// Extended JobSystemState with additional fields needed by routes
type JobSystemState = JobSystemStateBase & {
  jobs: Map<string, Job>;
  waiting: WaitingItem[];
};

/**
 * Setup job routes
 */
export function setupJobRoutes(
  app: any,
  requireAuth: any,
  cfg: AppConfig,
  log: Logger,
  historyFns: HistoryFunctions,
  sseFns: SseFunctions,
  jobSystem: JobSystemState,
  env: { PROXY_URL?: string; MIN_FREE_DISK_BYTES: number }
) {
  const { appendHistory, updateHistory, updateHistoryThrottled, clearHistoryThrottle, readHistory } = historyFns;
  const { emitProgress } = sseFns;
  const { jobs, running, waiting, schedule, finalizeJob } = jobSystem;
  const { PROXY_URL, MIN_FREE_DISK_BYTES } = env;

  // ========================
  // POST /api/job/start/best (video)
  // ========================
  app.post('/api/job/start/best', requireAuth as any, async (req: Request, res: Response) => {
    try {
      const { url: sourceUrl, title = 'video' } = (req.body || {}) as { url?: string; title?: string };
      if (!sourceUrl || !/^https?:\/\//i.test(sourceUrl) || !isUrlAllowed(sourceUrl, cfg))
        return res.status(400).json({ error: 'invalid_url' });
      await assertPublicHttpHost(sourceUrl);

      const requestUser = {
        id: (req as any).user?.id ?? 'anon',
        username: (req as any).user?.username,
        plan: (req as any).user?.plan ?? 'FREE',
        planExpiresAt: (req as any).user?.planExpiresAt ?? undefined,
      } as const;
      const policyAtQueue = policyFor(requestUser.plan);

      const tmpDir = os.tmpdir();
      const tmpId = randomUUID();
      const outPath = path.join(fs.realpathSync(tmpDir), `${tmpId}.%(ext)s`);

      // Disk guard
      try {
        assertFreeSpace(tmpDir, MIN_FREE_DISK_BYTES);
      } catch (err: any) {
        return res.status(507).json({ error: 'INSUFFICIENT_STORAGE' });
      }

      const hist = appendHistory({ title, url: sourceUrl, type: 'video', format: 'MP4', status: 'queued' });
      const job: Job = {
        id: hist.id,
        type: 'video',
        tmpId,
        tmpDir,
        userId: requestUser.id,
        concurrencyCap: policyAtQueue.concurrentJobs,
        version: 1,
      };
      jobs.set(hist.id, job);
      emitProgress(hist.id, { progress: 0, stage: 'queued' });

      // Build job runner with complete lifecycle
      const run = runJobWithLifecycle({
        job,
        histId: hist.id,
        url: sourceUrl,
        ytdlpArgs: {
          format: selectVideoFormat(policyAtQueue),
          output: outPath,
          addHeader: makeHeaders(sourceUrl),
          restrictFilenames: true,
          noCheckCertificates: true,
          noWarnings: true,
          newline: true,
          proxy: PROXY_URL,
          limitRate: chosenLimitRateK(policyAtQueue.speedLimitKbps),
          ...(cfg.maxFileSizeMb ? { maxFilesize: `${cfg.maxFileSizeMb}M` } : {}),
          ...(cfg.maxDurationSec ? { matchFilter: `duration <= ${cfg.maxDurationSec}` } : {}),
          ...ytDlpArgsFromPolicy(policyAtQueue),
          ...speedyDlArgs(),
        },
        producedExts: ['.mp4', '.mkv', '.webm'],
        log,
        logPrefix: 'job_spawn_best',
        state: {
          running,
          readHistory,
          updateHistory,
          clearHistoryThrottle,
          updateHistoryThrottled,
          emitProgress,
          finalizeJob,
          schedule,
        },
        progressHints: { merging: true },
      });

      waiting.push({ job, run });
      schedule();
      return res.json({ id: hist.id });
    } catch (err: any) {
      log.error('job_start_best_failed', err?.message || err);
      return res.status(500).json({ error: 'job_start_failed' });
    }
  });

  // ========================
  // POST /api/job/start/audio
  // ========================
  app.post('/api/job/start/audio', requireAuth as any, async (req: Request, res: Response) => {
    try {
      const { url: sourceUrl, title = 'audio', format = DEFAULT_AUDIO_FORMAT } = (req.body || {}) as {
        url?: string;
        title?: string;
        format?: string;
      };
      if (!sourceUrl || !/^https?:\/\//i.test(sourceUrl) || !isUrlAllowed(sourceUrl, cfg))
        return res.status(400).json({ error: 'invalid_url' });
      await assertPublicHttpHost(sourceUrl);

      const fmt = coerceAudioFormat(format, DEFAULT_AUDIO_FORMAT);
      if (!fmt) return res.status(400).json({ error: 'invalid_format' });

      const requestUser = {
        id: (req as any).user?.id ?? 'anon',
        username: (req as any).user?.username,
        plan: (req as any).user?.plan ?? 'FREE',
        planExpiresAt: (req as any).user?.planExpiresAt ?? undefined,
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

      const hist = appendHistory({ title, url: sourceUrl, type: 'audio', format: fmt.toUpperCase(), status: 'queued' });
      const job: Job = {
        id: hist.id,
        type: 'audio',
        tmpId,
        tmpDir,
        userId: requestUser.id,
        concurrencyCap: policyAtQueue.concurrentJobs,
        version: 1,
      };
      jobs.set(hist.id, job);
      emitProgress(hist.id, { progress: 0, stage: 'queued' });

      // Build job runner with complete lifecycle
      const run = runJobWithLifecycle({
        job,
        histId: hist.id,
        url: sourceUrl,
        ytdlpArgs: {
          ...selectAudioFormat(fmt),
          output: outPath,
          addHeader: makeHeaders(sourceUrl),
          restrictFilenames: true,
          noCheckCertificates: true,
          noWarnings: true,
          newline: true,
          proxy: PROXY_URL,
          limitRate: chosenLimitRateK(policyAtQueue.speedLimitKbps),
          ...(cfg.maxFileSizeMb ? { maxFilesize: `${cfg.maxFileSizeMb}M` } : {}),
          ...(cfg.maxDurationSec ? { matchFilter: `duration <= ${cfg.maxDurationSec}` } : {}),
          ...ytDlpArgsFromPolicy(policyAtQueue),
          ...speedyDlArgs(),
        },
        producedExts: ['.mp3', '.m4a', '.aac', '.opus', '.flac', '.wav', '.ogg', '.oga', '.alac'],
        log,
        logPrefix: 'job_spawn_audio',
        state: {
          running,
          readHistory,
          updateHistory,
          clearHistoryThrottle,
          updateHistoryThrottled,
          emitProgress,
          finalizeJob,
          schedule,
        },
        progressHints: { converting: true },
      });

      waiting.push({ job, run });
      schedule();
      return res.json({ id: hist.id });
    } catch (err: any) {
      log.error('job_start_audio_failed', err?.message || err);
      return res.status(500).json({ error: 'job_start_failed' });
    }
  });

  // ========================
  // POST /api/job/cancel/:id
  // ========================
  app.post('/api/job/cancel/:id', requireAuth as any, (req: Request, res: Response) => {
    const jobId = req.params.id;
    if (!jobId) return res.status(400).json({ error: 'missing_id' });

    const userId = (req as any).user?.id;
    const job = jobs.get(jobId);
    if (!job) return res.status(404).json({ error: 'job_not_found' });
    if (job.userId !== userId) return res.status(403).json({ error: 'forbidden' });

    try {
      updateHistory(jobId, { status: 'canceled' });
      clearHistoryThrottle(jobId);
      if (job.child && typeof job.child.kill === 'function') {
        job.child.kill('SIGTERM');
      }
      emitProgress(jobId, { stage: 'canceled' });
      finalizeJob(jobId, 'canceled', { job, keepJob: false, keepFiles: false });
      return res.json({ ok: true });
    } catch (err: any) {
      log.error('job_cancel_failed', err?.message || err);
      return res.status(500).json({ error: 'cancel_failed' });
    }
  });

  // ========================
  // NOTE: GET /api/job/file/:id is handled in main server.ts (index.ts)
  // Central implementation includes: ETag, 304 Not Modified, suffix-range support,
  // proper Range validation, Vary: Authorization, and file cleanup after download.
  // Do not duplicate here to avoid route shadowing and inconsistent behavior.
  // ========================

  // ========================
  // POST /api/job/start/clip (video clip with time range)
  // ========================
  app.post('/api/job/start/clip', requireAuth as any, async (req: Request, res: Response) => {
    try {
      const { url: sourceUrl, title = 'clip', start, end } = (req.body || {}) as {
        url?: string;
        title?: string;
        start?: number;
        end?: number;
      };
      if (!sourceUrl || !/^https?:\/\//i.test(sourceUrl) || !isUrlAllowed(sourceUrl, cfg))
        return res.status(400).json({ error: 'invalid_url' });
      await assertPublicHttpHost(sourceUrl);

      const s = Number(start),
        e = Number(end);
      if (!Number.isFinite(s) || !Number.isFinite(e) || !(e > s))
        return res.status(400).json({ error: 'invalid_range' });

      const userId = (req as any).user?.id ?? 'anon';
      const requestUser = {
        id: userId,
        username: (req as any).user?.username,
        plan: (req as any).user?.plan ?? 'FREE',
        planExpiresAt: (req as any).user?.planExpiresAt ?? undefined,
      } as const;
      const policyAtQueue = policyFor(requestUser.plan);

      const section = `${Math.max(0, Math.floor(s))}-${Math.floor(e)}`;
      const tmpDir = os.tmpdir();
      const tmpId = randomUUID();
      const outPath = path.join(fs.realpathSync(tmpDir), `${tmpId}.%(ext)s`);

      // Disk guard
      try {
        assertFreeSpace(tmpDir, MIN_FREE_DISK_BYTES);
      } catch (err: any) {
        return res.status(507).json({ error: 'INSUFFICIENT_STORAGE' });
      }

      const hist = appendHistory({ title, url: sourceUrl, type: 'video', format: 'MP4', status: 'queued' });
      const job: Job = {
        id: hist.id,
        type: 'video',
        tmpId,
        tmpDir,
        userId: requestUser.id,
        concurrencyCap: policyAtQueue.concurrentJobs,
        version: 1,
      };
      jobs.set(hist.id, job);
      emitProgress(hist.id, { progress: 0, stage: 'queued' });

      // Build job runner with complete lifecycle
      const run = runJobWithLifecycle({
        job,
        histId: hist.id,
        url: sourceUrl,
        ytdlpArgs: {
          format: selectVideoFormat(policyAtQueue),
          output: outPath,
          addHeader: makeHeaders(sourceUrl),
          noCheckCertificates: true,
          noWarnings: true,
          newline: true,
          downloadSections: section,
          proxy: PROXY_URL,
          limitRate: chosenLimitRateK(policyAtQueue.speedLimitKbps),
          ...(cfg.maxFileSizeMb ? { maxFilesize: `${cfg.maxFileSizeMb}M` } : {}),
          ...(cfg.maxDurationSec ? { matchFilter: `duration <= ${cfg.maxDurationSec}` } : {}),
          ...ytDlpArgsFromPolicy(policyAtQueue),
          ...speedyDlArgs(),
        },
        producedExts: ['.mp4', '.mkv', '.webm'],
        log,
        logPrefix: 'job_spawn_clip',
        state: {
          running,
          readHistory,
          updateHistory,
          clearHistoryThrottle,
          updateHistoryThrottled,
          emitProgress,
          finalizeJob,
          schedule,
        },
      });

      waiting.push({ job, run });
      schedule();
      return res.json({ id: hist.id });
    } catch (err: any) {
      log.error('job_start_clip_failed', err?.message || err);
      return res.status(500).json({ error: 'job_start_failed' });
    }
  });

  // ========================
  // POST /api/job/start/embed-subs (embed subtitles)
  // ========================
  app.post('/api/job/start/embed-subs', requireAuth as any, async (req: Request, res: Response) => {
    try {
      // FFmpeg gate - embedding subtitles requires FFmpeg for muxing
      if (!ffmpegEnabled()) {
        return res.status(501).json({
          error: 'feature_disabled',
          message: 'Embedding subtitles requires FFmpeg which is disabled in this deployment',
        });
      }

      const { url: sourceUrl, title = 'video', lang, format = 'srt', container = 'mp4' } = (req.body || {}) as {
        url?: string;
        title?: string;
        lang?: string;
        format?: string;
        container?: string;
      };
      if (!sourceUrl || !/^https?:\/\//i.test(sourceUrl) || !isUrlAllowed(sourceUrl, cfg))
        return res.status(400).json({ error: 'invalid_url' });
      await assertPublicHttpHost(sourceUrl);
      if (!lang) return res.status(400).json({ error: 'missing_lang' });

      const userId = (req as any).user?.id ?? 'anon';
      const requestUser = {
        id: userId,
        username: (req as any).user?.username,
        plan: (req as any).user?.plan ?? 'FREE',
        planExpiresAt: (req as any).user?.planExpiresAt ?? undefined,
      } as const;
      const policyAtQueue = policyFor(requestUser.plan);

      const fmt = /^(srt|vtt)$/i.test(String(format)) ? String(format).toLowerCase() : 'srt';
      const cont = /^(mp4|mkv|webm)$/i.test(String(container)) ? String(container).toLowerCase() : 'mp4';

      const tmpDir = os.tmpdir();
      const tmpId = randomUUID();
      const outPath = path.join(fs.realpathSync(tmpDir), `${tmpId}.%(ext)s`);

      // Disk guard
      try {
        assertFreeSpace(tmpDir, MIN_FREE_DISK_BYTES);
      } catch (err: any) {
        return res.status(507).json({ error: 'INSUFFICIENT_STORAGE' });
      }

      const hist = appendHistory({ title, url: sourceUrl, type: 'video', format: cont.toUpperCase(), status: 'queued' });
      const job: Job = {
        id: hist.id,
        type: 'video',
        tmpId,
        tmpDir,
        userId: requestUser.id,
        concurrencyCap: policyAtQueue.concurrentJobs,
        version: 1,
      };
      jobs.set(hist.id, job);
      emitProgress(hist.id, { progress: 0, stage: 'queued' });

      // Build job runner with complete lifecycle
      const run = runJobWithLifecycle({
        job,
        histId: hist.id,
        url: sourceUrl,
        ytdlpArgs: {
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
          limitRate: chosenLimitRateK(policyAtQueue.speedLimitKbps),
          ...(cfg.maxFileSizeMb ? { maxFilesize: `${cfg.maxFileSizeMb}M` } : {}),
          ...(cfg.maxDurationSec ? { matchFilter: `duration <= ${cfg.maxDurationSec}` } : {}),
          ...ytDlpArgsFromPolicy(policyAtQueue),
          ...speedyDlArgs(),
        },
        producedExts: ['.mp4', '.mkv', '.webm'],
        log,
        logPrefix: 'job_spawn_embed_subs',
        state: {
          running,
          readHistory,
          updateHistory,
          clearHistoryThrottle,
          updateHistoryThrottled,
          emitProgress,
          finalizeJob,
          schedule,
        },
        progressHints: { embedding: true },
      });

      waiting.push({ job, run });
      schedule();
      return res.json({ id: hist.id });
    } catch (err: any) {
      log.error('job_start_embed_subs_failed', err?.message || err);
      return res.status(500).json({ error: 'job_start_failed' });
    }
  });

  // ========================
  // POST /api/job/start/convert (format conversion)
  // ========================
  app.post('/api/job/start/convert', requireAuth as any, async (req: Request, res: Response) => {
    try {
      const { url: sourceUrl, title = 'video', container = 'mp4' } = (req.body || {}) as {
        url?: string;
        title?: string;
        container?: string;
      };
      if (!sourceUrl || !/^https?:\/\//i.test(sourceUrl) || !isUrlAllowed(sourceUrl, cfg))
        return res.status(400).json({ error: 'invalid_url' });
      await assertPublicHttpHost(sourceUrl);

      const userId = (req as any).user?.id ?? 'anon';
      const requestUser = {
        id: userId,
        username: (req as any).user?.username,
        plan: (req as any).user?.plan ?? 'FREE',
        planExpiresAt: (req as any).user?.planExpiresAt ?? undefined,
      } as const;
      const policyAtQueue = policyFor(requestUser.plan);

      // FFmpeg gate: conversion requires FFmpeg for adaptive stream merge/remux
      if (!ffmpegEnabled()) {
        return res.status(501).json({ error: 'FFMPEG_REQUIRED', message: 'Format conversion requires FFmpeg' });
      }

      const fmt = String(container).toLowerCase();
      const valid = ['mp4', 'mkv', 'webm'];
      const mergeOut: any = valid.includes(fmt) ? fmt : 'mp4';

      const tmpDir = os.tmpdir();
      const tmpId = randomUUID();
      const outPath = path.join(fs.realpathSync(tmpDir), `${tmpId}.%(ext)s`);

      // Disk guard
      try {
        assertFreeSpace(tmpDir, MIN_FREE_DISK_BYTES);
      } catch (err: any) {
        return res.status(507).json({ error: 'INSUFFICIENT_STORAGE' });
      }

      const hist = appendHistory({
        title,
        url: sourceUrl,
        type: 'video',
        format: String(mergeOut).toUpperCase(),
        status: 'queued',
      });
      const job: Job = {
        id: hist.id,
        type: 'video',
        tmpId,
        tmpDir,
        userId: requestUser.id,
        concurrencyCap: policyAtQueue.concurrentJobs,
        version: 1,
      };
      jobs.set(hist.id, job);
      emitProgress(hist.id, { progress: 0, stage: 'queued' });

      // Build job runner with complete lifecycle
      const run = runJobWithLifecycle({
        job,
        histId: hist.id,
        url: sourceUrl,
        ytdlpArgs: {
          format: selectVideoFormat(policyAtQueue),
          output: outPath,
          addHeader: makeHeaders(sourceUrl),
          restrictFilenames: true,
          noCheckCertificates: true,
          noWarnings: true,
          newline: true,
          proxy: PROXY_URL,
          limitRate: chosenLimitRateK(policyAtQueue.speedLimitKbps),
          ...(cfg.maxFileSizeMb ? { maxFilesize: `${cfg.maxFileSizeMb}M` } : {}),
          ...(cfg.maxDurationSec ? { matchFilter: `duration <= ${cfg.maxDurationSec}` } : {}),
          ...ytDlpArgsFromPolicy(policyAtQueue),
          ...speedyDlArgs(),
        },
        producedExts: ['.mp4', '.mkv', '.webm'],
        log,
        logPrefix: 'job_spawn_convert',
        state: {
          running,
          readHistory,
          updateHistory,
          clearHistoryThrottle,
          updateHistoryThrottled,
          emitProgress,
          finalizeJob,
          schedule,
        },
        progressHints: { merging: true },
      });

      waiting.push({ job, run });
      schedule();
      return res.json({ id: hist.id });
    } catch (err: any) {
      log.error('job_start_convert_failed', err?.message || err);
      return res.status(500).json({ error: 'job_start_failed' });
    }
  });

  // ========================
  // POST /api/jobs/cancel-all (cancel all user jobs)
  // ========================
  app.post('/api/jobs/cancel-all', requireAuth as any, (req: Request, res: Response) => {
    const currentUserId = (req as any).user?.id;
    if (!currentUserId) return res.status(401).json({ error: 'unauthorized' });

    // Cancel queued jobs (only for current user)
    for (let i = waiting.length - 1; i >= 0; i--) {
      const next = waiting[i];
      if (next.job.userId !== currentUserId) continue;
      
      waiting.splice(i, 1);
      const id = next.job.id;
      updateHistory(id, { status: 'canceled' });
      emitProgress(id, { stage: 'canceled' });
      finalizeJob(id, 'canceled', { job: next.job, keepJob: false, keepFiles: false });
    }

    // Cancel running jobs (only for current user)
    for (const id of Array.from(running)) {
      const job = jobs.get(id);
      if (job?.userId !== currentUserId) continue;
      
      try {
        job?.child?.kill('SIGTERM');
      } catch {}
      try {
        const pid = job?.child?.pid;
        if (pid && !job?.child?.killed)
          setTimeout(() => {
            try {
              process.kill(pid, 'SIGKILL');
            } catch {}
          }, 5000);
      } catch {}
      updateHistory(id, { status: 'canceled' });
      emitProgress(id, { stage: 'canceled' });
      finalizeJob(id, 'canceled', { job: job, keepJob: false, keepFiles: false });
    }
    res.json({ ok: true });
  });
}
