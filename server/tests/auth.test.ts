import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { app } from '../index.js';
import { signAppJwt } from '../core/jwksVerify.js';

describe('auth guarded endpoints', () => {
  const token = signAppJwt({
    sub: 'user-test',
    email: 'tester@pumpaj.dev',
    plan: 'PREMIUM',
  });

  it('rejects metrics access without token', async () => {
    const res = await request(app).get('/api/jobs/metrics');
    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({ error: 'unauthorized' });
  });

  it('returns metrics payload with valid token', async () => {
    const res = await request(app)
      .get('/api/jobs/metrics')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      running: expect.any(Number),
      queued: expect.any(Number),
      maxConcurrent: expect.any(Number),
    });
  });
});
