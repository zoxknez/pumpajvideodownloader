import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { app } from '../index.js';
import { signAppJwt } from '../core/jwksVerify.js';
import { appendHistory, clearHistory, readHistory, writeHistory } from '../core/history.js';

const token = signAppJwt({ sub: 'history-user', email: 'history@test.dev', plan: 'PREMIUM' });

let backup: ReturnType<typeof readHistory> = [];

beforeAll(() => {
  backup = readHistory();
  clearHistory();
});

afterAll(() => {
  writeHistory(backup);
});

describe('history endpoints auth', () => {
  it('rejects unauthenticated access to GET /api/history', async () => {
    const res = await request(app).get('/api/history');
    expect(res.status).toBe(401);
  });

  it('returns history items when authenticated', async () => {
    const res = await request(app)
      .get('/api/history')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('items');
    expect(Array.isArray(res.body.items)).toBe(true);
  });

  it('allows appending history and reflecting it in authenticated GET', async () => {
    const entry = appendHistory({
      id: 'test-history-entry',
      title: 'History Test Video',
      url: 'https://example.com/video',
      type: 'video',
      format: 'mp4',
      status: 'completed',
    });

    const res = await request(app)
      .get('/api/history')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.items.some((item: any) => item.id === entry.id)).toBe(true);
  });

  it('rejects unauthenticated DELETE /api/history', async () => {
    const res = await request(app).delete('/api/history');
    expect(res.status).toBe(401);
  });

  it('clears history when authenticated DELETE /api/history', async () => {
    const res = await request(app)
      .delete('/api/history')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ok: true });

    const followUp = await request(app)
      .get('/api/history')
      .set('Authorization', `Bearer ${token}`);

    expect(followUp.status).toBe(200);
    expect(Array.isArray(followUp.body.items)).toBe(true);
    expect(followUp.body.items.length).toBe(0);
  });
});
