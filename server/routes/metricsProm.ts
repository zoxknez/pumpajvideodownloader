import type { Request, Response } from 'express';
import type { MetricsRegistry } from '../core/metrics.js';
import { histogramLines } from '../core/metrics.js';
import { prometheusRegister } from '../middleware/httpMetrics.js';

export function mountPromMetrics(app: any, registry: MetricsRegistry) {
  app.get('/metrics.prom', async (_req: Request, res: Response) => {
    const running: Set<string> = app.locals.running ?? new Set();
    const waiting: any[] = app.locals.waiting ?? [];
    const jobs: Map<string, any> = app.locals.jobs ?? new Map();
    const listeners = app.locals.sseListeners
      ? (Array.from(app.locals.sseListeners.values()) as Set<any>[]).reduce((acc, set) => acc + set.size, 0)
      : 0;

    const proxy = registry.proxy;
    const errorLines: string[] = [];
    if (proxy.errors.size === 0) {
      errorLines.push('pumpaj_proxy_errors_total{code="none"} 0');
    } else {
      for (const [code, count] of proxy.errors.entries()) {
        errorLines.push(`pumpaj_proxy_errors_total{code="${code.toLowerCase()}"} ${count}`);
      }
    }

    const prometheusBody = await prometheusRegister.metrics();

    res.setHeader('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');
    res.end(
      [
        '# HELP pumpaj_jobs_running Number of running jobs',
        '# TYPE pumpaj_jobs_running gauge',
        `pumpaj_jobs_running ${running.size}`,
        '# HELP pumpaj_jobs_waiting Number of queued jobs',
        '# TYPE pumpaj_jobs_waiting gauge',
        `pumpaj_jobs_waiting ${waiting.length}`,
        '# HELP pumpaj_jobs_total Total jobs in memory map',
        '# TYPE pumpaj_jobs_total gauge',
        `pumpaj_jobs_total ${jobs.size}`,
        '# HELP pumpaj_sse_listeners Active SSE listeners',
        '# TYPE pumpaj_sse_listeners gauge',
        `pumpaj_sse_listeners ${listeners}`,
        '# HELP pumpaj_proxy_requests_total Proxy download requests processed',
        '# TYPE pumpaj_proxy_requests_total counter',
        `pumpaj_proxy_requests_total ${proxy.requests}`,
        '# HELP pumpaj_proxy_success_total Successful proxy downloads',
        '# TYPE pumpaj_proxy_success_total counter',
        `pumpaj_proxy_success_total ${proxy.success}`,
        '# HELP pumpaj_proxy_inflight Proxy downloads currently streaming',
        '# TYPE pumpaj_proxy_inflight gauge',
        `pumpaj_proxy_inflight ${proxy.inflight}`,
        '# HELP pumpaj_proxy_bytes_total Total bytes proxied through the download stream',
        '# TYPE pumpaj_proxy_bytes_total counter',
        `pumpaj_proxy_bytes_total ${proxy.bytesTotal}`,
        '# HELP pumpaj_proxy_errors_total Proxy download errors grouped by code',
        '# TYPE pumpaj_proxy_errors_total counter',
        ...errorLines,
        '# HELP pumpaj_proxy_duration_seconds Proxy download duration histogram',
        '# TYPE pumpaj_proxy_duration_seconds histogram',
        ...histogramLines('pumpaj_proxy_duration_seconds', proxy.duration),
        '# HELP pumpaj_proxy_bytes Proxy download size histogram (bytes)',
        '# TYPE pumpaj_proxy_bytes histogram',
        ...histogramLines('pumpaj_proxy_bytes', proxy.size),
        '# HELP pumpaj_reaper_files_reaped_total Files deleted by orphan reaper',
        '# TYPE pumpaj_reaper_files_reaped_total counter',
        `pumpaj_reaper_files_reaped_total ${registry.reaper.filesReaped}`,
        '# HELP pumpaj_reaper_jobs_deleted_total Jobs deleted by orphan reaper',
        '# TYPE pumpaj_reaper_jobs_deleted_total counter',
        `pumpaj_reaper_jobs_deleted_total ${registry.reaper.jobsDeleted}`,
        '# HELP pumpaj_reaper_last_run_timestamp_seconds Unix timestamp of last reaper run',
        '# TYPE pumpaj_reaper_last_run_timestamp_seconds gauge',
        `pumpaj_reaper_last_run_timestamp_seconds ${registry.reaper.lastRunTimestamp}`,
        '# HELP pumpaj_reaper_finalize_race_total Race conditions between reaper and finalizeJob',
        '# TYPE pumpaj_reaper_finalize_race_total counter',
        `pumpaj_reaper_finalize_race_total ${registry.reaper.reaperFinalizeRace}`,
        '',
        prometheusBody,
      ].join('\n')
    );
  });
}
