import type { Request, Response } from 'express';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import ytdlp from 'youtube-dl-exec';

import { policyFor } from '../core/policy.js';
import { isUrlAllowed } from '../core/urlAllow.js';
import { assertPublicHttpHost } from '../core/ssrfGuard.js';
import { audit } from '../core/audit.js';
import {
  makeHeaders,
  coerceAudioFormat,
  selectVideoFormat,
  selectAudioFormat,
  parseDlLine,
  hasProgressHint,
  chosenLimitRateK,
  findProducedFile,
  speedyDlArgs,
  trapChildPromise,
  cleanedChildEnv as cleanedChildEnvHelper,
  getFreeDiskBytes,
  DEFAULT_AUDIO_FORMAT,
} from '../core/ytHelpers.js';
import { ytDlpArgsFromPolicy } from '../core/policyEnforce.js';
import type { AppConfig } from '../core/config.js';
import type { Logger } from '../core/logger.js';
import {
  type Job,
  runJobWithLifecycle,
  assertFreeSpace,
} from '../core/jobHelpers.js';
import { StartAudioJobBody, StartClipJobBody, StartVideoJobBody } from '../core/validate.js';
import type { HistoryFunctions, JobSystemState, SseFunctions } from './jobTypes.js';

function safeHostname(url: string | undefined) {
  if (!url) return undefined;
  try {
    return new URL(url).hostname;
  } catch {
    return undefined;
  }
}

function getRequestUser(req: Request) {
  return {
    id: (req as any).user?.id ?? 'anon',
    username: (req as any).user?.username,
    plan: (req as any).user?.plan ?? 'FREE',
    planExpiresAt: (req as any).user?.planExpiresAt ?? undefined,
  } as const;
}

function ensureUrlAllowed(url: string, cfg: AppConfig, requestUserId: string, jobType: string) {
  if (!isUrlAllowed(url, cfg)) {
    audit('job_request_rejected', {
      jobType,
      reason: 'url_not_allowed',
      userId: requestUserId,
      host: safeHostname(url),
    });
    return false;
  }
  return true;
}

function auditRejection(jobType: string, reason: string, userId: string, host?: string, extras: Record<string, unknown> = {}) {
  audit('job_request_rejected', {
    jobType,
    reason,
    userId,
    ...(host ? { host } : {}),
    ...extras,
  });
}

export type JobStartDeps = {
  cfg: AppConfig;
  log: Logger;
  history: HistoryFunctions;
  sse: SseFunctions;
  jobState: Pick<JobSystemState, 'jobs' | 'running' | 'waiting' | 'schedule' | 'finalizeJob'>;
  env: { PROXY_URL?: string; MIN_FREE_DISK_BYTES: number; ffmpegEnabled?: () => boolean };
};

type SharedContext = JobStartDeps & {
  requestUser: ReturnType<typeof getRequestUser>;
  req: Request;
  res: Response;
};

function handleSsrGuardError(error: any, ctx: SharedContext, jobType: string, sourceUrl: string) {
  auditRejection(jobType, 'ssrf_blocked', ctx.requestUser.id, safeHostname(sourceUrl), {
    detail: error?.code || error?.message,
  });
  ctx.res.status(400).json({ error: 'invalid_url' });
}

function respondInsufficientStorage(ctx: SharedContext, jobType: string, host?: string) {
  auditRejection(jobType, 'insufficient_storage', ctx.requestUser.id, host);
  ctx.res.status(507).json({ error: 'INSUFFICIENT_STORAGE' });
}

function makeAppendHistory(ctx: JobStartDeps) {
  const { history } = ctx;
  return history.appendHistory;
}

