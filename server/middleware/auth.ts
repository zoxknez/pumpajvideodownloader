import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { verifyAppJwt } from '../core/jwksVerify.js';
import { getSupabaseServiceClient } from '../core/supabaseAdmin.js';
import { getActiveUser } from '../storage/usersRepo.js';

const AUTH_COOKIE = process.env.AUTH_COOKIE_NAME || 'pumpaj_session';
const SUPABASE_JWT_SECRET = process.env.SUPABASE_JWT_SECRET || '';

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

export type Authed = Request & { user?: { id: string; email?: string; username?: string; plan: 'FREE'|'PREMIUM'; planExpiresAt?: string | null; guest?: boolean } };

export function requireAuth(req: Authed, res: Response, next: NextFunction) {
  const abort = () => res.status(401).json({ error: 'unauthorized' });

  (async () => {
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
      if (!token) return abort();

      // Try Supabase JWT first if SUPABASE_JWT_SECRET is set
      if (SUPABASE_JWT_SECRET) {
        try {
          const supabaseClaims = jwt.verify(token, SUPABASE_JWT_SECRET) as any;
          req.user = {
            id: String(supabaseClaims.sub),
            email: supabaseClaims.email,
            username: supabaseClaims.user_metadata?.full_name || supabaseClaims.email?.split('@')[0],
            plan: 'PREMIUM', // Default to PREMIUM for Supabase users
            planExpiresAt: null,
            guest: false,
          };
          return next();
        } catch (err: any) {
          // If Supabase verification fails, fall through to remote verification / app JWT
        }
      }

      // Try remote verification with Supabase service role key
      const supabaseService = getSupabaseServiceClient();
      if (supabaseService) {
        try {
          const { data, error } = await supabaseService.auth.getUser(token);
          if (!error && data?.user) {
            const user = data.user;
            req.user = {
              id: user.id,
              email: user.email ?? undefined,
              username:
                (user.user_metadata as Record<string, any> | null | undefined)?.username ||
                user.user_metadata?.full_name ||
                user.email?.split('@')[0],
              plan: 'PREMIUM',
              planExpiresAt: null,
              guest: false,
            };
            return next();
          }
          // Supabase remote verification failed, fallback to app JWT
        } catch (err) {
          // Supabase remote verification error, fallback to app JWT
        }
      }

      // Fall back to app JWT verification
      const claims = verifyAppJwt(token);
      const stored = getActiveUser(String(claims.sub));
      const plan = stored?.plan ?? ((claims as any).plan === 'PREMIUM' ? 'PREMIUM' : 'FREE');
      const planExpiresAt = stored?.planExpiresAt ?? (claims as any).planExpiresAt;
      const guest = Boolean((claims as any).guest);
      req.user = {
        id: String(claims.sub),
        email: stored?.email ?? claims.email,
        username: stored?.username ?? (claims as any).username,
        plan,
        planExpiresAt,
        guest,
      };
      return next();
    } catch {
      return abort();
    }
  })().catch((err) => {
    console.error('[AUTH] Unexpected auth middleware error', err);
    if (!res.headersSent) {
      res.status(500).json({ error: 'internal_error' });
    }
  });
}
