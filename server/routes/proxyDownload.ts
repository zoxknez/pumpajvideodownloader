import type { Request, Response } from 'express';
import http from 'node:http';
import https from 'node:https';
import path from 'node:path';
import { once } from 'node:events';
import { pipeline, Transform } from 'node:stream';
import { promisify } from 'node:util';
import type { AppConfig } from '../core/config.js';
import { isUrlAllowed } from '../core/urlAllow.js';
import { assertPublicHttpHost } from '../core/ssrfGuard.js';
import { passthroughHeaders, SAFE_PASSTHROUGH } from '../core/passthroughHeaders.js';
import { getLogger } from '../core/logger.js';
import type { MetricsRegistry } from '../core/metrics.js';
import { startProxyObservation } from '../core/metrics.js';

const pump = promisify(pipeline);

const httpAgent = new http.Agent({ keepAlive: true, maxSockets: 64 });
const httpsAgent = new https.Agent({ keepAlive: true, maxSockets: 64 });

const log = getLogger('proxy');

function logFailure(code: string, msg: string) {
  log.error('proxy_download_failed', JSON.stringify({ code, msg }));
}

type ProxyErrorCode =
  | 'MISSING_URL'
  | 'INVALID_URL'
  | 'PROXY_ERROR'
  | 'SSRF_FORBIDDEN'
  | 'SIZE_LIMIT'
  | 'UPSTREAM_RATELIMIT'
  | 'UPSTREAM_SIZE_LIMIT';

type ProxyFailure = {
  status: number;
  code: ProxyErrorCode;
  proxyStatus?: string;
  retryAfter?: string;
};

function sendError(res: Response, failure: ProxyFailure) {
  if (res.headersSent) {
    try { res.end(); } catch {}
    return;
  }

  for (const key of SAFE_PASSTHROUGH) {
    try {
      if (res.getHeader(key)) res.removeHeader(key);
    } catch {}
  }

  res.setHeader('Connection', 'close');
  if (!res.getHeader('Accept-Ranges')) res.setHeader('Accept-Ranges', 'bytes');
  if (!res.getHeader('Cache-Control')) res.setHeader('Cache-Control', 'no-store');

  const proxyStatus = failure.proxyStatus ?? `pumpaj; error="${failure.code.toLowerCase()}"`;
  res.setHeader('Proxy-Status', proxyStatus);
  if (failure.retryAfter) res.setHeader('Retry-After', failure.retryAfter);

  const payload = JSON.stringify({ error: failure.code });
  res.status(failure.status);
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Content-Length', Buffer.byteLength(payload));
  res.end(payload);
}

