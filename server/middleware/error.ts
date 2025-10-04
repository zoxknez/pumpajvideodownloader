import type { Request, Response, NextFunction } from 'express';
import { HttpError, isHttpError } from '../core/httpError.js';

// Note: keep the 4-arg signature for Express error middleware. eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: any, req: Request, res: Response, _next?: NextFunction) {
  // Mark _next as used to satisfy lint while keeping 4-arg signature
  void _next;
  const normalized = normalizeError(err);
  const requestId = (req as any)?.id;
  const details = process.env.NODE_ENV === 'development' ? (err?.stack || String(err)) : undefined;
  res.status(normalized.status).json({
    ok: false,
    requestId,
    error: {
      code: normalized.code,
      message: normalized.message,
      details,
    },
  });
}

function normalizeError(err: unknown): HttpError {
  if (isHttpError(err)) return err;
  const status = typeof (err as any)?.status === 'number' ? (err as any).status : 500;
  const code = typeof (err as any)?.code === 'string' ? (err as any).code : 'INTERNAL_ERROR';
  const message = (err as any)?.message ? String((err as any).message) : 'Unexpected server error';
  return new HttpError(status, code, message);
}
