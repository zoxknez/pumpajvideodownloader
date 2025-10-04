import type { Request, Response, NextFunction } from 'express';
import client from 'prom-client';

const requestCounter = new client.Counter({
  name: 'http_requests_total',
  help: 'HTTP requests count',
  labelNames: ['route', 'method', 'code'] as const,
});

const requestDuration = new client.Histogram({
  name: 'http_request_duration_seconds',
  help: 'HTTP request duration in seconds',
  labelNames: ['route', 'method', 'code'] as const,
  buckets: [0.05, 0.1, 0.3, 0.6, 1, 3, 5],
});

export const signIssued = new client.Counter({
  name: 'sign_issued_total',
  help: 'Issued signed links',
  labelNames: ['scope'] as const,
});

export const signTtl = new client.Histogram({
  name: 'sign_ttl_seconds',
  help: 'TTL requested for signed links',
  buckets: [60, 300, 600, 1800, 3600],
});

client.collectDefaultMetrics?.();

export function metricsMiddleware(routeLabel: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    const start = process.hrtime.bigint();
    res.on('finish', () => {
      const code = String(res.statusCode);
      requestCounter.inc({ route: routeLabel, method: req.method, code });
      const elapsed = Number(process.hrtime.bigint() - start) / 1e9;
      requestDuration.observe({ route: routeLabel, method: req.method, code }, elapsed);
    });
    next();
  };
}

export const prometheusRegister = client.register;
