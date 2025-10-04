import type { Request, Response, NextFunction } from 'express';
import { verifyToken, type Scope } from '../core/signed.js';
import { requireAuth } from './auth.js';

export function requireAuthOrSigned(scope: Scope, paramName = 's') {
  return (req: Request, res: Response, next: NextFunction) => {
    const token = typeof req.query?.[paramName] === 'string' ? String(req.query[paramName]) : '';
    if (!token) {
      return requireAuth(req as any, res, next);
    }

    const id = String(req.params?.id ?? '');
    if (!id) {
      return res.status(400).json({ code: 'INVALID_ID' });
    }

    const jobs: Map<string, any> = req.app?.locals?.jobs ?? new Map();
    const job = jobs.get(id);
    if (!job) {
      return res.status(404).json({ error: 'not_found' });
    }

    const version = job?.version ?? 1;
    const expectedSub = `job:${id}`;
    const check = verifyToken(token, { sub: expectedSub, scope, ver: version });
    if (!check.ok) {
      return res.status(403).json({ code: 'INVALID_TOKEN', reason: check.reason });
    }

    (req as any).signedAccess = true;
    return next();
  };
}
