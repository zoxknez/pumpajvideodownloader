import type { Request, Response, NextFunction } from 'express';

export function traceContext(req: Request, res: Response, next: NextFunction) {
  const header = req.headers['traceparent'];
  if (typeof header === 'string' && header) {
    (req as any).traceparent = header;
    res.setHeader('x-traceparent', header);
  }
  next();
}
