import type { Express, Request, Response } from 'express';
import { randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { upsertUserFromProvider, createUserWithPassword, findUserByUsername, getActiveUser } from '../storage/usersRepo.js';
import type { DbUser } from '../storage/usersRepo.js';
import { signAppJwt, verifyAppJwt } from '../core/jwksVerify.js';
import { policyFor } from '../core/policy.js';
import { requireAuth } from '../middleware/auth.js';

// Minimal mocked auth: exchange a provider token (pretend verified) for app-session JWT.
// In production, verify provider token/jwks here.

const AUTH_COOKIE = process.env.AUTH_COOKIE_NAME || 'pumpaj_session';
const COOKIE_SECURE = process.env.COOKIE_SECURE === 'true' || process.env.NODE_ENV === 'production';
const COOKIE_MAX_AGE = 1000 * 60 * 60 * 24 * 30; // 30d
const BCRYPT_ROUNDS = Number(process.env.AUTH_BCRYPT_ROUNDS || '12');

function safeUserPayload(user: DbUser | null | undefined) {
  if (!user) return null;
  const { passwordHash, usernameLower, ...rest } = user;
  void passwordHash;
  void usernameLower;
  return rest;
}

function issueToken(user: DbUser, expiresIn?: string, extraClaims?: Record<string, unknown>) {
  const payload = {
    sub: user.id,
    email: user.email,
    username: user.username,
    plan: user.plan,
    planExpiresAt: user.planExpiresAt,
    guest: user.guest ? true : undefined,
    ...extraClaims,
  } as Record<string, unknown>;
  if (!payload.planExpiresAt) delete payload.planExpiresAt;
  if (!payload.guest) delete payload.guest;
  return signAppJwt(payload, expiresIn);
}

function setAuthCookie(res: Response, token: string, maxAgeMs?: number) {
  try {
    res.cookie(AUTH_COOKIE, token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: COOKIE_SECURE,
      maxAge: typeof maxAgeMs === 'number' ? maxAgeMs : COOKIE_MAX_AGE,
      path: '/',
    });
  } catch {}
}

function clearAuthCookie(res: Response) {
  try {
    res.clearCookie(AUTH_COOKIE, {
      httpOnly: true,
      sameSite: 'lax',
      secure: COOKIE_SECURE,
      path: '/',
    });
  } catch {}
}

function respondWithAuth(res: Response, user: DbUser, options?: { expiresIn?: string; extraClaims?: Record<string, unknown>; extraBody?: Record<string, unknown>; cookieMaxAgeMs?: number }) {
  const active = getActiveUser(user.id) || user;
  const token = issueToken(active, options?.expiresIn, options?.extraClaims);
  setAuthCookie(res, token, options?.cookieMaxAgeMs);
  return res.json({
    token,
    user: safeUserPayload(active),
    policy: policyFor(active.plan),
    ...(options?.extraBody ?? {}),
  });
}

