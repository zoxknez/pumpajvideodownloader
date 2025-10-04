import type { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'node:crypto';

const SENSITIVE = /^(authorization|cookie|x-api-key|x-auth-token)$/i;
const SENSITIVE_QUERY = new Set(['s', 'token']);

function redactHeaders(h: Record<string, unknown> | undefined) {
  const out: Record<string, unknown> = {};
  if (!h) return out;
  for (const [key, value] of Object.entries(h)) {
    out[key] = SENSITIVE.test(key) ? '***' : value;
  }
  return out;
}

function redactUrl(url: string, host?: string | string[]) {
  if (!url) return url;
  try {
    const baseHost = Array.isArray(host) ? host[0] : host;
    const parsed = new URL(url, `http://${baseHost || 'localhost'}`);
    for (const key of SENSITIVE_QUERY) parsed.searchParams.delete(key);
    const query = parsed.searchParams.toString();
    return `${parsed.pathname}${query ? `?${query}` : ''}${parsed.hash || ''}`;
  } catch {
    return url.replace(/([?&])(s|token)=[^&#]*/gi, '$1$2=***');
  }
}

export function requestLogger(req: Request, res: Response, next: NextFunction) {
  const id = (req.headers['x-request-id'] as string) || randomUUID();
  (req as any).id = id;
  const traceparent = (req as any).traceparent;
  res.setHeader('x-request-id', id);
  const start = process.hrtime.bigint();

  res.on('finish', () => {
    const shouldQuiet = process.env.VERBOSE_REQUEST_LOGS !== '1' && isQuietRequest(req, res.statusCode);
    if (shouldQuiet) return;
    const durMs = Number((process.hrtime.bigint() - start) / 1_000_000n);
    console.info(JSON.stringify({
      t: new Date().toISOString(),
      id,
      ip: req.ip,
      m: req.method,
      u: redactUrl(req.originalUrl || req.url, req.headers.host),
      s: res.statusCode,
      durMs,
      h: redactHeaders(req.headers as any),
      tp: traceparent || undefined,
    }));
  });

  next();
}

const QUIET_PATHS = new Set([
  '/health',
  '/api/health',
  '/api/jobs/metrics',
  '/api/jobs/settings',
  '/api/history',
  '/api/version',
]);

const QUIET_PREFIXES = ['/api/job/file/'];

function isQuietRequest(req: Request, statusCode: number) {
  const method = req.method;
  const path = req.path || req.originalUrl || '';

  if (method === 'OPTIONS') return true;
  if ((method === 'GET' || method === 'HEAD') && QUIET_PATHS.has(path)) return true;

  if (QUIET_PREFIXES.some((prefix) => path.startsWith(prefix))) {
    if (method === 'HEAD') return true;
    if (method === 'GET' && (statusCode === 200 || statusCode === 304 || statusCode === 404)) return true;
  }

  if (statusCode === 304 && (method === 'GET' || method === 'HEAD')) return true;

  return false;
}
