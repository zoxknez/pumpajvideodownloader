import type { Request, Response } from 'express';
import { setPlan, getUserById, upsertUser } from '../storage/usersRepo.js';
import { signAppJwt, verifyAppJwt } from '../core/jwksVerify.js';

export async function authActivate(req: Request, res: Response) {
  try {
    const hdr = String(req.headers.authorization || '');
    const token = hdr.startsWith('Bearer ') ? hdr.slice(7) : '';
    if (!token) return res.status(401).json({ error: 'NO_AUTH' });
    const me = verifyAppJwt(token);

    const { licenseKey } = (req.body || {}) as { licenseKey?: string };
    if (!licenseKey) return res.status(400).json({ error: 'LICENSE_REQUIRED' });

    // Demo: bilo koji ne-prazan ključ aktivira PREMIUM
    setPlan(String(me.sub), 'PREMIUM');
    const updated = getUserById(String(me.sub)) || { id: String(me.sub), email: me.email || '', plan: 'PREMIUM' as const };
    upsertUser(updated);

    const fresh = signAppJwt({ sub: updated.id, email: updated.email, plan: 'PREMIUM' });
    return res.json({ token: fresh });
  } catch (e: any) {
    return res.status(401).json({ error: 'ACTIVATE_FAILED', detail: e?.message });
  }
}
