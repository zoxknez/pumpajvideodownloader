import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../core/ssrfGuard.js', () => ({
  assertPublicHttpHost: vi.fn().mockResolvedValue(undefined),
}));

import { app } from '../index.js';
import { signAppJwt } from '../core/jwksVerify.js';
import { assertPublicHttpHost } from '../core/ssrfGuard.js';

const assertMock = vi.mocked(assertPublicHttpHost);

describe('job start validation', () => {
  const token = signAppJwt({ sub: 'validator', email: 'validator@test.local', plan: 'PREMIUM' });

  afterEach(() => {
    assertMock.mockReset();
    assertMock.mockResolvedValue(undefined as any);
  });

  it('rejects video job without url', async () => {
    const res = await request(app)
      .post('/api/job/start/best')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'My clip' });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'invalid_url' });
  });

  it('rejects audio job with invalid format characters', async () => {
    const res = await request(app)
      .post('/api/job/start/audio')
      .set('Authorization', `Bearer ${token}`)
      .send({ url: 'https://example.com/audio', title: 'Song', format: '../m4a' });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'invalid_format' });
  });

  it('rejects clip job with inverted range', async () => {
    const res = await request(app)
      .post('/api/job/start/clip')
      .set('Authorization', `Bearer ${token}`)
      .send({ url: 'https://example.com/video', title: 'Clip', start: 20, end: 10 });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'invalid_range' });
  });
});
