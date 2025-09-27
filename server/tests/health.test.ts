import { describe, expect, it } from 'vitest';
import request from 'supertest';

import { app } from '../index.js';

describe('server health endpoints', () => {
  it('responds with ok on /health', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });

  it('responds with ok on /ready', async () => {
    const res = await request(app).get('/ready');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });

  it('serves landing page HTML on root', async () => {
    const res = await request(app).get('/');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/html/);
    expect(res.text).toContain('Pumpaj API');
  });

  it('returns version metadata', async () => {
    const res = await request(app).get('/api/version');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      name: expect.any(String),
      version: expect.any(String),
      node: expect.stringContaining('v'),
      checks: expect.objectContaining({
        ytdlpAvailable: expect.any(Boolean),
        ffmpegAvailable: expect.any(Boolean),
      }),
      settings: expect.objectContaining({
        maxConcurrent: expect.any(Number),
      }),
      queues: expect.objectContaining({
        totalJobs: expect.any(Number),
        running: expect.any(Number),
        waiting: expect.any(Number),
      }),
    });
  });
});