export function mountAuthRoutes(app: Express) {
  app.post('/auth/register', async (req: Request, res: Response) => {
    try {
      const { username, email, password } = (req.body || {}) as { username?: string; email?: string; password?: string };
      const handle = String(username || '').trim();
      const mail = email === undefined ? undefined : String(email || '').trim();
      const pwd = String(password || '');
      if (!handle || handle.length < 3) return res.status(400).json({ error: 'username_invalid', message: 'Username mora imati bar 3 karaktera.' });
      if (pwd.length < 6) return res.status(400).json({ error: 'password_invalid', message: 'Lozinka mora imati bar 6 karaktera.' });
      const hash = await bcrypt.hash(pwd, BCRYPT_ROUNDS);
      let user;
      try {
        user = createUserWithPassword(handle, hash, mail);
      } catch (err: any) {
        if (err?.message === 'username_taken') return res.status(409).json({ error: 'username_taken' });
        throw err;
      }
      return respondWithAuth(res, user);
    } catch (e: any) {
      return res.status(500).json({ error: 'register_failed', message: String(e?.message || e) });
    }
  });

  app.post('/auth/login', async (req: Request, res: Response) => {
    try {
      const { username, password } = (req.body || {}) as { username?: string; password?: string };
      const handle = String(username || '').trim();
      const pwd = String(password || '');
      if (!handle || !pwd) return res.status(400).json({ error: 'missing_credentials' });
      const user = findUserByUsername(handle);
      if (!user || !user.passwordHash) return res.status(401).json({ error: 'invalid_credentials' });
      const ok = await bcrypt.compare(pwd, user.passwordHash);
      if (!ok) return res.status(401).json({ error: 'invalid_credentials' });
      return respondWithAuth(res, user);
    } catch (e: any) {
      return res.status(500).json({ error: 'login_failed', message: String(e?.message || e) });
    }
  });

  app.post('/auth/logout', async (_req: Request, res: Response) => {
    clearAuthCookie(res);
    return res.json({ ok: true });
  });

  app.post('/auth/guest', async (req: Request, res: Response) => {
    try {
      const bodyTtl = Number((req.body as any)?.ttlMinutes);
      const envTtl = Number(process.env.GUEST_SESSION_TTL_MINUTES || process.env.GUEST_TTL_MINUTES || process.env.GUEST_TTL);
      const defaultTtl = 120;
      const rawTtl = Number.isFinite(bodyTtl) ? bodyTtl : envTtl;
      let ttlMinutes = Number.isFinite(rawTtl) ? rawTtl : defaultTtl;
      if (!Number.isFinite(ttlMinutes) || ttlMinutes <= 0) ttlMinutes = defaultTtl;
      ttlMinutes = Math.max(5, Math.min(720, Math.round(ttlMinutes)));
      const ttlMs = ttlMinutes * 60_000;
      const guestId = `guest_${randomUUID()}`;
      const idSuffix = guestId.replace(/[^a-z0-9]/gi, '').slice(-6) || guestId.slice(-6);
      const username = `Guest-${idSuffix.toUpperCase()}`;
      const expiresAt = new Date(Date.now() + ttlMs).toISOString();
      const guestUser: DbUser = {
        id: guestId,
        username,
        plan: 'FREE',
        guest: true,
      };
      return respondWithAuth(res, guestUser, {
        expiresIn: `${ttlMinutes}m`,
        extraBody: { guestExpiresAt: expiresAt },
        cookieMaxAgeMs: ttlMs,
      });
    } catch (e: any) {
      return res.status(500).json({ error: 'guest_failed', message: String(e?.message || e) });
    }
  });

  app.get('/auth/whoami', requireAuth, (req: any, res: Response) => {
    const me = req.user;
    const policy = policyFor(me?.plan ?? 'FREE');
    res.json({ user: safeUserPayload(me), policy });
  });

  // Simple demo sign-in without body parsing
  app.get('/auth/demo', async (_req: Request, res: Response) => {
    try {
      const user = await upsertUserFromProvider('demo-user', 'demo@example.com', 'demo');
      const token = signAppJwt({ sub: user.id, email: user.email, username: user.username, plan: user.plan });
      setAuthCookie(res, token);
      return res.json({ token, user: safeUserPayload(user) });
    } catch (e: any) {
      return res.status(500).json({ error: 'exchange_failed', message: String(e?.message || e) });
    }
  });
  // Exchange endpoint: accepts provider token with { sub, email }
  app.post('/auth/exchange', async (req: Request, res: Response) => {
    try {
      const { sub, username, email } = (req.body || {}) as { sub?: string; username?: string; email?: string };
      const handle = (username || sub || '').toString().trim();
      const emailStr = email === undefined ? undefined : String(email).trim();
      if (!handle) return res.status(400).json({ error: 'missing_username' });
      const user = await upsertUserFromProvider(handle, emailStr, username || sub || undefined);
      const active = getActiveUser(user.id) || user;
      const token = signAppJwt({ sub: active.id, email: active.email, username: active.username, plan: active.plan, planExpiresAt: active.planExpiresAt });
      setAuthCookie(res, token);
      return res.json({ token, user: safeUserPayload(active) });
    } catch (e: any) {
      return res.status(500).json({ error: 'exchange_failed', message: String(e?.message || e) });
    }
  });

  // Refresh: verify existing app token then re-issue with new expiry
  app.post('/auth/refresh', async (req: Request, res: Response) => {
    try {
      const { token } = (req.body || {}) as { token?: string };
      if (!token) return res.status(400).json({ error: 'missing_token' });
      const claims = verifyAppJwt(token);
      const fallbackUser = {
        id: String(claims.sub),
        email: claims.email,
        username: (claims as any).username,
        plan: (claims as any).plan ?? 'FREE',
        planExpiresAt: (claims as any).planExpiresAt,
      } as DbUser;
      const user = getActiveUser(String(claims.sub)) ?? fallbackUser;
      const nextToken = signAppJwt({ sub: user.id, email: user.email, username: user.username, plan: user.plan, planExpiresAt: user.planExpiresAt });
      return res.json({ token: nextToken });
    } catch {
      return res.status(401).json({ error: 'unauthorized' });
    }
  });

  // Who am I + policy
  app.get('/api/me', requireAuth, (req: any, res: Response) => {
    const me = req.user;
    const policy = policyFor(me?.plan);
    res.json({ user: safeUserPayload(me), policy });
  });
}
