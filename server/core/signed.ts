import { createHmac, timingSafeEqual } from 'node:crypto';

export type Scope = 'download' | 'progress';
export type TokenPayload = {
  sub: string;
  scope: Scope;
  exp: number;
  iat: number;
  ver?: number;
};

type VerifyExpect = {
  sub: string;
  scope: Scope;
  ver?: number;
};

type VerifyFailureReason =
  | 'FORMAT'
  | 'KID_OR_HMAC'
  | 'SIG_MISMATCH'
  | 'JSON'
  | 'EXPIRED'
  | 'SUB'
  | 'SCOPE'
  | 'VER';

const ACTIVE_KID = process.env.SIGN_KID_ACTIVE || 'v1';
const ACTIVE_SECRET = process.env.LINK_SIGN_SECRET || 'dev-secret';
const KEY_FALLBACK = process.env.LINK_SIGN_SECRET_OLD;

const KEYS: Record<string, string> = {
  [ACTIVE_KID]: ACTIVE_SECRET,
};

if (KEY_FALLBACK) {
  KEYS.v0 = KEY_FALLBACK;
}

const b64u = {
  enc: (buf: Buffer) =>
    buf
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/g, ''),
  dec: (input: string) => {
    const normalized = input.replace(/-/g, '+').replace(/_/g, '/');
    const padding = normalized.length % 4;
    const padded = padding ? normalized.padEnd(normalized.length + 4 - padding, '=') : normalized;
    return Buffer.from(padded, 'base64');
  },
};

function hmac(kid: string, data: string) {
  const secret = KEYS[kid];
  if (!secret) {
    throw Object.assign(new Error('UNKNOWN_KID'), { code: 'UNKNOWN_KID' });
  }
  return createHmac('sha256', secret).update(data).digest();
}

export function signToken(payload: Omit<TokenPayload, 'iat' | 'exp'>, ttlSec: number): string {
  const kid = ACTIVE_KID;
  const issuedAt = Math.floor(Date.now() / 1000);
  const ttlNormalized = Number.isFinite(ttlSec) ? Math.floor(ttlSec) : 0;
  const ttlClamped = Math.max(1, Math.min(ttlNormalized > 0 ? ttlNormalized : 0, 3600));
  const exp = issuedAt + ttlClamped;
  const fullPayload: TokenPayload = { ...payload, iat: issuedAt, exp };
  const body = b64u.enc(Buffer.from(JSON.stringify(fullPayload)));
  const signature = b64u.enc(hmac(kid, body));
  return `${kid}.${body}.${signature}`;
}

export function verifyToken(token: string, expect: VerifyExpect) {
  const parts = typeof token === 'string' ? token.split('.') : [];
  if (parts.length !== 3) {
    return { ok: false as const, reason: 'FORMAT' as VerifyFailureReason };
  }

  const [kid, body, sigPart] = parts;

  let signature: Buffer;
  let calculated: Buffer;
  try {
    signature = b64u.dec(sigPart);
    calculated = hmac(kid, body);
  } catch {
    return { ok: false as const, reason: 'KID_OR_HMAC' as VerifyFailureReason };
  }

  if (signature.length !== calculated.length || !timingSafeEqual(signature, calculated)) {
    return { ok: false as const, reason: 'SIG_MISMATCH' as VerifyFailureReason };
  }

  let payload: TokenPayload;
  try {
    payload = JSON.parse(b64u.dec(body).toString('utf8')) as TokenPayload;
  } catch {
    return { ok: false as const, reason: 'JSON' as VerifyFailureReason };
  }

  const now = Math.floor(Date.now() / 1000);
  if (!Number.isFinite(payload.exp) || payload.exp <= now) {
    return { ok: false as const, reason: 'EXPIRED' as VerifyFailureReason };
  }
  if (payload.sub !== expect.sub) {
    return { ok: false as const, reason: 'SUB' as VerifyFailureReason };
  }
  if (payload.scope !== expect.scope) {
    return { ok: false as const, reason: 'SCOPE' as VerifyFailureReason };
  }
  if (typeof expect.ver === 'number' && payload.ver !== expect.ver) {
    return { ok: false as const, reason: 'VER' as VerifyFailureReason };
  }

  return { ok: true as const, payload, kid };
}

export type VerifyResult =
  | { ok: true; payload: TokenPayload; kid: string }
  | { ok: false; reason: VerifyFailureReason };
