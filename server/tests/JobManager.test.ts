import { describe, it, expect, vi, beforeEach } from 'vitest';
import { JobManager } from '../core/JobManager.js';
import { SseHub } from '../core/SseHub.js';
import type { Logger } from '../core/logger.js';

// Mock Logger
const mockLogger: Logger = {
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
} as any;

describe('JobManager', () => {
  let sseHub: SseHub;
  let manager: JobManager;

  beforeEach(() => {
    vi.clearAllMocks();
    sseHub = new SseHub(mockLogger, 20);
    manager = new JobManager(mockLogger, sseHub, 2);
  });

  describe('createJob', () => {
    it('should create a new job', () => {
      const job = manager.createJob({
        id: 'job1',
        type: 'best',
        userId: 'user1',
        tmpId: 'tmp1',
        tmpDir: '/tmp',
        concurrencyCap: 2,
      });

      expect(job).toMatchObject({
        id: 'job1',
        type: 'best',
        userId: 'user1',
        status: 'waiting',
        version: 1,
      });

      expect(manager.getJob('job1')).toBe(job);
      expect(mockLogger.info).toHaveBeenCalledWith('job_created', expect.objectContaining({
        id: 'job1',
        type: 'best',
      }));
    });

    it('should set createdAt timestamp', () => {
      const before = Date.now();
      const job = manager.createJob({
        id: 'job1',
        type: 'audio',
        userId: 'user1',
        tmpId: 'tmp1',
        tmpDir: '/tmp',
        concurrencyCap: 1,
      });
      const after = Date.now();

      expect(job.createdAt).toBeGreaterThanOrEqual(before);
      expect(job.createdAt).toBeLessThanOrEqual(after);
    });
  });

  describe('enqueue', () => {
    it('should add job to waiting queue when no capacity', () => {
      const manager = new JobManager(mockLogger, sseHub, 0); // No capacity

      const job = manager.createJob({
        id: 'job1',
        type: 'best',
        userId: 'user1',
        tmpId: 'tmp1',
        tmpDir: '/tmp',
        concurrencyCap: 2,
      });

      manager.enqueue('job1');

      const stats = manager.getStats();
      expect(stats.waiting).toBe(1);
      expect(job.status).toBe('waiting');
    });

    it('should automatically schedule job if capacity available', () => {
      const job = manager.createJob({
        id: 'job1',
        type: 'best',
        userId: 'user1',
        tmpId: 'tmp1',
        tmpDir: '/tmp',
        concurrencyCap: 2,
      });

      manager.enqueue('job1');

      // Should be running since we have capacity (maxConcurrent=2, running=0)
      const stats = manager.getStats();
      expect(stats.running).toBe(1);
      expect(stats.waiting).toBe(0);
      expect(job.status).toBe('running');
    });
  });

  describe('schedule', () => {
    it('should respect global concurrency limit', () => {
      const manager = new JobManager(mockLogger, sseHub, 1); // maxConcurrent = 1

      const job1 = manager.createJob({
        id: 'job1',
        type: 'best',
        userId: 'user1',
        tmpId: 'tmp1',
        tmpDir: '/tmp',
        concurrencyCap: 5,
      });

      const job2 = manager.createJob({
        id: 'job2',
        type: 'audio',
        userId: 'user1',
        tmpId: 'tmp2',
        tmpDir: '/tmp',
        concurrencyCap: 5,
      });

      manager.enqueue('job1');
      manager.enqueue('job2');

      const stats = manager.getStats();
      expect(stats.running).toBe(1); // Only 1 should run
      expect(stats.waiting).toBe(1); // Other should wait
      expect(job1.status).toBe('running');
      expect(job2.status).toBe('waiting');
    });

    it('should respect per-user concurrency limit', () => {
      const job1 = manager.createJob({
        id: 'job1',
        type: 'best',
        userId: 'user1',
        tmpId: 'tmp1',
        tmpDir: '/tmp',
        concurrencyCap: 1, // User can only run 1 job
      });

      const job2 = manager.createJob({
        id: 'job2',
        type: 'audio',
        userId: 'user1',
        tmpId: 'tmp2',
        tmpDir: '/tmp',
        concurrencyCap: 1,
      });

      manager.enqueue('job1');
      manager.enqueue('job2');

      const stats = manager.getStats();
      expect(stats.running).toBe(1); // Only 1 for user1
      expect(stats.waiting).toBe(1);
    });

    it('should allow multiple users to run concurrently', () => {
      const job1 = manager.createJob({
        id: 'job1',
        type: 'best',
        userId: 'user1',
        tmpId: 'tmp1',
        tmpDir: '/tmp',
        concurrencyCap: 1,
      });

      const job2 = manager.createJob({
        id: 'job2',
        type: 'audio',
        userId: 'user2', // Different user
        tmpId: 'tmp2',
        tmpDir: '/tmp',
        concurrencyCap: 1,
      });

      manager.enqueue('job1');
      manager.enqueue('job2');

      const stats = manager.getStats();
      expect(stats.running).toBe(2); // Both users can run
      expect(stats.waiting).toBe(0);
    });
  });

  describe('completeJob', () => {
    it('should mark job as completed', () => {
      const job = manager.createJob({
        id: 'job1',
        type: 'best',
        userId: 'user1',
        tmpId: 'tmp1',
        tmpDir: '/tmp',
        concurrencyCap: 2,
      });

      manager.enqueue('job1');
      manager.completeJob('job1');

      expect(job.status).toBe('completed');
      expect(job.finishedAt).toBeDefined();
      expect(mockLogger.info).toHaveBeenCalledWith('job_completed', expect.objectContaining({
        id: 'job1',
      }));
    });

    it('should schedule next job after completion', () => {
      const manager = new JobManager(mockLogger, sseHub, 1);

      const job1 = manager.createJob({
        id: 'job1',
        type: 'best',
        userId: 'user1',
        tmpId: 'tmp1',
        tmpDir: '/tmp',
        concurrencyCap: 5,
      });

      const job2 = manager.createJob({
        id: 'job2',
        type: 'audio',
        userId: 'user1',
        tmpId: 'tmp2',
        tmpDir: '/tmp',
        concurrencyCap: 5,
      });

      manager.enqueue('job1');
      manager.enqueue('job2');

      expect(manager.getStats().running).toBe(1);
      expect(job2.status).toBe('waiting');

      manager.completeJob('job1');

      // job2 should now be running
      expect(manager.getStats().running).toBe(1);
      expect(job2.status).toBe('running');
    });
  });

  describe('failJob', () => {
    it('should mark job as failed with error message', () => {
      const job = manager.createJob({
        id: 'job1',
        type: 'best',
        userId: 'user1',
        tmpId: 'tmp1',
        tmpDir: '/tmp',
        concurrencyCap: 2,
      });

      manager.enqueue('job1');
      manager.failJob('job1', 'Download failed');

      expect(job.status).toBe('failed');
      expect(job.error).toBe('Download failed');
      expect(mockLogger.error).toHaveBeenCalledWith('job_failed', expect.objectContaining({
        id: 'job1',
        error: 'Download failed',
      }));
    });

    it('should schedule next job after failure', () => {
      const manager = new JobManager(mockLogger, sseHub, 1);

      const job1 = manager.createJob({
        id: 'job1',
        type: 'best',
        userId: 'user1',
        tmpId: 'tmp1',
        tmpDir: '/tmp',
        concurrencyCap: 5,
      });

      const job2 = manager.createJob({
        id: 'job2',
        type: 'audio',
        userId: 'user1',
        tmpId: 'tmp2',
        tmpDir: '/tmp',
        concurrencyCap: 5,
      });

      manager.enqueue('job1');
      manager.enqueue('job2');
      manager.failJob('job1', 'Error');

      // job2 should now be running
      expect(job2.status).toBe('running');
    });
  });

  describe('cancelJob', () => {
    it('should cancel running job', () => {
      const job = manager.createJob({
        id: 'job1',
        type: 'best',
        userId: 'user1',
        tmpId: 'tmp1',
        tmpDir: '/tmp',
        concurrencyCap: 2,
      });

      manager.enqueue('job1');
      manager.cancelJob('job1', 'User requested');

      expect(job.status).toBe('canceled');
      expect(job.error).toBe('User requested');
      expect(mockLogger.info).toHaveBeenCalledWith('job_canceled', expect.objectContaining({
        id: 'job1',
        reason: 'User requested',
      }));
    });

    it('should remove job from waiting queue', () => {
      const manager = new JobManager(mockLogger, sseHub, 1);

      const job1 = manager.createJob({
        id: 'job1',
        type: 'best',
        userId: 'user1',
        tmpId: 'tmp1',
        tmpDir: '/tmp',
        concurrencyCap: 5,
      });

      const job2 = manager.createJob({
        id: 'job2',
        type: 'audio',
        userId: 'user1',
        tmpId: 'tmp2',
        tmpDir: '/tmp',
        concurrencyCap: 5,
      });

      manager.enqueue('job1');
      manager.enqueue('job2');

      expect(manager.getStats().waiting).toBe(1);

      manager.cancelJob('job2');

      expect(manager.getStats().waiting).toBe(0);
      expect(job2.status).toBe('canceled');
    });
  });

  describe('getUserJobs', () => {
    it('should return all jobs for a user', () => {
      manager.createJob({
        id: 'job1',
        type: 'best',
        userId: 'user1',
        tmpId: 'tmp1',
        tmpDir: '/tmp',
        concurrencyCap: 2,
      });

      manager.createJob({
        id: 'job2',
        type: 'audio',
        userId: 'user1',
        tmpId: 'tmp2',
        tmpDir: '/tmp',
        concurrencyCap: 2,
      });

      manager.createJob({
        id: 'job3',
        type: 'best',
        userId: 'user2',
        tmpId: 'tmp3',
        tmpDir: '/tmp',
        concurrencyCap: 2,
      });

      const user1Jobs = manager.getUserJobs('user1');
      expect(user1Jobs).toHaveLength(2);
      expect(user1Jobs.map((j) => j.id)).toEqual(['job1', 'job2']);
    });
  });

  describe('setMaxConcurrent', () => {
    it('should update max concurrent limit', () => {
      manager.setMaxConcurrent(5);
      expect(manager.getStats().maxConcurrent).toBe(5);
    });

    it('should clamp value between 1 and 10', () => {
      manager.setMaxConcurrent(0);
      expect(manager.getStats().maxConcurrent).toBe(1);

      manager.setMaxConcurrent(15);
      expect(manager.getStats().maxConcurrent).toBe(10);
    });

    it('should trigger scheduling when limit increased', () => {
      const manager = new JobManager(mockLogger, sseHub, 1);

      const job1 = manager.createJob({
        id: 'job1',
        type: 'best',
        userId: 'user1',
        tmpId: 'tmp1',
        tmpDir: '/tmp',
        concurrencyCap: 5,
      });

      const job2 = manager.createJob({
        id: 'job2',
        type: 'audio',
        userId: 'user1',
        tmpId: 'tmp2',
        tmpDir: '/tmp',
        concurrencyCap: 5,
      });

      manager.enqueue('job1');
      manager.enqueue('job2');

      expect(manager.getStats().running).toBe(1);
      expect(job2.status).toBe('waiting');

      manager.setMaxConcurrent(2);

      // job2 should now be running
      expect(manager.getStats().running).toBe(2);
      expect(job2.status).toBe('running');
    });
  });

  describe('getQueueInfo', () => {
    it('should return detailed queue information', () => {
      const job1 = manager.createJob({
        id: 'job1',
        type: 'best',
        userId: 'user1',
        tmpId: 'tmp1',
        tmpDir: '/tmp',
        concurrencyCap: 2,
      });

      const job2 = manager.createJob({
        id: 'job2',
        type: 'audio',
        userId: 'user2',
        tmpId: 'tmp2',
        tmpDir: '/tmp',
        concurrencyCap: 2,
      });

      manager.enqueue('job1');
      manager.enqueue('job2');

      const queueInfo = manager.getQueueInfo();

      expect(queueInfo.running).toHaveLength(2);
      expect(queueInfo.running[0]).toMatchObject({
        id: 'job1',
        type: 'best',
        userId: 'user1',
      });

      expect(queueInfo.waiting).toHaveLength(0);
    });
  });
});