export function createVideoJobStartHandler(deps: JobStartDeps) {
  const { cfg, log, history, sse, jobState, env } = deps;
  const appendHistory = makeAppendHistory(deps);

  return async (req: Request, res: Response) => {
    const requestUser = getRequestUser(req);

    const parsed = StartVideoJobBody.safeParse(req.body ?? {});
    if (!parsed.success) {
      const issues = parsed.error.issues.map((issue) => issue.path.join('.') || '<root>');
      const hasUrlIssue = parsed.error.issues.some((issue) => issue.path.includes('url'));
      const error = hasUrlIssue ? 'invalid_url' : 'invalid_body';
      audit('job_request_rejected', {
        jobType: 'video',
        reason: error,
        userId: requestUser.id,
        issues,
      });
      return res.status(400).json({ error });
    }

    const { url: sourceUrl, title } = parsed.data;
    if (!ensureUrlAllowed(sourceUrl, cfg, requestUser.id, 'video')) {
      return res.status(400).json({ error: 'invalid_url' });
    }

    try {
      await assertPublicHttpHost(sourceUrl);
    } catch (err: any) {
      handleSsrGuardError(err, { ...deps, requestUser, req, res }, 'video', sourceUrl);
      return;
    }

    try {
      const policyAtQueue = policyFor(requestUser.plan);
      const sourceHost = safeHostname(sourceUrl);
      const jobTitle = title ?? 'video';

      const tmpDir = os.tmpdir();
      const tmpId = randomUUID();
      const outPath = path.join(fs.realpathSync(tmpDir), `${tmpId}.%(ext)s`);

      try {
        assertFreeSpace(tmpDir, env.MIN_FREE_DISK_BYTES);
      } catch (err: any) {
        respondInsufficientStorage({ ...deps, requestUser, req, res }, 'video', sourceHost);
        return;
      }

      const hist = appendHistory({
        userId: requestUser.id,
        title: jobTitle,
        url: sourceUrl,
        type: 'video',
        format: 'MP4',
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
      jobState.jobs.set(hist.id, job);
      sse.emitProgress(hist.id, { progress: 0, stage: 'queued' });

      audit('job_enqueued', {
        jobType: 'video',
        jobId: hist.id,
        userId: requestUser.id,
        host: sourceHost,
      });

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
          proxy: env.PROXY_URL,
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
          running: jobState.running,
          readHistory: history.readHistory,
          updateHistory: history.updateHistory,
          clearHistoryThrottle: history.clearHistoryThrottle,
          updateHistoryThrottled: history.updateHistoryThrottled,
          emitProgress: sse.emitProgress,
          finalizeJob: jobState.finalizeJob,
          schedule: jobState.schedule,
        },
        progressHints: { merging: true },
      });

      jobState.waiting.push({ job, run });
      jobState.schedule();
      return res.json({ id: hist.id });
    } catch (err: any) {
      log.error('job_start_best_failed', err?.message || err);
      return res.status(500).json({ error: 'job_start_failed' });
    }
  };
}

