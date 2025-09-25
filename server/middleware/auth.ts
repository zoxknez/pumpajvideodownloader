import type { Request, Response, NextFunction } from 'express';
import { verifyAppJwt } from '../core/jwksVerify.js';

export type Authed = Request & { user?: { id: string; email?: string; username?: string; plan: 'FREE'|'PREMIUM' } };

export function requireAuth(req: Authed, res: Response, next: NextFunction) {
  try {
    const hdr = String(req.headers.authorization || '');
    let token = hdr.startsWith('Bearer ') ? hdr.slice(7) : null;
    if (!token) {
      // Fallback for SSE/EventSource where setting custom headers is hard: allow ?token=...
      const q = (req.query || {}) as any;
      if (q.token && typeof q.token === 'string') token = q.token;
    }
    if (!token) return res.status(401).json({ error: 'unauthorized' });
    const claims = verifyAppJwt(token);
    req.user = {
      id: String(claims.sub),
      email: claims.email,
      username: (claims as any).username,
      plan: (claims as any).plan === 'PREMIUM' ? 'PREMIUM' : 'FREE',
    };
    return next();
  } catch {
    return res.status(401).json({ error: 'unauthorized' });
  }
}
