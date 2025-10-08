import type { Request, Response } from 'express';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import ytdlp from 'youtube-dl-exec';

import { policyFor } from '../core/policy.js';
import { isUrlAllowed } from '../core/urlAllow.js';
import { assertPublicHttpHost } from '../core/ssrfGuard.js';
import { normalizeYtError } from '../core/errors.js';
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
  DEFAULT_AUDIO_FORMAT,
  cleanedChildEnv,
} from '../core/ytHelpers.js';
import { ytDlpArgsFromPolicy } from '../core/policyEnforce.js';
import type { AppConfig } from '../core/config.js';
import type { Logger } from '../core/logger.js';
import type { Job } from '../core/jobHelpers.js';
import { assertFreeSpace } from '../core/jobHelpers.js';
import type { FinalizeJobFn } from '../core/jobState.js';
import { safeKill } from '../core/http.js';

export type BatchMode = 'video' | 'audio';

export type BatchItem = { url: string; jobId: string };

export type BatchRecord = {
  id: string;
  userId?: string;
  createdAt: number;
  finishedAt?: number;
  mode: BatchMode;
  format?: string;
  items: BatchItem[];
};

export type BatchHistoryFns = {
  appendHistory: (item: any) => { id: string };
  updateHistory: (id: string, updates: any) => void;
  updateHistoryThrottled: (id: string, progress: number) => void;
  clearHistoryThrottle: (id: string) => void;
  readHistory: () => any[];
};

export type BatchSseFns = {
  emitProgress: (id: string, payload: any) => void;
};

export type BatchJobState = {
  jobs: Map<string, Job>;
  waiting: Array<{ job: Job; run: () => void }>;
  schedule: () => void;
  finalizeJob: FinalizeJobFn;
};

export type BatchEnv = {
  getProxyUrl: () => string | undefined;
  minFreeDiskBytes: () => number;
};

export type BatchModule = {
  getBatch(id: string): BatchRecord | undefined;
  getStats(): { total: number; active: number };
  pruneExpired(ttlMs: number, now?: number): number;
  values(): IterableIterator<BatchRecord>;
};

function summarizeBatch(batch: BatchRecord, readHistory: () => any[]) {
  const items = readHistory();
  let completed = 0;
  let failed = 0;
  let canceled = 0;
  let runningCt = 0;
  let queuedCt = 0;

  for (const item of batch.items) {
    const historyEntry = items.find((x) => x.id === item.jobId);
    switch (historyEntry?.status) {
      case 'completed':
        completed += 1;
        break;
      case 'failed':
        failed += 1;
        break;
      case 'canceled':
        canceled += 1;
        break;
      case 'in-progress':
        runningCt += 1;
        break;
      case 'queued':
        queuedCt += 1;
        break;
    }
  }

  const total = batch.items.length;
  const done = completed + failed + canceled;
  if (!batch.finishedAt && done === total) {
    batch.finishedAt = Date.now();
  }

  return {
    id: batch.id,
    userId: batch.userId,
    createdAt: batch.createdAt,
    finishedAt: batch.finishedAt || null,
    mode: batch.mode,
    format: batch.format,
    total,
    completed,
    failed,
    canceled,
    running: runningCt,
    queued: queuedCt,
    items: batch.items.map((it) => {
      const historyEntry = items.find((x) => x.id === it.jobId);
      return {
        url: it.url,
        jobId: it.jobId,
        status: historyEntry?.status || 'unknown',
        progress: historyEntry?.progress ?? 0,
      };
    }),
  };
}

