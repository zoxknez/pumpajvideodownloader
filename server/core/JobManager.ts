import type { ChildProcess } from 'node:child_process';
import type { Logger } from './logger.js';
import type { SseHub } from './SseHub.js';

/**
 * Job types supported by the manager
 */
export type JobType = 
  | 'best' 
  | 'audio' 
  | 'video' 
  | 'adaptive' 
  | 'embed-subs' 
  | 'convert' 
  | 'playlist' 
  | 'chapter';

/**
 * Job states during lifecycle
 */
export type JobStatus = 'waiting' | 'running' | 'completed' | 'failed' | 'canceled';

/**
 * Core Job structure
 */
export interface Job {
  id: string;
  type: JobType;
  userId: string;
  status: JobStatus;
  tmpId: string;
  tmpDir: string;
  child?: ChildProcess;
  concurrencyCap: number;
  version: number;
  createdAt: number;
  startedAt?: number;
  finishedAt?: number;
  error?: string;
  metadata?: Record<string, any>;
}

/**
 * Waiting queue item
 */
interface WaitingItem {
  id: string;
  userId: string;
  type: JobType;
  concurrencyCap: number;
  enqueueTime: number;
}

/**
 * Job Manager - Centralized job lifecycle and concurrency management
 * 
 * Features:
 * - Global + per-user concurrency limits
 * - Priority queue with fair scheduling
 * - Job lifecycle tracking (waiting → running → completed/failed)
 * - Automatic cleanup and resource management
 * - Integration with SSE for progress updates
 */
export class JobManager {
  private jobs = new Map<string, Job>();
  private waiting: WaitingItem[] = [];
  private running = new Set<string>();
  
  private readonly log: Logger;
  private readonly sseHub: SseHub;
  private maxConcurrent: number;
  
  constructor(log: Logger, sseHub: SseHub, maxConcurrent = 2) {
    this.log = log;
    this.sseHub = sseHub;
    this.maxConcurrent = maxConcurrent;
  }

  /**
   * Create new job and add to queue
   */
  createJob(params: {
    id: string;
    type: JobType;
    userId: string;
    tmpId: string;
    tmpDir: string;
    concurrencyCap: number;
    metadata?: Record<string, any>;
  }): Job {
    const job: Job = {
      ...params,
      status: 'waiting',
      version: 1,
      createdAt: Date.now(),
    };

    this.jobs.set(job.id, job);
    this.log.info('job_created', { id: job.id, type: job.type, userId: job.userId });

    return job;
  }

  /**
   * Enqueue job for execution
   */
  enqueue(id: string): void {
    const job = this.jobs.get(id);
    if (!job) {
      this.log.error('job_not_found', { id });
      return;
    }

    const item: WaitingItem = {
      id,
      userId: job.userId,
      type: job.type,
      concurrencyCap: job.concurrencyCap,
      enqueueTime: Date.now(),
    };

    this.waiting.push(item);
    job.status = 'waiting';
    
    this.log.info('job_enqueued', { 
      id, 
      queuePosition: this.waiting.length,
      queueLength: this.waiting.length 
    });

    // Try to schedule immediately
    this.schedule();
  }

  /**
   * Schedule next job from queue respecting concurrency limits
   */
  schedule(): void {
    // Check global limit
    if (this.running.size >= this.maxConcurrent) {
      this.log.debug('schedule_skip', { reason: 'max_concurrent', running: this.running.size });
      return;
    }

    // Find next eligible job
    for (let i = 0; i < this.waiting.length; i++) {
      const item = this.waiting[i];
      const userRunning = this.getUserRunningCount(item.userId);

      // Check per-user limit
      if (userRunning >= item.concurrencyCap) {
        this.log.debug('schedule_skip_user', { 
          userId: item.userId, 
          userRunning, 
          cap: item.concurrencyCap 
        });
        continue;
      }

      // Found eligible job - start it
      this.waiting.splice(i, 1);
      this.startJob(item.id);
      
      // Try to schedule more jobs
      if (this.running.size < this.maxConcurrent) {
        this.schedule();
      }
      return;
    }

    this.log.debug('schedule_complete', { 
      running: this.running.size, 
      waiting: this.waiting.length 
    });
  }

