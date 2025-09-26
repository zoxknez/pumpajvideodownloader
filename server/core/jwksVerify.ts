import jwt from 'jsonwebtoken';
import type { JwtPayload } from 'jsonwebtoken';

// Minimal JWKS cache via remote JWKS URL (Auth0-like). In production, use a solid JWKS client.
// For simplicity, accept HS256 fallback via APP_JWT_SECRET if provided.

const APP_JWT_ISSUER = process.env.APP_JWT_ISSUER || process.env.APP_JWT_ISS || 'yt-dlp-server';
const APP_JWT_AUDIENCE = process.env.APP_JWT_AUDIENCE || process.env.APP_JWT_AUD || 'yt-dlp-api';
const APP_JWT_PRIVATE = process.env.APP_JWT_PRIVATE_KEY || '';
const APP_JWT_PUBLIC = process.env.APP_JWT_PUBLIC_KEY || '';
const APP_JWT_SECRET = process.env.APP_JWT_SECRET || '';

function devSecretFallback() {
  // For development only: use a fixed HS256 secret if none provided
  if (process.env.NODE_ENV === 'production') return '';
  if (!APP_JWT_PRIVATE && !APP_JWT_PUBLIC && !APP_JWT_SECRET) return 'dev-secret';
  return '';
}

export type ProviderClaims = JwtPayload & { sub: string; email?: string; username?: string };

export function signAppJwt(claims: object, expiresIn = '15m') {
  if (APP_JWT_PRIVATE) {
  return jwt.sign(claims as any, APP_JWT_PRIVATE as any, { algorithm: 'RS256', issuer: APP_JWT_ISSUER, audience: APP_JWT_AUDIENCE, expiresIn } as any) as string;
  }
  const secret = APP_JWT_SECRET || devSecretFallback();
  if (secret) return jwt.sign(claims as any, secret as any, { algorithm: 'HS256', issuer: APP_JWT_ISSUER, audience: APP_JWT_AUDIENCE, expiresIn } as any) as string;
  throw new Error('Missing APP_JWT_PRIVATE_KEY or APP_JWT_SECRET');
}

export function verifyAppJwt(token: string): ProviderClaims {
  const key = (APP_JWT_PUBLIC || APP_JWT_SECRET || devSecretFallback()) as any;
  if (!key) throw new Error('Missing APP_JWT_PUBLIC_KEY or APP_JWT_SECRET');
  const decoded = jwt.verify(token, key, { algorithms: APP_JWT_PUBLIC ? ['RS256'] : ['HS256'], issuer: APP_JWT_ISSUER, audience: APP_JWT_AUDIENCE } as any) as unknown as ProviderClaims;
  return decoded;
}
