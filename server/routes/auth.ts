import type { Express, Request, Response } from 'express';
import { upsertUserFromProvider, getUserById } from '../db/usersRepo.js';
import { signAppJwt, verifyAppJwt } from '../core/jwksVerify.js';
import { policyFor } from '../core/policy.js';
import { requireAuth } from '../middleware/auth.js';

// Minimal mocked auth: exchange a provider token (pretend verified) for app-session JWT.
// In production, verify provider token/jwks here.

export function mountAuthRoutes(app: Express) {
  // Simple demo sign-in without body parsing
  app.get('/auth/demo', async (_req: Request, res: Response) => {
    try {
      const user = await upsertUserFromProvider('demo-user', 'demo@example.com', 'demo');
      const token = signAppJwt({ sub: user.id, email: user.email, username: user.username, plan: user.plan });
      return res.json({ token, user: { id: user.id, email: user.email, username: user.username, plan: user.plan } });
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
      const token = signAppJwt({ sub: user.id, email: user.email, username: user.username, plan: user.plan });
      return res.json({ token, user: { id: user.id, email: user.email, username: user.username, plan: user.plan } });
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
      const user =
        (await getUserById(String(claims.sub))) ||
        (({
          id: String(claims.sub),
          email: claims.email,
          username: (claims as any).username,
          plan: (claims as any).plan ?? 'FREE',
        }) as any);
      const nextToken = signAppJwt({ sub: user.id, email: user.email, username: user.username, plan: user.plan });
      return res.json({ token: nextToken });
    } catch {
      return res.status(401).json({ error: 'unauthorized' });
    }
  });

  // Who am I + policy
  app.get('/api/me', requireAuth, (req: any, res: Response) => {
    const me = req.user;
    const policy = policyFor(me?.plan);
    res.json({ user: me, policy });
  });
}