export function setupBatchRoutes(
  app: any,
  requireAuth: any,
  batchRateLimit: any,
  cfg: AppConfig,
  log: Logger,
  historyFns: BatchHistoryFns,
  sseFns: BatchSseFns,
  jobState: BatchJobState,
  env: BatchEnv
): BatchModule {
  const batches = new Map<string, BatchRecord>();
  const { appendHistory, updateHistory, updateHistoryThrottled, clearHistoryThrottle, readHistory } = historyFns;
  const { emitProgress } = sseFns;
  const { jobs, waiting, schedule, finalizeJob } = jobState;

  const getProxyUrl = () => env.getProxyUrl();
  const getMinFreeBytes = () => Math.max(0, Number(env.minFreeDiskBytes() || 0));

  app.post('/api/batch', batchRateLimit, requireAuth as any, async (req: any, res: Response) => {
    try {
      const {
        urls,
        mode = 'video',
        audioFormat = DEFAULT_AUDIO_FORMAT,
        titleTemplate,
      } = (req.body || {}) as {
        urls?: string[];
        mode?: BatchMode;
        audioFormat?: string;
        titleTemplate?: string;
      };

      if (!Array.isArray(urls) || urls.length === 0) {
        return res.status(400).json({ error: 'missing_urls' });
      }

      const requestUser = {
        id: req.user?.id ?? 'anon',
        username: req.user?.username,
        plan: req.user?.plan ?? 'FREE',
        planExpiresAt: req.user?.planExpiresAt ?? undefined,
      } as const;

      const policy = policyFor(requestUser.plan);
      const normalized = Array.from(
        new Set(urls.map((u) => String(u || '').trim()).filter((u) => /^https?:\/\//i.test(u)))
      );

      const acceptedUrls: string[] = [];
      for (const url of normalized) {
        if (!isUrlAllowed(url, cfg)) {
          continue;
        }
        await assertPublicHttpHost(url);
        acceptedUrls.push(url);
      }

      if (acceptedUrls.length === 0) {
        return res.status(400).json({ error: 'no_valid_urls' });
      }

      if (acceptedUrls.length > policy.batchMax) {
        return res.status(400).json({ error: 'BATCH_LIMIT_EXCEEDED', limit: policy.batchMax });
      }

      let resolvedAudioFormat: string | undefined;
      if (mode === 'audio') {
        const resolved = coerceAudioFormat(audioFormat, DEFAULT_AUDIO_FORMAT);
        if (!resolved) {
          return res.status(400).json({ error: 'invalid_format' });
        }
        resolvedAudioFormat = resolved;
      }

      const batchId = randomUUID();
      const batchRecord: BatchRecord = {
        id: batchId,
        userId: requestUser.id,
        createdAt: Date.now(),
        mode,
        format: mode === 'audio' ? resolvedAudioFormat : undefined,
        items: [],
      };
      batches.set(batchId, batchRecord);

      for (const url of acceptedUrls) {
        const title = titleTemplate
          ? titleTemplate.replace(/\{index\}/g, String(batchRecord.items.length + 1))
          : mode === 'audio'
          ? 'audio'
          : 'video';

        const tmpDir = os.tmpdir();
        const tmpId = randomUUID();
        const outPath = path.join(fs.realpathSync(tmpDir), `${tmpId}.%(ext)s`);

        try {
          assertFreeSpace(tmpDir, getMinFreeBytes());
        } catch (err: any) {
          log.warn('batch_insufficient_storage', {
            url,
            message: err?.message || String(err),
          });
          continue;
        }

        const historyEntry = appendHistory({
          userId: requestUser.id,
          title,
          url,
          type: mode,
          format: mode === 'audio' ? String(resolvedAudioFormat).toUpperCase() : 'MP4',
          status: 'queued',
        });

        const job: Job = {
          id: historyEntry.id,
          type: mode,
          tmpId,
          tmpDir,
          userId: requestUser.id,
          concurrencyCap: policy.concurrentJobs,
          version: 1,
        };

        jobs.set(historyEntry.id, job);
        batchRecord.items.push({ url, jobId: historyEntry.id });
        emitProgress(historyEntry.id, { progress: 0, stage: 'queued', batchId });

        const run = () => {
          const policySnapshot = policy;
          const commonArgs: any = {
            output: outPath,
            addHeader: makeHeaders(url),
            restrictFilenames: true,
            noCheckCertificates: true,
            noWarnings: true,
            newline: true,
            proxy: getProxyUrl(),
            limitRate: chosenLimitRateK(policySnapshot.speedLimitKbps),
            ...(cfg.maxFileSizeMb ? { maxFilesize: `${cfg.maxFileSizeMb}M` } : {}),
            ...(cfg.maxDurationSec ? { matchFilter: `duration <= ${cfg.maxDurationSec}` } : {}),
            ...ytDlpArgsFromPolicy(policySnapshot),
            ...speedyDlArgs(),
          };

          let child: any;
          if (mode === 'audio' && resolvedAudioFormat) {
            child = (ytdlp as any).exec(
              url,
              {
                ...selectAudioFormat(resolvedAudioFormat),
                ...commonArgs,
              },
              { env: cleanedChildEnv(process.env) }
            );
          } else {
            child = (ytdlp as any).exec(
              url,
              {
                format: selectVideoFormat(policySnapshot),
                ...commonArgs,
              },
              { env: cleanedChildEnv(process.env) }
            );
          }

          job.child = child as any;
          trapChildPromise(
            child,
            mode === 'audio' ? 'yt_dlp_unhandled_batch_audio' : 'yt_dlp_unhandled_batch_video'
          );

          let stderrBuffer = '';
          const onProgress = (buffer: Buffer) => {
            const text = buffer.toString();
            const { pct, speed, eta } = parseDlLine(text);
            if (typeof pct === 'number') {
              updateHistoryThrottled(historyEntry.id, pct);
              emitProgress(historyEntry.id, {
                progress: pct,
                stage: 'downloading',
                speed,
                eta,
                batchId,
              });
            }

            if (
              hasProgressHint(text, [
                'merging formats',
                'merging',
                'extractaudio',
                'convert',
                'destination',
                'embedding subtitles',
              ])
            ) {
              emitProgress(historyEntry.id, {
                stage: mode === 'audio' ? 'converting' : 'processing',
                batchId,
              });
            }
          };

          const onStderr = (buffer: Buffer) => {
            stderrBuffer += buffer.toString();
            onProgress(buffer);
          };

          child.stdout?.on('data', onProgress);
          child.stderr?.on('data', onStderr);

          child.on('close', (code: number) => {
            let succeeded = false;
            try {
              const produced = findProducedFile(
                tmpDir,
                tmpId,
                mode === 'audio'
                  ? ['.mp3', '.m4a', '.aac', '.opus', '.flac', '.wav', '.ogg', '.oga', '.alac']
                  : ['.mp4', '.mkv', '.webm']
              );

              const completedAt = new Date().toISOString();

              if (code === 0 && produced) {
                job.produced = produced;
                const fullPath = path.join(tmpDir, produced);
                let sizeMb = 0;
                let sizeBytes: number | undefined;
                try {
                  const stats = fs.statSync(fullPath);
                  sizeBytes = stats.size;
                  sizeMb = Math.round(stats.size / 1024 / 1024);
                } catch {}

                updateHistory(historyEntry.id, {
                  status: 'completed',
                  progress: 100,
                  size: `${sizeMb} MB`,
                  sizeBytes,
                  completedAt,
                });
                clearHistoryThrottle(historyEntry.id);
                emitProgress(historyEntry.id, { progress: 100, stage: 'completed', batchId });
                finalizeJob(historyEntry.id, 'completed', { job, extra: { batchId } });
                succeeded = true;
              } else {
                const normalized = normalizeYtError(stderrBuffer);
                updateHistory(historyEntry.id, {
                  status: 'failed',
                  completedAt,
                  error: normalized.message,
                });
                clearHistoryThrottle(historyEntry.id);
                emitProgress(historyEntry.id, { stage: 'failed', batchId, error: normalized.message });
              }
            } catch (err) {
              log.error('batch_finalize_error', {
                jobId: historyEntry.id,
                error: err instanceof Error ? err.message : String(err),
              });
            }

            if (!succeeded) {
              const normalized = normalizeYtError(stderrBuffer);
              finalizeJob(historyEntry.id, 'failed', {
                job,
                keepJob: false,
                keepFiles: false,
                extra: {
                  batchId,
                  errorCode: normalized.code,
                  errorMessage: normalized.message,
                },
              });
            }

            schedule();
          });
        };

        waiting.push({ job, run });
      }

      schedule();
      return res.json({ batchId, total: batchRecord.items.length, items: batchRecord.items });
    } catch (error: any) {
      return res.status(500).json({ error: 'batch_create_failed', message: String(error?.message || error) });
    }
  });

  app.get('/api/batch/:id', requireAuth as any, (req: any, res: Response) => {
    const batch = batches.get(req.params.id);
    if (!batch) {
      return res.status(404).json({ error: 'not_found' });
    }

    if (batch.userId && batch.userId !== req.user?.id) {
      return res.status(403).json({ error: 'forbidden' });
    }

    return res.json(summarizeBatch(batch, readHistory));
  });

  app.post('/api/batch/:id/cancel', requireAuth as any, (req: any, res: Response) => {
    const batch = batches.get(req.params.id);
    if (!batch) {
      return res.status(404).json({ error: 'not_found' });
    }

    if (batch.userId && batch.userId !== req.user?.id) {
      return res.status(403).json({ error: 'forbidden' });
    }

    for (const item of batch.items) {
      const job = jobs.get(item.jobId);
      if (!job) {
        continue;
      }

      const queuedIdx = waiting.findIndex((entry) => entry.job.id === item.jobId);
      if (queuedIdx >= 0) {
        waiting.splice(queuedIdx, 1);
        updateHistory(item.jobId, { status: 'canceled' });
        emitProgress(item.jobId, { stage: 'canceled', batchId: batch.id });
        finalizeJob(item.jobId, 'canceled', {
          job,
          keepJob: false,
          keepFiles: false,
          extra: { batchId: batch.id },
        });
        continue;
      }

      safeKill(job.child);
      updateHistory(item.jobId, { status: 'canceled' });
      emitProgress(item.jobId, { stage: 'canceled', batchId: batch.id });
      finalizeJob(item.jobId, 'canceled', {
        job,
        keepJob: false,
        keepFiles: false,
        extra: { batchId: batch.id },
      });
    }

    batch.finishedAt = Date.now();
    return res.json({ ok: true });
  });

  return {
    getBatch: (id: string) => batches.get(id),
    values: () => batches.values(),
    getStats: () => {
      let active = 0;
      for (const batch of batches.values()) {
        if (!batch.finishedAt) {
          active += 1;
        }
      }
      return { total: batches.size, active };
    },
    pruneExpired: (ttlMs: number, now = Date.now()) => {
      let removed = 0;
      for (const [id, batch] of batches) {
        if (batch.finishedAt && now - batch.finishedAt > ttlMs) {
          batches.delete(id);
          removed += 1;
          const ageMinutes = Math.floor((now - batch.finishedAt) / 60000);
          log.debug('batch_reaped', { id, age: `${ageMinutes}min` });
        }
      }
      return removed;
    },
  };
}