export function createAudioJobStartHandler(deps: JobStartDeps) {
  const { cfg, log, history, sse, jobState, env } = deps;
  const appendHistory = makeAppendHistory(deps);

  return async (req: Request, res: Response) => {
    const requestUser = getRequestUser(req);

    const parsed = StartAudioJobBody.safeParse(req.body ?? {});
    if (!parsed.success) {
      const issues = parsed.error.issues.map((issue) => issue.path.join('.') || '<root>');
      const hasUrlIssue = parsed.error.issues.some((issue) => issue.path.includes('url'));
      const hasFormatIssue = parsed.error.issues.some((issue) => issue.path.includes('format'));
      const error = hasUrlIssue ? 'invalid_url' : hasFormatIssue ? 'invalid_format' : 'invalid_body';
      audit('job_request_rejected', {
        jobType: 'audio',
        reason: error,
        userId: requestUser.id,
        issues,
      });
      return res.status(400).json({ error });
    }

    const { url: sourceUrl, title, format } = parsed.data;
    if (!ensureUrlAllowed(sourceUrl, cfg, requestUser.id, 'audio')) {
      return res.status(400).json({ error: 'invalid_url' });
    }

    try {
      await assertPublicHttpHost(sourceUrl);
    } catch (err: any) {
      handleSsrGuardError(err, { ...deps, requestUser, req, res }, 'audio', sourceUrl);
      return;
    }

    const fmt = coerceAudioFormat(format ?? DEFAULT_AUDIO_FORMAT, DEFAULT_AUDIO_FORMAT);
    if (!fmt) {
      auditRejection('audio', 'invalid_format', requestUser.id, safeHostname(sourceUrl));
      return res.status(400).json({ error: 'invalid_format' });
    }

    try {
      const policyAtQueue = policyFor(requestUser.plan);
      const sourceHost = safeHostname(sourceUrl);
      const jobTitle = title ?? 'audio';

      const tmpDir = os.tmpdir();
      const tmpId = randomUUID();
      const outPath = path.join(fs.realpathSync(tmpDir), `${tmpId}.%(ext)s`);

      try {
        const free = getFreeDiskBytes(tmpDir);
        if (env.MIN_FREE_DISK_BYTES > 0 && free > -1 && free < env.MIN_FREE_DISK_BYTES) {
          respondInsufficientStorage({ ...deps, requestUser, req, res }, 'audio', sourceHost ?? undefined);
          return;
        }
      } catch {}

      const hist = appendHistory({
        userId: requestUser.id,
        title: jobTitle,
        url: sourceUrl,
        type: 'audio',
        format: fmt.toUpperCase(),
        status: 'queued',
      });
      const job: Job = {
        id: hist.id,
        type: 'audio',
        tmpId,
        tmpDir,
        userId: requestUser.id,
        concurrencyCap: policyAtQueue.concurrentJobs,
        version: 1,
      };
      jobState.jobs.set(hist.id, job);
      sse.emitProgress(hist.id, { progress: 0, stage: 'queued' });

      audit('job_enqueued', {
        jobType: 'audio',
        jobId: hist.id,
        userId: requestUser.id,
        host: sourceHost,
        format: fmt,
      });

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
          proxy: env.PROXY_URL,
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
          running: jobState.running,
          readHistory: history.readHistory,
          updateHistory: history.updateHistory,
          clearHistoryThrottle: history.clearHistoryThrottle,
          updateHistoryThrottled: history.updateHistoryThrottled,
          emitProgress: sse.emitProgress,
          finalizeJob: jobState.finalizeJob,
          schedule: jobState.schedule,
        },
        progressHints: { converting: true },
      });

      jobState.waiting.push({ job, run });
      jobState.schedule();
      return res.json({ id: hist.id });
    } catch (err: any) {
      log.error('job_start_audio_failed', err?.message || err);
      return res.status(500).json({ error: 'job_start_failed' });
    }
  };
}

