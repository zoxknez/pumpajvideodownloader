import type { Response } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import type { Logger } from './logger.js';
import type { Job } from './jobHelpers.js';

export type WaitingItem = { job: Job; run: () => void };

export type JobTerminalStatus = 'completed' | 'failed' | 'canceled';

export type FinalizeJobOptions = {
  job?: Job;
  keepJob?: boolean;
  keepFiles?: boolean;
  removeListeners?: boolean;
  reason?: 'ok' | 'revoked' | 'timeout' | 'error' | 'user_cancel';
  extra?: Record<string, unknown>;
};

export type JobState = ReturnType<typeof createJobState>;

type CreateJobStateDeps = {
  log: Logger;
  getMaxConcurrent: () => number;
  updateHistory: (id: string, updates: any) => void;
};

const SSE_BUFFER_SIZE = 20;

function bumpJobVersion(job?: Job) {
  if (!job) return;
  const current = Number.isFinite(job.version) ? job.version : 0;
  job.version = Math.max(1, current + 1);
}

export function cleanupJobFiles(job: Job) {
  bumpJobVersion(job);
  try {
    const list = fs.readdirSync(job.tmpDir);
    for (const filename of list) {
      if (filename.startsWith(job.tmpId + '.')) {
        const full = path.join(job.tmpDir, filename);
        try {
          fs.unlinkSync(full);
        } catch {}
      }
    }
  } catch {}
}

