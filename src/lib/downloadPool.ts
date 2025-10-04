const pool = new Map<string, AbortController>();

export function pooledAbort(jobId: string): AbortSignal {
  const existing = pool.get(jobId);
  if (existing) {
    try { existing.abort(); } catch {}
  }
  const controller = new AbortController();
  pool.set(jobId, controller);
  return controller.signal;
}

export function endPooled(jobId: string): void {
  const controller = pool.get(jobId);
  if (controller) {
    try { controller.abort(); } catch {}
    pool.delete(jobId);
  }
}

export function resetDownloadPool(): void {
  for (const [key, controller] of pool.entries()) {
    try { controller.abort(); } catch {}
    pool.delete(key);
  }
}
