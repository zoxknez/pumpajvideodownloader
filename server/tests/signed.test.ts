import express from 'express';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { signToken, verifyToken } from '../core/signed.js';
import { requireAuthOrSigned } from '../middleware/signed.js';

const JOB_TEMPLATE = { version: 1 } as const;

describe('signed tokens', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-01-01T00:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('sign/verify ok', () => {
    const token = signToken({ sub: 'job:abc', scope: 'download', ver: 1 }, 120);
    const result = verifyToken(token, { sub: 'job:abc', scope: 'download', ver: 1 });
    expect(result.ok).toBe(true);
  });

  it('scope mismatch', () => {
    const token = signToken({ sub: 'job:abc', scope: 'progress', ver: 1 }, 60);
    const result = verifyToken(token, { sub: 'job:abc', scope: 'download', ver: 1 });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('SCOPE');
    }
  });

  it('tamper body fails', () => {
    const token = signToken({ sub: 'job:x', scope: 'download', ver: 1 }, 60);
    const [kid, body, sig] = token.split('.');
    const fakeBody = body.slice(0, -1) + (body.endsWith('A') ? 'B' : 'A');
    const result = verifyToken([kid, fakeBody, sig].join('.'), { sub: 'job:x', scope: 'download', ver: 1 });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('SIG_MISMATCH');
    }
  });

  it('expired', () => {
    const now = Date.now();
    const token = signToken({ sub: 'job:x', scope: 'download', ver: 1 }, 1);
    vi.setSystemTime(now + 2000);
    const result = verifyToken(token, { sub: 'job:x', scope: 'download', ver: 1 });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('EXPIRED');
    }
  });
});

describe('requireAuthOrSigned middleware', () => {
  it('allows valid signed token', async () => {
    const app = express();
    app.locals.jobs = new Map<string, any>();
    app.locals.jobs.set('alpha', { ...JOB_TEMPLATE });
    app.get('/resource/:id', requireAuthOrSigned('download'), (_req, res) => {
      res.json({ ok: true });
    });

    const token = signToken({ sub: 'job:alpha', scope: 'download', ver: 1 }, 60);
    const res = await request(app).get('/resource/alpha').query({ s: token });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });

  it('rejects missing job for signed token', async () => {
    const app = express();
    app.locals.jobs = new Map<string, any>();
    const token = signToken({ sub: 'job:ghost', scope: 'download', ver: 1 }, 60);
    app.get('/resource/:id', requireAuthOrSigned('download'), (_req, res) => {
      res.json({ ok: true });
    });

    const res = await request(app).get('/resource/ghost').query({ s: token });
    expect(res.status).toBe(404);
  });
});
