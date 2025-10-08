/**
 * Job queue routes (background processing)
 * Handles /api/job/start/*, /api/job/cancel, /api/jobs/cancel-all, /api/job/file/:id
 */

import type { Response, Request } from 'express';
import type { AppConfig } from '../core/config.js';
import type { Logger } from '../core/logger.js';
import {
  createAudioJobStartHandler,
  createClipJobStartHandler,
  createConvertJobStartHandler,
  createEmbedSubsJobStartHandler,
  createVideoJobStartHandler,
  type JobStartDeps,
} from './jobStartHandlers.js';
import type { HistoryFunctions, JobSystemState, SseFunctions } from './jobTypes.js';

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
  env: { PROXY_URL?: string; MIN_FREE_DISK_BYTES: number; ffmpegEnabled?: () => boolean }
) {
  const { appendHistory, updateHistory, updateHistoryThrottled, clearHistoryThrottle, readHistory } = historyFns;
  const { emitProgress } = sseFns;
  const { jobs, running, waiting, schedule, finalizeJob } = jobSystem;
  const { PROXY_URL, MIN_FREE_DISK_BYTES, ffmpegEnabled } = env;
  const jobStartDeps: JobStartDeps = {
    cfg,
    log,
    history: { appendHistory, updateHistory, updateHistoryThrottled, clearHistoryThrottle, readHistory },
    sse: { emitProgress },
    jobState: { jobs, running, waiting, schedule, finalizeJob },
    env: { PROXY_URL, MIN_FREE_DISK_BYTES, ffmpegEnabled },
  };

  app.post('/api/job/start/best', requireAuth as any, createVideoJobStartHandler(jobStartDeps));
  app.post('/api/job/start/audio', requireAuth as any, createAudioJobStartHandler(jobStartDeps));
  app.post('/api/job/start/clip', requireAuth as any, createClipJobStartHandler(jobStartDeps));

  // ========================
  // NOTE: GET /api/job/file/:id is handled in main server.ts (index.ts)
  // Central implementation includes: ETag, 304 Not Modified, suffix-range support,
  // proper Range validation, Vary: Authorization, and file cleanup after download.
  // Do not duplicate here to avoid route shadowing and inconsistent behavior.
  // ========================

  // ========================
  // POST /api/job/start/embed-subs (embed subtitles)
  // ========================
  app.post('/api/job/start/embed-subs', requireAuth as any, createEmbedSubsJobStartHandler(jobStartDeps));

  // ========================
  // POST /api/job/start/convert (format conversion)
  // ========================
  app.post('/api/job/start/convert', requireAuth as any, createConvertJobStartHandler(jobStartDeps));

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
