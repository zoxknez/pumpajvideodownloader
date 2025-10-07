/**
 * Job lifecycle helpers - DRY utilities for yt-dlp spawn/close patterns
 */

import type { ChildProcess } from 'node:child_process';
import ytdlp from 'youtube-dl-exec';
import {
  parseDlLine,
  hasProgressHint,
  trapChildPromise,
  findProducedFile,
  cleanedChildEnv,
} from './ytHelpers.js';
import type { Logger } from './logger.js';
import fs from 'node:fs';
import path from 'node:path';

export type Job = {
  id: string;
  type: 'video' | 'audio';
  tmpId: string;
  tmpDir: string;
  child?: ChildProcess & { killed?: boolean };
  produced?: string;
  userId?: string;
  concurrencyCap?: number;
  version: number;
};

export type JobSystemState = {
  running: Set<string>;
  readHistory: () => any[];
  updateHistory: (id: string, updates: any) => void;
  clearHistoryThrottle: (id: string) => void;
  updateHistoryThrottled: (id: string, progress: number) => void;
  emitProgress: (id: string, payload: any) => void;
  finalizeJob: (id: string, status: 'completed' | 'failed' | 'canceled', opts?: any) => void;
  schedule: () => void;
};

type SpawnYtDlpOptions = {
  url: string;
  ytdlpArgs: any;
  job: Job;
  log: Logger;
  logPrefix: string; // e.g., 'job_spawn_best'
};

type CloseHandlerOptions = {
  job: Job;
  tmpDir: string;
  tmpId: string;
  histId: string;
  producedExts: string[]; // e.g., ['.mp4', '.mkv', '.webm']
  log: Logger;
  running: Set<string>;
  readHistory: () => any[];
  updateHistory: (id: string, updates: any) => void;
  clearHistoryThrottle: (id: string) => void;
  emitProgress: (id: string, payload: any) => void;
  finalizeJob: (id: string, status: 'completed' | 'failed' | 'canceled', opts?: any) => void;
  schedule: () => void;
  extraEmit?: Record<string, unknown>; // e.g., { batchId: 'xxx' }
};

/**
 * Spawn yt-dlp child process with common error handling
 * Always uses cleanedChildEnv for security
 */
export function spawnYtDlp(opts: SpawnYtDlpOptions): ChildProcess {
  const { url, ytdlpArgs, job, log, logPrefix } = opts;
  
  log.info(logPrefix, `url=${url} user=${job.userId || 'anon'}`);
  
  const child = (ytdlp as any).exec(url, ytdlpArgs, { env: cleanedChildEnv(process.env) });
  job.child = child as any;
  trapChildPromise(child, `yt_dlp_unhandled_${logPrefix}`);
  
  return child;
}

/**
 * Common progress handler for yt-dlp stdout/stderr
 */
export function createProgressHandler(
  histId: string,
  updateHistoryThrottled: (id: string, progress: number) => void,
  emitProgress: (id: string, payload: any) => void,
  hints?: { merging?: boolean; converting?: boolean; embedding?: boolean }
) {
  return (buf: Buffer) => {
    const text = buf.toString();
    const { pct, speed, eta } = parseDlLine(text);
    
    if (typeof pct === 'number') {
      updateHistoryThrottled(histId, pct);
      emitProgress(histId, { progress: pct, stage: 'downloading', speed, eta });
    }
    
    // Stage hints
    if (hints?.merging && hasProgressHint(text, ['merging formats', 'merging'])) {
      emitProgress(histId, { progress: 95, stage: 'merging', speed, eta });
    }
    if (hints?.converting && hasProgressHint(text, ['extractaudio', 'destination', 'convert', 'merging'])) {
      emitProgress(histId, { progress: 90, stage: 'converting', speed, eta });
    }
    if (hints?.embedding && hasProgressHint(text, ['writing video subtitles', 'merging formats', 'merging', 'embedding subtitles'])) {
      emitProgress(histId, { progress: 95, stage: 'embedding', speed, eta });
    }
  };
}

/**
 * Common close handler for yt-dlp child process
 */
