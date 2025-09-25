import type { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'node:crypto';

export function requestLogger(req: Request, res: Response, next: NextFunction) {
  const id = (req.headers['x-request-id'] as string) || randomUUID();
  (req as any).id = id;
  res.setHeader('x-request-id', id);
  const start = process.hrtime.bigint();
  res.on('finish', () => {
    const durMs = Number((process.hrtime.bigint() - start) / 1_000_000n);
    // Minimal JSON line with no PII-heavy payloads
    console.info(JSON.stringify({
      t: new Date().toISOString(),
      id, ip: req.ip, m: req.method, p: req.path, s: res.statusCode, durMs,
    }));
  });
  next();
}