export function createJobState(deps: CreateJobStateDeps) {
  const { log, getMaxConcurrent, updateHistory } = deps;

  const jobs = new Map<string, Job>();
  const waiting: WaitingItem[] = [];
  const running = new Set<string>();

  const sseListeners = new Map<string, Set<Response>>();
  const sseBuffers = new Map<string, string[]>();
  const sseEventCounters = new Map<string, number>();

  const lastPctWritten = new Map<string, number>();

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

  function pushSse(id: string, payload: any, event?: string, explicitId?: number) {
    let eventId: number;
    if (explicitId !== undefined) {
      eventId = explicitId;
    } else {
      const current = sseEventCounters.get(id) ?? 0;
      eventId = current + 1;
      sseEventCounters.set(id, eventId);
    }

    const frame = `${event ? `event: ${event}\n` : ''}id: ${eventId}\n` + `data: ${JSON.stringify(payload)}\n\n`;
    let buffer = sseBuffers.get(id);
    if (!buffer) {
      buffer = [];
      sseBuffers.set(id, buffer);
    }
    buffer.push(frame);
    if (buffer.length > SSE_BUFFER_SIZE) buffer.shift();

    const listeners = sseListeners.get(id);
    if (listeners && listeners.size > 0) {
      for (const res of Array.from(listeners)) {
        try {
          res.write(frame);
        } catch {
          try {
            res.end();
          } catch {}
          try {
            listeners.delete(res);
          } catch {}
        }
      }
      if (listeners.size === 0) sseListeners.delete(id);
    }

    return eventId;
  }

  function emitProgress(id: string, data: any) {
    pushSse(id, { id, ...data });
  }

  function clearHistoryThrottle(id: string) {
    lastPctWritten.delete(id);
  }

  function updateHistoryThrottled(id: string, pct?: number, extra?: Record<string, any>) {
    try {
      let shouldUpdate = true;
      if (typeof pct === 'number') {
        const previous = lastPctWritten.get(id) ?? -1;
        const currentStep = Math.floor(pct);
        if (currentStep === previous) {
          shouldUpdate = false;
        } else {
          lastPctWritten.set(id, currentStep);
        }
      }
      if (shouldUpdate) {
        updateHistory(id, {
          ...(typeof pct === 'number' ? { progress: pct } : {}),
          ...(extra || {}),
        });
      }
    } catch {}
  }

  function finalizeJob(id: string, status: JobTerminalStatus, options: FinalizeJobOptions = {}) {
    const {
      job: providedJob,
      keepJob = status === 'completed',
      keepFiles = status === 'completed',
      removeListeners = true,
      reason = status === 'completed' ? 'ok' : status === 'canceled' ? 'user_cancel' : 'error',
      extra,
    } = options;

    const job = providedJob ?? jobs.get(id);

    try {
      clearHistoryThrottle(id);
    } catch {}

    pushSse(id, { id, status, reason, ...(extra || {}) }, 'end');

    if (removeListeners) {
      const listeners = sseListeners.get(id);
      if (listeners) {
        for (const res of Array.from(listeners)) {
          try {
            res.end();
          } catch {}
          try {
            listeners.delete(res);
          } catch {}
        }
        if (listeners.size === 0) {
          try {
            sseListeners.delete(id);
          } catch {}
        }
      }
      try {
        sseEventCounters.delete(id);
      } catch {}
    }

    if (job) {
      try {
        bumpJobVersion(job);
      } catch {}
    }

    if (!keepFiles && job) {
      try {
        cleanupJobFiles(job);
      } catch {}
    }

    if (!keepJob) {
      try {
        jobs.delete(id);
      } catch {}
    }

    try {
      sseBuffers.delete(id);
    } catch {}

    try {
      running.delete(id);
    } catch {}
  }

  function endSseFor(id: string, status: JobTerminalStatus = 'completed') {
    try {
      pushSse(id, { id, status }, 'end');
      const listeners = sseListeners.get(id);
      if (listeners) {
        for (const res of Array.from(listeners)) {
          try {
            res.end();
          } catch {}
          try {
            listeners.delete(res);
          } catch {}
        }
        if (listeners.size === 0) {
          try {
            sseListeners.delete(id);
          } catch {}
        }
      }
      sseBuffers.delete(id);
      clearHistoryThrottle(id);
    } catch (err) {
      log.error('job_state_end_sse_failed', { id, error: String(err) });
    }
  }

  function schedule() {
    const runningCountFor = (uid?: string) => {
      if (!uid) return 0;
      let count = 0;
      for (const jobId of running) {
        const job = jobs.get(jobId);
        if (job?.userId === uid) count += 1;
      }
      return count;
    };

    const maxConcurrent = Math.max(1, Number(getMaxConcurrent()) || 1);

    while (running.size < maxConcurrent && waiting.length > 0) {
      const idx = waiting.findIndex(({ job }) => {
        const cap = Math.max(1, Number(job.concurrencyCap || 1));
        return runningCountFor(job.userId) < cap;
      });
      if (idx < 0) break;
      const next = waiting.splice(idx, 1)[0]!;
      running.add(next.job.id);
      updateHistory(next.job.id, { status: 'in-progress' });
      emitProgress(next.job.id, { progress: 0, stage: 'starting' });
      try {
        next.run();
      } catch (err) {
        running.delete(next.job.id);
        updateHistory(next.job.id, { status: 'failed' });
        emitProgress(next.job.id, { stage: 'failed' });
        log.error('job_state_run_failed', err instanceof Error ? err.message : String(err));
      }
    }
  }

  return {
    jobs,
    waiting,
    running,
    sseListeners,
    sseBuffers,
    addSseListener,
    removeSseListener,
    pushSse,
    emitProgress,
    updateHistoryThrottled,
    clearHistoryThrottle,
    finalizeJob,
    endSseFor,
    schedule,
  };
}

export type JobStateHandle = ReturnType<typeof createJobState>;

export type CleanupJobFilesFn = typeof cleanupJobFiles;

export type FinalizeJobFn = JobStateHandle['finalizeJob'];
export type ScheduleJobsFn = JobStateHandle['schedule'];
export type EmitProgressFn = JobStateHandle['emitProgress'];
export type PushSseFn = JobStateHandle['pushSse'];
export type AddSseListenerFn = JobStateHandle['addSseListener'];
export type RemoveSseListenerFn = JobStateHandle['removeSseListener'];
export type UpdateHistoryThrottledFn = JobStateHandle['updateHistoryThrottled'];
export type ClearHistoryThrottleFn = JobStateHandle['clearHistoryThrottle'];