export function createCloseHandler(opts: CloseHandlerOptions) {
  const {
    job,
    tmpDir,
    tmpId,
    histId,
    producedExts,
    log,
    running,
    readHistory,
    updateHistory,
    clearHistoryThrottle,
    emitProgress,
    finalizeJob,
    schedule,
    extraEmit = {},
  } = opts;

  return (code: number) => {
    try {
      log.info('yt_dlp_close', `code=${code} jobId=${histId}`);
    } catch {}
    
    running.delete(histId);
    let succeeded = false;
    
    try {
      const cur = readHistory().find((x) => x.id === histId);
      if (cur?.status === 'canceled') {
        schedule();
        return;
      }
      
      if (code === 0) {
        const produced = findProducedFile(tmpDir, tmpId, producedExts);
        if (produced) {
          job.produced = produced;
          const full = path.join(tmpDir, produced);
          const stat = fs.statSync(full);
          updateHistory(histId, {
            status: 'completed',
            progress: 100,
            size: `${Math.round(stat.size / 1024 / 1024)} MB`,
          });
          clearHistoryThrottle(histId);
          emitProgress(histId, { progress: 100, stage: 'completed', size: stat.size, ...extraEmit });
          finalizeJob(histId, 'completed', { job });
          succeeded = true;
        } else {
          updateHistory(histId, { status: 'failed' });
          clearHistoryThrottle(histId);
        }
      } else {
        updateHistory(histId, { status: 'failed' });
        clearHistoryThrottle(histId);
      }
    } catch (err: any) {
      log.error('close_handler_error', err?.message || String(err));
    }
    
    if (!succeeded) {
      finalizeJob(histId, 'failed', { job, keepJob: false, keepFiles: false });
    }
    schedule();
  };
}

/**
 * Check free disk space and throw HttpError if insufficient
 */
export function assertFreeSpace(tmpDir: string, minBytes: number): void {
  if (minBytes <= 0) return;
  
  // Dynamic import to avoid circular dependencies
  const { getFreeDiskBytes } = require('./ytHelpers.js');
  const { HttpError } = require('./httpError.js');
  
  const free = getFreeDiskBytes(tmpDir);
  if (free > -1 && free < minBytes) {
    throw new HttpError(507, 'INSUFFICIENT_STORAGE', { free, required: minBytes });
  }
}

/**
 * Complete job runner - handles spawn, progress, and close lifecycle
 * DRY helper to eliminate boilerplate in job routes
 */
export function runJobWithLifecycle(opts: {
  job: Job;
  histId: string;
  url: string;
  ytdlpArgs: any;
  producedExts: string[];
  log: Logger;
  logPrefix: string;
  state: JobSystemState;
  progressHints?: { merging?: boolean; converting?: boolean; embedding?: boolean };
  extraEmit?: Record<string, unknown>;
}): () => void {
  const { job, histId, url, ytdlpArgs, producedExts, log, logPrefix, state, progressHints, extraEmit } = opts;
  const { tmpDir, tmpId } = job;
  
  return () => {
    // Spawn yt-dlp
    const child = spawnYtDlp({ url, ytdlpArgs, job, log, logPrefix });
    
    // Attach progress handler
    const onProgress = createProgressHandler(
      histId,
      state.updateHistoryThrottled,
      state.emitProgress,
      progressHints
    );
    child.stdout?.on('data', onProgress);
    child.stderr?.on('data', onProgress);
    
    // Error handler
    child.on('error', (err: any) => {
      try {
        log.error(`${logPrefix}_error`, err?.message || String(err));
      } catch {}
    });
    
    // Close handler
    const closeHandler = createCloseHandler({
      job,
      tmpDir,
      tmpId,
      histId,
      producedExts,
      log,
      running: state.running,
      readHistory: state.readHistory,
      updateHistory: state.updateHistory,
      clearHistoryThrottle: state.clearHistoryThrottle,
      emitProgress: state.emitProgress,
      finalizeJob: state.finalizeJob,
      schedule: state.schedule,
      extraEmit,
    });
    child.on('close', closeHandler);
  };
}