export function createProxyDownloadHandler(cfg: AppConfig, registry?: MetricsRegistry) {
  const MAX_MB = Number(cfg.maxFileSizeMb || 0);
  const MAX_BYTES = MAX_MB > 0 ? MAX_MB * 1024 * 1024 : 0;

  return async function proxyDownload(req: Request, res: Response) {
    const metricsProxy = (registry ?? (req.app?.locals?.metrics as MetricsRegistry | undefined))?.proxy;
    const finishMetrics = metricsProxy ? startProxyObservation(metricsProxy) : undefined;
    let done = false;
    const finalize = (obs: { ok: boolean; bytes?: number; code?: ProxyErrorCode }) => {
      if (done) return;
      done = true;
      finishMetrics?.({ ok: obs.ok, bytes: obs.bytes, errorCode: obs.code });
    };
    try {
      const src = String(req.query.url || '');
      if (!src) {
        const failure: ProxyFailure = {
          status: 400,
          code: 'MISSING_URL',
          proxyStatus: 'pumpaj; error="missing_url"',
        };
        finalize({ ok: false, code: failure.code });
        return sendError(res, failure);
      }

      let srcUrl: URL;
      try {
        srcUrl = new URL(src);
      } catch {
        const failure: ProxyFailure = {
          status: 400,
          code: 'INVALID_URL',
          proxyStatus: 'pumpaj; error="invalid_url"',
        };
        finalize({ ok: false, code: failure.code });
        return sendError(res, failure);
      }

      if (!isUrlAllowed(src, cfg)) {
        const failure: ProxyFailure = {
          status: 400,
          code: 'INVALID_URL',
          proxyStatus: 'pumpaj; error="invalid_url"',
        };
        finalize({ ok: false, code: failure.code });
        return sendError(res, failure);
      }

      await assertPublicHttpHost(src);

      const unsafe = String(req.query.filename ?? 'download.bin');
      const safeName = path.basename(unsafe).replace(/[\r\n"]/g, '_').slice(0, 128);
      res.setHeader('Content-Disposition', `attachment; filename="${safeName}"`);

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 60_000);

      const headers: Record<string, string> = {
        'user-agent': 'Mozilla/5.0',
        referer: srcUrl.origin,
      };
      if (req.headers.range) headers.range = String(req.headers.range);

      const fetchInit: RequestInit & { agent?: any } = {
        headers,
        redirect: 'follow',
        signal: controller.signal,
      };
      (fetchInit as any).agent = srcUrl.protocol === 'https:' ? httpsAgent : httpAgent;

      const response = await fetch(src, fetchInit).finally(() => clearTimeout(timeout));

      if (!response.ok) {
        const retryAfter = response.headers.get('retry-after') ?? undefined;
        const status = response.status === 429 ? 429 : 502;
        const code: ProxyErrorCode = response.status === 429 ? 'UPSTREAM_RATELIMIT' : 'PROXY_ERROR';
        logFailure(code, `upstream status ${response.status}`);
        const failure: ProxyFailure = {
          status,
          code,
          proxyStatus: `pumpaj; error="${response.status === 429 ? 'upstream_ratelimit' : 'upstream_error'}"; details="status ${response.status}"`,
          retryAfter: response.status === 429 ? retryAfter ?? '30' : undefined,
        };
        finalize({ ok: false, code: failure.code });
        return sendError(res, failure);
      }

      if (MAX_BYTES > 0) {
        const contentRange = response.headers.get('content-range');
        if (contentRange) {
          const rangeMatch = contentRange.match(/bytes\s+(\d+)-(\d+)\/(\d+)/i);
          if (rangeMatch) {
            const end = parseInt(rangeMatch[2], 10);
            if (Number.isFinite(end) && end + 1 > MAX_BYTES) {
              controller.abort();
              logFailure('UPSTREAM_SIZE_LIMIT', `range exceeded local limit: ${contentRange}`);
              const failure: ProxyFailure = {
                status: 502,
                code: 'UPSTREAM_SIZE_LIMIT',
                proxyStatus: 'pumpaj; error="upstream_size_limit"; details="range exceeds local limit"',
              };
              finalize({ ok: false, code: failure.code });
              return sendError(res, failure);
            }
          }
        }
      }

      const contentLength = Number(response.headers.get('content-length') || 0);
      if (MAX_BYTES > 0 && Number.isFinite(contentLength) && contentLength > MAX_BYTES) {
        controller.abort();
        logFailure('SIZE_LIMIT', `declared ${contentLength} bytes exceeds limit ${MAX_BYTES}`);
        const failure: ProxyFailure = {
          status: 413,
          code: 'SIZE_LIMIT',
          proxyStatus: `pumpaj; error="size_limit"; details="content-length ${contentLength}"`,
        };
        finalize({ ok: false, code: failure.code });
        return sendError(res, failure);
      }

      if (!response.body) {
        logFailure('PROXY_ERROR', 'upstream body missing');
        const failure: ProxyFailure = {
          status: 502,
          code: 'PROXY_ERROR',
          proxyStatus: 'pumpaj; error="upstream_error"; details="empty body"',
        };
        finalize({ ok: false, code: failure.code });
        return sendError(res, failure);
      }

      const { Readable } = await import('node:stream');
      const nodeStream = Readable.fromWeb(response.body as any);

      req.on('close', () => controller.abort());

      const headerSnapshot = new Headers();
      response.headers.forEach((value, key) => {
        if (value !== undefined) headerSnapshot.set(key, value);
      });

      let headersApplied = false;
      const ensureSuccessHeaders = () => {
        if (headersApplied) return;
        headersApplied = true;
        res.status(response.status);
        passthroughHeaders(headerSnapshot, res);
        if (Number.isFinite(contentLength) && contentLength > 0) {
          res.setHeader('Content-Length', String(contentLength));
        }
        if (!res.getHeader('Accept-Ranges')) res.setHeader('Accept-Ranges', 'bytes');
        if (!res.getHeader('Cache-Control')) res.setHeader('Cache-Control', 'no-store');
      };

      if (MAX_BYTES > 0) {
        let total = 0;
        try {
          for await (const chunk of nodeStream as any as AsyncIterable<Buffer | Uint8Array>) {
            const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
            if (total + buf.length > MAX_BYTES) {
              controller.abort();
              logFailure('UPSTREAM_SIZE_LIMIT', 'stream exceeded local limit');
              const failure: ProxyFailure = {
                status: 502,
                code: 'UPSTREAM_SIZE_LIMIT',
                proxyStatus: 'pumpaj; error="upstream_size_limit"; details="stream exceeded local limit"',
              };
              finalize({ ok: false, code: failure.code, bytes: total });
              return sendError(res, failure);
            }
            if (!headersApplied) ensureSuccessHeaders();
            total += buf.length;
            if (!res.write(buf)) {
              await once(res, 'drain');
            }
          }
          ensureSuccessHeaders();
          res.end();
          finalize({ ok: true, bytes: total });
          return;
        } catch (err: any) {
          if (err?.name === 'AbortError') throw err;
          controller.abort();
          logFailure(err?.code || 'UNKNOWN', String(err?.message || err));
          const failure: ProxyFailure = {
            status: 502,
            code: 'PROXY_ERROR',
            proxyStatus: 'pumpaj; error="proxy_error"',
          };
          finalize({ ok: false, code: failure.code, bytes: total });
          return sendError(res, failure);
        }
      }

      let streamedBytes = 0;
      const passthrough = new Transform({
        transform(chunk, _enc, cb) {
          ensureSuccessHeaders();
          const len = typeof chunk === 'string' ? Buffer.byteLength(chunk) : chunk?.length ?? 0;
          streamedBytes += len;
          cb(null, chunk);
        },
        flush(cb) {
          ensureSuccessHeaders();
          cb();
        },
      });

      try {
        await pump(nodeStream, passthrough, res);
        const delivered = streamedBytes || (Number.isFinite(contentLength) ? contentLength : 0);
        finalize({ ok: true, bytes: delivered });
      } catch (err: any) {
        if (err?.name === 'AbortError') throw err;
        controller.abort();
        logFailure(err?.code || 'UNKNOWN', String(err?.message || err));
        const failure: ProxyFailure = {
          status: 502,
          code: 'PROXY_ERROR',
          proxyStatus: 'pumpaj; error="proxy_error"',
        };
        finalize({ ok: false, code: failure.code, bytes: streamedBytes });
        return sendError(res, failure);
      }
    } catch (err: any) {
      if (err?.name === 'AbortError') {
        logFailure(err?.code || 'ABORTED', String(err?.message || err));
        const failure: ProxyFailure = {
          status: 504,
          code: 'PROXY_ERROR',
          proxyStatus: 'pumpaj; error="proxy_timeout"',
        };
        finalize({ ok: false, code: failure.code });
        return sendError(res, failure);
      }
      if (err?.code === 'SSRF_FORBIDDEN') {
        const status = Number(err?.status) || 400;
        logFailure('SSRF_FORBIDDEN', String(err?.message || err));
        const failure: ProxyFailure = {
          status,
          code: 'SSRF_FORBIDDEN',
          proxyStatus: 'pumpaj; error="ssrf_forbidden"',
        };
        finalize({ ok: false, code: failure.code });
        return sendError(res, failure);
      }
      logFailure(err?.code || 'UNKNOWN', String(err?.message || err));
      const failure: ProxyFailure = {
        status: 500,
        code: 'PROXY_ERROR',
        proxyStatus: 'pumpaj; error="proxy_error"',
      };
      finalize({ ok: false, code: failure.code });
      sendError(res, failure);
      return;
    }
    if (!done) finalize({ ok: false, code: 'PROXY_ERROR' });
  };
}