export function createClipJobStartHandler(deps: JobStartDeps) {
  const { cfg, log, history, sse, jobState, env } = deps;
  const appendHistory = makeAppendHistory(deps);

  return async (req: Request, res: Response) => {
    const requestUser = getRequestUser(req);

    const parsed = StartClipJobBody.safeParse(req.body ?? {});
    if (!parsed.success) {
      const issues = parsed.error.issues.map((issue) => issue.path.join('.') || '<root>');
      const hasUrlIssue = parsed.error.issues.some((issue) => issue.path.includes('url'));
      const hasRangeIssue = parsed.error.issues.some((issue) => issue.path.some((p) => p === 'start' || p === 'end'));
      const error = hasUrlIssue ? 'invalid_url' : hasRangeIssue ? 'invalid_range' : 'invalid_body';
      audit('job_request_rejected', {
        jobType: 'clip',
        reason: error,
        userId: requestUser.id,
        issues,
      });
      return res.status(400).json({ error });
    }

    const { url: sourceUrl, title, start, end } = parsed.data;
    if (!ensureUrlAllowed(sourceUrl, cfg, requestUser.id, 'clip')) {
      return res.status(400).json({ error: 'invalid_url' });
    }

    try {
      await assertPublicHttpHost(sourceUrl);
    } catch (err: any) {
      handleSsrGuardError(err, { ...deps, requestUser, req, res }, 'clip', sourceUrl);
      return;
    }

    try {
      const policyAtQueue = policyFor(requestUser.plan);
      const sourceHost = safeHostname(sourceUrl);
      const jobTitle = title ?? 'clip';
      const section = `${Math.max(0, Math.floor(start))}-${Math.floor(end)}`;

      const tmpDir = os.tmpdir();
      const tmpId = randomUUID();
      const outPath = path.join(fs.realpathSync(tmpDir), `${tmpId}.%(ext)s`);

      try {
        assertFreeSpace(tmpDir, env.MIN_FREE_DISK_BYTES);
      } catch (err: any) {
        respondInsufficientStorage({ ...deps, requestUser, req, res }, 'clip', sourceHost);
        return;
      }

      const hist = appendHistory({
        userId: requestUser.id,
        title: jobTitle,
        url: sourceUrl,
        type: 'video',
        format: 'MP4',
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
      jobState.jobs.set(hist.id, job);
      sse.emitProgress(hist.id, { progress: 0, stage: 'queued' });

      audit('job_enqueued', {
        jobType: 'clip',
        jobId: hist.id,
        userId: requestUser.id,
        host: sourceHost,
        section,
      });

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
          proxy: env.PROXY_URL,
          limitRate: chosenLimitRateK(policyAtQueue.speedLimitKbps),
          ...(cfg.maxFileSizeMb ? { maxFilesize: `${cfg.maxFileSizeMb}M` } : {}),
          ...(cfg.maxDurationSec ? { matchFilter: `duration <= ${cfg.maxDurationSec}` } : {}),
          ...ytDlpArgsFromPolicy(policyAtQueue),
          ...speedyDlArgs(),
          downloadSections: `${Math.max(0, start)}-${end}`,
        },
        producedExts: ['.mp4', '.mkv', '.webm'],
        log,
        logPrefix: 'job_spawn_clip',
        state: {
          running: jobState.running,
          readHistory: history.readHistory,
          updateHistory: history.updateHistory,
          clearHistoryThrottle: history.clearHistoryThrottle,
          updateHistoryThrottled: history.updateHistoryThrottled,
          emitProgress: sse.emitProgress,
          finalizeJob: jobState.finalizeJob,
          schedule: jobState.schedule,
        },
        progressHints: { merging: true },
      });

      jobState.waiting.push({ job, run });
      jobState.schedule();
      return res.json({ id: hist.id });
    } catch (err: any) {
      log.error('job_start_clip_failed', err?.message || err);
      return res.status(500).json({ error: 'job_start_failed' });
    }
  };
}

export function createEmbedSubsJobStartHandler(deps: JobStartDeps) {
  const { cfg, log, history, sse, jobState, env } = deps;
  const appendHistory = makeAppendHistory(deps);

  return async (req: Request, res: Response) => {
    const requestUser = getRequestUser(req);

    if (env.ffmpegEnabled && !env.ffmpegEnabled()) {
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

    if (!sourceUrl || !/^https?:\/\//i.test(sourceUrl)) {
      auditRejection('embed-subs', 'invalid_url', requestUser.id, safeHostname(sourceUrl));
      return res.status(400).json({ error: 'invalid_url' });
    }

    if (!ensureUrlAllowed(sourceUrl, cfg, requestUser.id, 'embed-subs')) {
      return res.status(400).json({ error: 'invalid_url' });
    }

    try {
      await assertPublicHttpHost(sourceUrl);
    } catch (err: any) {
      handleSsrGuardError(err, { ...deps, requestUser, req, res }, 'embed-subs', sourceUrl);
      return;
    }

    if (!lang) {
      auditRejection('embed-subs', 'missing_lang', requestUser.id, safeHostname(sourceUrl));
      return res.status(400).json({ error: 'missing_lang' });
    }

    try {
      const policyAtQueue = policyFor(requestUser.plan);
      const sourceHost = safeHostname(sourceUrl);
      const fmt = /^(srt|vtt)$/i.test(String(format)) ? String(format).toLowerCase() : 'srt';
      const cont = /^(mp4|mkv|webm)$/i.test(String(container)) ? String(container).toLowerCase() : 'mp4';

      const tmpDir = os.tmpdir();
      const tmpId = randomUUID();
      const outPath = path.join(fs.realpathSync(tmpDir), `${tmpId}.%(ext)s`);

      try {
        assertFreeSpace(tmpDir, env.MIN_FREE_DISK_BYTES);
      } catch (err: any) {
        respondInsufficientStorage({ ...deps, requestUser, req, res }, 'embed-subs', sourceHost);
        return;
      }

      const hist = appendHistory({
        userId: requestUser.id,
        title,
        url: sourceUrl,
        type: 'video',
        format: cont.toUpperCase(),
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
      jobState.jobs.set(hist.id, job);
      sse.emitProgress(hist.id, { progress: 0, stage: 'queued' });

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
          proxy: env.PROXY_URL,
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
          running: jobState.running,
          readHistory: history.readHistory,
          updateHistory: history.updateHistory,
          clearHistoryThrottle: history.clearHistoryThrottle,
          updateHistoryThrottled: history.updateHistoryThrottled,
          emitProgress: sse.emitProgress,
          finalizeJob: jobState.finalizeJob,
          schedule: jobState.schedule,
        },
        progressHints: { embedding: true },
      });

      jobState.waiting.push({ job, run });
      jobState.schedule();
      return res.json({ id: hist.id });
    } catch (err: any) {
      log.error('job_start_embed_subs_failed', err?.message || err);
      return res.status(500).json({ error: 'job_start_failed' });
    }
  };
}