  /**
   * Start job execution
   */
  private startJob(id: string): void {
    const job = this.jobs.get(id);
    if (!job) return;

    job.status = 'running';
    job.startedAt = Date.now();
    this.running.add(id);

    this.log.info('job_started', { 
      id, 
      type: job.type, 
      waitTime: job.startedAt - job.createdAt 
    });

    this.sseHub.push(id, { 
      id, 
      status: 'running', 
      message: 'Job started' 
    }, 'start');
  }

  /**
   * Mark job as completed
   */
  completeJob(id: string, metadata?: Record<string, any>): void {
    const job = this.jobs.get(id);
    if (!job) return;

    job.status = 'completed';
    job.finishedAt = Date.now();
    if (metadata) job.metadata = { ...job.metadata, ...metadata };
    
    this.running.delete(id);

    const duration = job.finishedAt - (job.startedAt ?? job.createdAt);
    this.log.info('job_completed', { id, type: job.type, duration });

    this.sseHub.end(id, 'completed');

    // Schedule next job
    this.schedule();
  }

  /**
   * Mark job as failed
   */
  failJob(id: string, error: string): void {
    const job = this.jobs.get(id);
    if (!job) return;

    job.status = 'failed';
    job.finishedAt = Date.now();
    job.error = error;
    
    this.running.delete(id);

    this.log.error('job_failed', { id, type: job.type, error });

    this.sseHub.end(id, 'failed');

    // Schedule next job
    this.schedule();
  }

  /**
   * Cancel job
   */
  cancelJob(id: string, reason = 'User canceled'): void {
    const job = this.jobs.get(id);
    if (!job) return;

    // Kill child process if running
    if (job.child && !job.child.killed) {
      job.child.kill('SIGTERM');
      this.log.info('job_process_killed', { id });
    }

    job.status = 'canceled';
    job.finishedAt = Date.now();
    job.error = reason;
    
    this.running.delete(id);

    // Remove from waiting queue if present
    const idx = this.waiting.findIndex((w) => w.id === id);
    if (idx >= 0) {
      this.waiting.splice(idx, 1);
      this.log.info('job_removed_from_queue', { id });
    }

    this.log.info('job_canceled', { id, reason });

    this.sseHub.end(id, 'canceled');

    // Schedule next job
    this.schedule();
  }

  /**
   * Get job by ID
   */
  getJob(id: string): Job | undefined {
    return this.jobs.get(id);
  }

  /**
   * Get all jobs for a user
   */
  getUserJobs(userId: string): Job[] {
    return Array.from(this.jobs.values()).filter((j) => j.userId === userId);
  }

  /**
   * Get count of running jobs for a user
   */
  private getUserRunningCount(userId: string): number {
    let count = 0;
    for (const id of this.running) {
      const job = this.jobs.get(id);
      if (job && job.userId === userId) count++;
    }
    return count;
  }

  /**
   * Clean up job resources
   */
  deleteJob(id: string): boolean {
    const job = this.jobs.get(id);
    if (!job) return false;

    // Ensure not running
    if (job.status === 'running') {
      this.cancelJob(id, 'Cleanup');
    }

    this.jobs.delete(id);
    this.sseHub.cleanup(id);
    
    this.log.info('job_deleted', { id });
    return true;
  }

  /**
   * Get queue statistics
   */
  getStats() {
    return {
      total: this.jobs.size,
      running: this.running.size,
      waiting: this.waiting.length,
      completed: Array.from(this.jobs.values()).filter((j) => j.status === 'completed').length,
      failed: Array.from(this.jobs.values()).filter((j) => j.status === 'failed').length,
      maxConcurrent: this.maxConcurrent,
    };
  }

  /**
   * Get queue info for monitoring
   */
  getQueueInfo() {
    return {
      running: Array.from(this.running).map((id) => {
        const job = this.jobs.get(id);
        return job ? {
          id: job.id,
          type: job.type,
          userId: job.userId,
          startedAt: job.startedAt,
          duration: Date.now() - (job.startedAt ?? job.createdAt),
        } : null;
      }).filter(Boolean),
      waiting: this.waiting.map((w) => ({
        id: w.id,
        type: w.type,
        userId: w.userId,
        waitTime: Date.now() - w.enqueueTime,
      })),
    };
  }

  /**
   * Update max concurrent jobs (for runtime config changes)
   */
  setMaxConcurrent(max: number): void {
    this.maxConcurrent = Math.max(1, Math.min(max, 10)); // Clamp 1-10
    this.log.info('max_concurrent_updated', { maxConcurrent: this.maxConcurrent });
    
    // Try to schedule more jobs if limit increased
    this.schedule();
  }
}
