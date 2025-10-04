import type { Request, Response, NextFunction } from 'express';
import { verifyAppJwt } from '../core/jwksVerify.js';
import { getActiveUser } from '../storage/usersRepo.js';

const AUTH_COOKIE = process.env.AUTH_COOKIE_NAME || 'pumpaj_session';

function extractTokenFromCookie(header?: string | string[]): string | null {
  if (!header) return null;
  const raw = Array.isArray(header) ? header.join(';') : header;
  if (!raw) return null;
  const parts = raw.split(/;\s*/);
  for (const part of parts) {
    if (!part) continue;
    const [name, value] = part.split('=');
    if (!name || value === undefined) continue;
    if (name.trim() === AUTH_COOKIE) return decodeURIComponent(value);
  }
  return null;
}

export type Authed = Request & { user?: { id: string; email?: string; username?: string; plan: 'FREE'|'PREMIUM'; planExpiresAt?: string | null } };

export function requireAuth(req: Authed, res: Response, next: NextFunction) {
  try {
    const hdr = String(req.headers.authorization || '');
    let token = hdr.startsWith('Bearer ') ? hdr.slice(7) : null;
    if (!token) {
      // Fallback for SSE/EventSource where setting custom headers is hard: allow ?token=...
      const q = (req.query || {}) as any;
      if (q.token && typeof q.token === 'string') token = q.token;
    }
    if (!token) {
      token = extractTokenFromCookie(req.headers.cookie);
    }
    if (!token) return res.status(401).json({ error: 'unauthorized' });
    const claims = verifyAppJwt(token);
    const stored = getActiveUser(String(claims.sub));
    const plan = stored?.plan ?? ((claims as any).plan === 'PREMIUM' ? 'PREMIUM' : 'FREE');
    const planExpiresAt = stored?.planExpiresAt ?? (claims as any).planExpiresAt;
    req.user = {
      id: String(claims.sub),
      email: stored?.email ?? claims.email,
      username: stored?.username ?? (claims as any).username,
      plan,
      planExpiresAt,
    };
    return next();
  } catch {
    return res.status(401).json({ error: 'unauthorized' });
  }
}
