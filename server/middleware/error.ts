import type { Request, Response, NextFunction } from 'express';

// Note: keep the 4-arg signature for Express error middleware. eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: any, req: Request, res: Response, _next?: NextFunction) {
  // Mark _next as used to satisfy lint while keeping 4-arg signature
  void _next;
  const status = typeof err?.status === 'number' ? err.status : 500;
  const code = err?.code || 'INTERNAL_ERROR';
  const msg = err?.message || 'Unexpected server error';
  const requestId = (req as any)?.id;
  const details = process.env.NODE_ENV === 'development' ? (err?.stack || String(err)) : undefined;
  res.status(status).json({ ok: false, requestId, error: { code, message: msg, details } });
}
