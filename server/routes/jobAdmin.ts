import type { Request, Response } from 'express';
import fs from 'node:fs';
import type { Logger } from '../core/logger.js';
import type { Job } from '../core/jobHelpers.js';
import type { WaitingItem } from '../core/jobState.js';

export type JobStateRef = {
  jobs: Map<string, Job>;
  waiting: WaitingItem[];
  running: Set<string>;
};

export type JobSettingsState = {
  getMaxConcurrent: () => number;
  setMaxConcurrent: (value: number) => void;
  getProxyUrl: () => string | undefined;
  setProxyUrl: (value: string | undefined) => void;
  getLimitRate: () => number | undefined;
  setLimitRate: (value: number | undefined) => void;
};

type PersistenceFns = {
  writeServerSettings: (settings: { maxConcurrent: number; proxyUrl?: string; limitRateKbps?: number }) => void;
};

type SchedulerFns = {
  schedule: () => void;
};

type CleanupFn = (job: Job) => void;

export type JobAdminDeps = {
  jobState: JobStateRef & SchedulerFns;
  settings: JobSettingsState;
  persistence: PersistenceFns;
  cleanupJobFiles: CleanupFn;
  sseListeners: Map<string, Set<Response>>;
};

export function setupJobAdminRoutes(app: any, requireAuth: any, log: Logger, deps: JobAdminDeps) {
  const {
    jobState: { jobs, waiting, running, schedule },
    settings,
    persistence,
    cleanupJobFiles,
    sseListeners,
  } = deps;

  app.get('/api/jobs/metrics', requireAuth as any, (_req: Request, res: Response) => {
    res.json({ running: running.size, queued: waiting.length, maxConcurrent: settings.getMaxConcurrent() });
  });

  app.get('/api/job/list', requireAuth as any, (req: Request, res: Response) => {
    const userId = (req as any).user?.id;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const userJobs: Array<{ id: string; type: Job['type']; status: 'running' | 'queued'; tmpId: string }> = [];

    for (const jobId of running) {
      const job = jobs.get(jobId);
      if (job && job.userId === userId) {
        userJobs.push({ id: job.id, type: job.type, status: 'running', tmpId: job.tmpId });
      }
    }

    for (const waitingItem of waiting) {
      if (waitingItem.job.userId === userId) {
        userJobs.push({ id: waitingItem.job.id, type: waitingItem.job.type, status: 'queued', tmpId: waitingItem.job.tmpId });
      }
    }

    res.json({ jobs: userJobs });
  });

  app.get('/api/jobs/settings', requireAuth as any, (_req: Request, res: Response) => {
    res.json({
      maxConcurrent: settings.getMaxConcurrent(),
      proxyUrl: settings.getProxyUrl() || '',
      limitRateKbps: settings.getLimitRate() ?? 0,
    });
  });

  app.post('/api/jobs/settings', requireAuth as any, (req: Request, res: Response) => {
    try {
      const body = (req.body || {}) as {
        maxConcurrent?: number;
        proxyUrl?: string;
        limitRateKbps?: number;
      };
      const n = Number(body.maxConcurrent);
      if (!Number.isFinite(n)) return res.status(400).json({ error: 'invalid_number' });

      const clamped = Math.max(1, Math.min(6, Math.floor(n)));
      settings.setMaxConcurrent(clamped);

      if (typeof body.proxyUrl === 'string') {
        const normalized = body.proxyUrl.trim();
        settings.setProxyUrl(normalized ? normalized : undefined);
      }

      if (Number.isFinite(body.limitRateKbps) && Number(body.limitRateKbps) >= 0) {
        settings.setLimitRate(Math.floor(Number(body.limitRateKbps)));
      }

      persistence.writeServerSettings({
        maxConcurrent: settings.getMaxConcurrent(),
        proxyUrl: settings.getProxyUrl(),
        limitRateKbps: settings.getLimitRate(),
      });
      schedule();
      res.json({
        ok: true,
        maxConcurrent: settings.getMaxConcurrent(),
        proxyUrl: settings.getProxyUrl() || '',
        limitRateKbps: settings.getLimitRate() ?? 0,
      });
    } catch (err) {
      log.error('jobs_settings_update_failed', { error: String(err) });
      res.status(500).json({ error: 'update_failed' });
    }
  });

  app.post('/api/jobs/settings/reset', requireAuth as any, (_req: Request, res: Response) => {
    try {
      settings.setMaxConcurrent(2);
      settings.setProxyUrl(undefined);
      settings.setLimitRate(0);
      persistence.writeServerSettings({ maxConcurrent: 2, proxyUrl: '', limitRateKbps: 0 });
      schedule();
      res.json({ ok: true, maxConcurrent: settings.getMaxConcurrent(), proxyUrl: '', limitRateKbps: settings.getLimitRate() ?? 0 });
    } catch (err) {
      log.error('jobs_settings_reset_failed', { error: String(err) });
      res.status(500).json({ error: 'reset_failed' });
    }
  });

  app.post('/api/jobs/cleanup-temp', requireAuth as any, (_req: Request, res: Response) => {
    let removed = 0;
    for (const job of jobs.values()) {
      try {
        const before = fs.readdirSync(job.tmpDir).filter((f) => f.startsWith(job.tmpId + '.')).length;
        cleanupJobFiles(job);
        const after = fs.readdirSync(job.tmpDir).filter((f) => f.startsWith(job.tmpId + '.')).length;
        removed += Math.max(0, before - after);
      } catch {}
    }
    res.json({ ok: true, removed });
  });

  app.get('/api/metrics', requireAuth as any, (_req: Request, res: Response) => {
    let listeners = 0;
    for (const set of sseListeners.values()) {
      listeners += set.size;
    }
    res.json({ running: running.size, queued: waiting.length, listeners });
  });
}
