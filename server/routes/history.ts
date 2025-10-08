import fs from 'node:fs';
import path from 'node:path';
import type { Request, Response } from 'express';
import type { Logger } from '../core/logger.js';
import type { Job } from '../core/jobHelpers.js';
import type { FinalizeJobFn, WaitingItem } from '../core/jobState.js';
import { safeKill } from '../core/http.js';
import type { HistoryItem } from '../core/history.js';

type HistoryFunctions = {
  readHistory: () => HistoryItem[];
  updateHistory: (id: string, updates: Partial<HistoryItem>) => HistoryItem | null;
  removeHistory: (id: string, userId?: string) => HistoryItem[];
  clearHistory: (userId?: string) => void;
};

type JobStateDeps = {
  jobs: Map<string, Job>;
  waiting: WaitingItem[];
  finalizeJob: FinalizeJobFn;
};

type RouteDeps = HistoryFunctions & JobStateDeps;

export function setupHistoryRoutes(app: any, requireAuth: any, log: Logger, deps: RouteDeps) {
  const { readHistory, updateHistory, removeHistory, clearHistory, jobs, waiting, finalizeJob } = deps;

  app.get('/api/history', requireAuth as any, async (req: Request, res: Response) => {
    const userId = (req as any).user?.id;
    if (!userId) return res.status(401).json({ error: 'unauthorized' });

    try {
      const all = readHistory();
      const items = all
        .filter((item) => item.userId === userId || item.userId === 'legacy')
        .map((item) => {
          if (item.userId === 'legacy') {
            const migrated = updateHistory(item.id, { userId });
            if (migrated) return migrated;
            return { ...item, userId };
          }
          return item;
        })
        .sort((a, b) => new Date(b.downloadDate).getTime() - new Date(a.downloadDate).getTime())
        .map((item) => {
          const job = jobs.get(item.id);
          let canDownload = false;
          let sizeBytes = item.sizeBytes;
          if (job && job.userId === userId && job.produced) {
            try {
              const full = path.join(job.tmpDir, job.produced);
              if (fs.existsSync(full)) {
                canDownload = true;
                if (!sizeBytes) {
                  sizeBytes = fs.statSync(full).size;
                }
              }
            } catch {}
          }

          return {
            ...item,
            createdAt: item.downloadDate,
            canDownload,
            sizeBytes,
          };
        });

      res.json({ items });
    } catch (err) {
      log.error('history_fetch_failed', { error: String(err) });
      res.status(500).json({ error: 'history_failed' });
    }
  });

  app.delete('/api/history/:id', requireAuth as any, (req: Request, res: Response) => {
    try {
      const id = (req.params as any).id;
      const userId = (req as any).user?.id;
      if (!userId) return res.status(401).json({ error: 'unauthorized' });

      const job = jobs.get(id);
      if (job && job.userId === userId) {
        const idx = waiting.findIndex((w: WaitingItem) => w.job.id === id);
        if (idx >= 0) waiting.splice(idx, 1);
        safeKill((job as any).child);
        finalizeJob(id, 'canceled', { job, keepJob: false, keepFiles: false });
      }

      const remaining = removeHistory(id, userId);
      const removed = remaining.every((entry) => entry.id !== id);
      res.json({ ok: removed });
    } catch (err) {
      log.error('history_delete_failed', { error: String(err) });
      res.status(500).json({ error: 'delete_failed' });
    }
  });

  app.delete('/api/history', requireAuth as any, (req: Request, res: Response) => {
    try {
      const userId = (req as any).user?.id;
      if (!userId) return res.status(401).json({ error: 'unauthorized' });
      clearHistory(userId);
      res.json({ ok: true });
    } catch (err) {
      log.error('history_clear_failed', { error: String(err) });
      res.status(500).json({ error: 'clear_failed' });
    }
  });
}
