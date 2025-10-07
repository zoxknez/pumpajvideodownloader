/**
 * Server-Sent Events (SSE) routes
 * Handles /api/progress/:id for real-time job progress streaming
 */

import type { Response, Request } from 'express';
import type { Logger } from '../core/logger.js';
import { setSseHeaders, appendVary } from '../core/http.js';

type SseState = {
  sseBuffers: Map<string, string[]>;
  addSseListener: (id: string, res: Response) => void;
  removeSseListener: (id: string, res: Response) => void;
  pushSse: (id: string, payload: any, event?: string) => void;
};

/**
 * Setup SSE routes
 */
export function setupSseRoutes(
  app: any,
  requireAuthOrSigned: any,
  progressBucket: any,
  log: Logger,
  sseState: SseState
) {
  const { sseBuffers, addSseListener, removeSseListener, pushSse } = sseState;

  // ========================
  // GET /api/progress/:id (SSE endpoint for job progress)
  // ========================
  app.get('/api/progress/:id', requireAuthOrSigned('progress'), progressBucket, (req: Request, res: Response) => {
    const id = req.params.id;
    if (!id) return res.status(400).json({ error: 'missing_id' });

    setSseHeaders(res);
    appendVary(res, 'Authorization');
    (res as any).flushHeaders?.();

    res.write(`retry: 5000\n`);

    addSseListener(id, res);

    let closed = false;
    let hb: NodeJS.Timeout | undefined;
    let timeout: NodeJS.Timeout | undefined;

    const cleanup = () => {
      if (closed) return;
      closed = true;
      if (hb) {
        clearInterval(hb);
        hb = undefined;
      }
      if (timeout) {
        clearTimeout(timeout);
        timeout = undefined;
      }
      removeSseListener(id, res);
      try {
        res.end();
      } catch {}
    };

    const safeWrite = (chunk: string) => {
      if (closed || res.writableEnded || (res as any).destroyed) return;
      try {
        res.write(chunk);
      } catch {
        cleanup();
      }
    };

    // Activity-based timeout reset: 1 hour instead of 10 minutes
    const arm = () => {
      if (timeout) clearTimeout(timeout);
      timeout = setTimeout(() => {
        pushSse(id, { id, status: 'timeout' }, 'end');
        cleanup();
      }, 60 * 60 * 1000); // 1 hour
    };

    // Replay missed events if client provides Last-Event-ID
    const lastEventHeader = req.header('Last-Event-ID');
    const lastEventId =
      lastEventHeader && !Number.isNaN(Number(lastEventHeader)) ? Number(lastEventHeader) : undefined;
    if (typeof lastEventId === 'number') {
      const buf = sseBuffers.get(id) || [];
      for (const frame of buf) {
        const match = frame.match(/^id:\s*(\d+)/m);
        const frameId = match ? Number(match[1]) : undefined;
        if (typeof frameId === 'number' && frameId > lastEventId) {
          safeWrite(frame);
        }
      }
    }

    const onErr = (err: any) => {
      const msg = String(err?.message || err || '');
      if (!/aborted|socket hang up|ECONNRESET|ERR_STREAM_PREMATURE_CLOSE/i.test(msg)) {
        try {
          log.warn('progress_sse_stream_error', msg);
        } catch {}
      }
      cleanup();
    };

    req.on('close', cleanup);
    req.on('aborted', cleanup);
    req.on('error', onErr);
    res.on('error', onErr);
    (req.socket as any)?.on?.('error', onErr);
    (req.socket as any)?.on?.('close', cleanup);

    // Send initial ping and start heartbeat
    safeWrite(`event: ping\ndata: {"ok":true}\n\n`);
    arm(); // Set initial timeout
    hb = setInterval(() => {
      safeWrite(`event: ping\ndata: {"ts":${Date.now()}}\n\n`);
      arm(); // Reset timeout on each heartbeat (activity-based)
    }, 15000);
  });
}
