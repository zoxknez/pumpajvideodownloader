import { apiFetch, apiUrl, getSigned, invalidateSignedEntry, jobFileUrl } from './client';

export async function startBestJob(url: string, title?: string): Promise<string> {
  const res = await apiFetch('/api/job/start/best', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url, title }),
  });
  if (!res.ok) throw new Error(`Job start failed: ${res.status}`);
  const data = await res.json();
  return data.id || data.jobId || '';
}

export async function startAudioJob(url: string, title?: string, format?: string): Promise<string> {
  const res = await apiFetch('/api/job/start/audio', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url, title, format }),
  });
  if (!res.ok) throw new Error(`Job start failed: ${res.status}`);
  const data = await res.json();
  return data.id || data.jobId || '';
}

export async function cancelJob(id: string) {
  await apiFetch(`/api/job/cancel/${encodeURIComponent(id)}`, { method: 'POST' });
}

export async function isJobFileReady(id: string): Promise<boolean> {
  try {
    const res = await apiFetch(jobFileUrl(id), { method: 'HEAD' });
    return res.ok;
  } catch {
    return false;
  }
}

export type JobProgressUpdate = {
  progress?: number;
  stage?: string;
  speed?: string;
  eta?: string;
  type?: string;
};

export type JobCompletionDetail = {
  reason?: string;
  error?: string;
};

export async function subscribeJobProgress(
  id: string,
  onProgress: (data: JobProgressUpdate) => void,
  onComplete: (status: string, detail?: JobCompletionDetail) => void
): Promise<{ close: () => void }> {
  let closed = false;
  let es: EventSource | null = null;
  let retries = 0;
  const started = typeof performance !== 'undefined' ? performance.now() : Date.now();

  const finish = (status: string, detail?: JobCompletionDetail) => {
    if (closed) return;
    closed = true;
    try {
      es?.close();
    } catch {}
    try {
      const durationMs = (typeof performance !== 'undefined' ? performance.now() : Date.now()) - started;
      console.debug?.('[subscribeJobProgress] completed', { id, status, durationMs: Math.round(durationMs) });
    } catch {}
    try {
      onComplete(status, detail);
    } catch {}
  };

  const open = async (): Promise<void> => {
    const { token, q } = await getSigned(id, 'progress');
    const qs = new URLSearchParams();
    qs.set(q, token);
    const url = `${apiUrl(`/api/progress/${encodeURIComponent(id)}`)}?${qs.toString()}`;
    es = new EventSource(url, { withCredentials: true } as EventSourceInit);

    es.addEventListener('ping', () => {});

    es.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        if (payload && typeof payload === 'object') {
          if (payload.progress !== undefined || payload.stage || payload.speed || payload.eta) {
            onProgress({
              progress: payload.progress,
              stage: payload.stage,
              speed: payload.speed,
              eta: payload.eta,
              type: payload.type,
            });
          }

          const inferredStatus =
            typeof payload.status === 'string'
              ? payload.status
              : payload.type === 'complete'
              ? 'completed'
              : payload.type === 'error'
              ? 'failed'
              : undefined;

          if (inferredStatus === 'completed' || inferredStatus === 'failed' || inferredStatus === 'canceled') {
            finish(inferredStatus, { reason: payload.reason, error: payload.error });
          }
        }
      } catch {}
    };

    es.addEventListener('end', (event: MessageEvent) => {
      let status = 'completed';
      let detail: JobCompletionDetail | undefined;
      try {
        const data = JSON.parse(event.data);
        if (typeof data?.status === 'string') status = data.status;
        if (data && typeof data === 'object') {
          detail = { reason: data.reason, error: data.error };
        }
      } catch {}
      finish(status, detail);
    });

    es.onerror = async () => {
      try {
        es?.close();
      } catch {}
      if (closed) return;
      if (retries >= 1) {
        finish('failed', { reason: 'connection_error' });
        return;
      }
      retries += 1;
      invalidateSignedEntry(id, 'progress');
      try {
        await open();
      } catch {
        finish('failed', { reason: 'connection_error' });
      }
    };
  };

  await open();

  return {
    close: () => {
      closed = true;
      try {
        es?.close();
      } catch {}
    },
  };
}