export function createConvertJobStartHandler(deps: JobStartDeps) {
  const { cfg, log, history, sse, jobState, env } = deps;
  const appendHistory = makeAppendHistory(deps);

  return async (req: Request, res: Response) => {
    const requestUser = getRequestUser(req);

    if (env.ffmpegEnabled && !env.ffmpegEnabled()) {
      return res.status(501).json({ error: 'FFMPEG_REQUIRED', message: 'Format conversion requires FFmpeg' });
    }

    const { url: sourceUrl, title = 'video', container = 'mp4' } = (req.body || {}) as {
      url?: string;
      title?: string;
      container?: string;
    };

    if (!sourceUrl || !/^https?:\/\//i.test(sourceUrl)) {
      auditRejection('convert', 'invalid_url', requestUser.id, safeHostname(sourceUrl));
      return res.status(400).json({ error: 'invalid_url' });
    }

    if (!ensureUrlAllowed(sourceUrl, cfg, requestUser.id, 'convert')) {
      return res.status(400).json({ error: 'invalid_url' });
    }

    try {
      await assertPublicHttpHost(sourceUrl);
    } catch (err: any) {
      handleSsrGuardError(err, { ...deps, requestUser, req, res }, 'convert', sourceUrl);
      return;
    }

    try {
      const policyAtQueue = policyFor(requestUser.plan);
      const sourceHost = safeHostname(sourceUrl);
      const fmt = String(container).toLowerCase();
      const valid = ['mp4', 'mkv', 'webm'];
      const mergeOut = valid.includes(fmt) ? fmt : 'mp4';

      const tmpDir = os.tmpdir();
      const tmpId = randomUUID();
      const outPath = path.join(fs.realpathSync(tmpDir), `${tmpId}.%(ext)s`);

      try {
        assertFreeSpace(tmpDir, env.MIN_FREE_DISK_BYTES);
      } catch (err: any) {
        respondInsufficientStorage({ ...deps, requestUser, req, res }, 'convert', sourceHost);
        return;
      }

      const hist = appendHistory({
        userId: requestUser.id,
        title,
        url: sourceUrl,
        type: 'video',
        format: mergeOut.toUpperCase(),
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
      jobState.jobs.set(hist.id, job);
      sse.emitProgress(hist.id, { progress: 0, stage: 'queued' });

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
          proxy: env.PROXY_URL,
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
          running: jobState.running,
          readHistory: history.readHistory,
          updateHistory: history.updateHistory,
          clearHistoryThrottle: history.clearHistoryThrottle,
          updateHistoryThrottled: history.updateHistoryThrottled,
          emitProgress: sse.emitProgress,
          finalizeJob: jobState.finalizeJob,
          schedule: jobState.schedule,
        },
        progressHints: { merging: true },
      });

      jobState.waiting.push({ job, run });
      jobState.schedule();
      return res.json({ id: hist.id });
    } catch (err: any) {
      log.error('job_start_convert_failed', err?.message || err);
      return res.status(500).json({ error: 'job_start_failed' });
    }
  };
}
