import express from 'express';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ReadableStream } from 'node:stream/web';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../core/ssrfGuard.js', () => ({
  assertPublicHttpHost: vi.fn().mockResolvedValue(undefined),
}));

import type { AppConfig } from '../core/config.js';
import { signAppJwt } from '../core/jwksVerify.js';
import { createProxyDownloadHandler } from '../routes/proxyDownload.js';
import { app, metrics } from '../index.js';
import { assertPublicHttpHost } from '../core/ssrfGuard.js';
import { resetMetrics } from '../core/metrics.js';

const assertMock = vi.mocked(assertPublicHttpHost);
assertMock.mockResolvedValue(undefined as any);

describe('proxy download size guards', () => {
  const baseConfig: AppConfig = {
    port: 5176,
    corsOrigin: true,
    maxFileSizeMb: 1,
    maxDurationSec: undefined,
    allowedHosts: undefined,
    proxyDownloadMaxPerMin: undefined,
  };

  const originalFetch = globalThis.fetch;

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
    assertMock.mockReset();
    assertMock.mockResolvedValue(undefined as any);
    globalThis.fetch = originalFetch;
  });

  beforeEach(() => {
    resetMetrics(metrics);
  });

  function parseJson(res: request.Response) {
    if (res.body && !Buffer.isBuffer(res.body)) return res.body;
    const raw = res.text ?? (Buffer.isBuffer(res.body) ? res.body.toString('utf8') : undefined);
    return raw ? JSON.parse(raw) : undefined;
  }

  it('rejects upfront when content-length exceeds configured limit', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      headers: new Headers({
        'content-length': String(2 * 1024 * 1024),
        'content-type': 'application/octet-stream',
      }),
      body: null,
    } as any);
    vi.stubGlobal('fetch', fetchMock);

    const testApp = express();
    testApp.get('/proxy', createProxyDownloadHandler(baseConfig));

    const res = await request(testApp).get('/proxy').query({ url: 'https://example.com/big.bin' });
    expect(res.status).toBe(413);
    expect(parseJson(res)).toEqual({ error: 'SIZE_LIMIT' });
    expect(res.headers['proxy-status']).toBe('pumpaj; error="size_limit"; details="content-length 2097152"');
    expect(res.headers['connection']).toBe('close');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('aborts streaming when upstream bytes exceed limit', async () => {
    const chunk = new Uint8Array(1.5 * 1024 * 1024);
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(chunk);
        controller.close();
      },
    });

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      headers: new Headers({ 'content-type': 'application/octet-stream', etag: 'etag-value' }),
      body,
    } as any);
    vi.stubGlobal('fetch', fetchMock);

    const testApp = express();
    testApp.get('/proxy', createProxyDownloadHandler(baseConfig));

    const res = await request(testApp).get('/proxy').query({ url: 'https://example.com/stream.bin' });
    expect(res.status).toBe(502);
    expect(parseJson(res)).toEqual({ error: 'UPSTREAM_SIZE_LIMIT' });
    expect(res.headers['proxy-status']).toBe('pumpaj; error="upstream_size_limit"; details="stream exceeded local limit"');
    expect(res.headers['etag']).toBeUndefined();
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.headers['accept-ranges']).toBe('bytes');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('propagates upstream 500 as proxy error with Proxy-Status', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      headers: new Headers(),
      body: null,
    } as any);
    vi.stubGlobal('fetch', fetchMock);

    const testApp = express();
    testApp.get('/proxy', createProxyDownloadHandler(baseConfig));

    const res = await request(testApp).get('/proxy').query({ url: 'https://example.com/fail.bin' });
    expect(res.status).toBe(502);
    expect(parseJson(res)).toEqual({ error: 'PROXY_ERROR' });
    expect(res.headers['proxy-status']).toBe('pumpaj; error="upstream_error"; details="status 500"');
  });

  it('returns 429 with retry-after when upstream is rate limited', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      headers: new Headers({ 'retry-after': '45' }),
      body: null,
    } as any);
    vi.stubGlobal('fetch', fetchMock);

    const testApp = express();
    testApp.get('/proxy', createProxyDownloadHandler(baseConfig));

    const res = await request(testApp).get('/proxy').query({ url: 'https://example.com/rate.bin' });
    expect(res.status).toBe(429);
    expect(parseJson(res)).toEqual({ error: 'UPSTREAM_RATELIMIT' });
    expect(res.headers['retry-after']).toBe('45');
    expect(res.headers['proxy-status']).toBe('pumpaj; error="upstream_ratelimit"; details="status 429"');
  });
});

describe('job file download range handling', () => {
  const token = signAppJwt({ sub: 'range-tester', email: 'range@test.local', plan: 'PREMIUM' });

  it('returns 416 for unsatisfiable ranges and keeps body empty', async () => {
    const jobId = 'range-job';
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pumpaj-range-'));
    const tmpId = 'range-check';
    const produced = `${tmpId}.mp4`;
    const filePath = path.join(tmpDir, produced);
    fs.writeFileSync(filePath, Buffer.alloc(1024));

    const jobs: Map<string, any> = (app as any).locals.jobs;
  jobs.set(jobId, { id: jobId, type: 'video', tmpId, tmpDir, produced, version: 1 });

    try {
      const res = await request(app)
        .get(`/api/job/file/${jobId}`)
        .set('Authorization', `Bearer ${token}`)
        .set('Range', 'bytes=4096-8192');

      expect(res.status).toBe(416);
      expect(res.headers['content-range']).toBe('bytes */1024');
  expect((res.text ?? '')).toBe('');
      expect(jobs.has(jobId)).toBe(true);
    } finally {
      jobs.delete(jobId);
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('respects HEAD with etag and keeps file', async () => {
    const jobId = 'head-job';
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pumpaj-head-'));
    const tmpId = 'head-check';
    const produced = `${tmpId}.mp4`;
    const filePath = path.join(tmpDir, produced);
    fs.writeFileSync(filePath, Buffer.alloc(2048));

    const jobs: Map<string, any> = (app as any).locals.jobs;
  jobs.set(jobId, { id: jobId, type: 'video', tmpId, tmpDir, produced, version: 1 });

    try {
      const res = await request(app)
        .head(`/api/job/file/${jobId}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.headers['etag']).toMatch(/^W\//);
      expect(res.headers['content-length']).toBe('2048');
      expect(fs.existsSync(filePath)).toBe(true);
      expect(jobs.has(jobId)).toBe(true);
    } finally {
      jobs.delete(jobId);
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('returns 304 when If-None-Match matches and keeps file for retry', async () => {
    const jobId = 'etag-job';
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pumpaj-etag-'));
    const tmpId = 'etag-check';
    const produced = `${tmpId}.mp3`;
    const filePath = path.join(tmpDir, produced);
    fs.writeFileSync(filePath, Buffer.alloc(512));

    const jobs: Map<string, any> = (app as any).locals.jobs;
  jobs.set(jobId, { id: jobId, type: 'audio', tmpId, tmpDir, produced, version: 1 });

    try {
      const headRes = await request(app)
        .head(`/api/job/file/${jobId}`)
        .set('Authorization', `Bearer ${token}`);
      const etag = headRes.headers['etag'];
      expect(etag).toBeTruthy();

      const res = await request(app)
        .get(`/api/job/file/${jobId}`)
        .set('Authorization', `Bearer ${token}`)
        .set('If-None-Match', String(etag));

      expect(res.status).toBe(304);
      expect(res.text ?? '').toBe('');
      expect(fs.existsSync(filePath)).toBe(true);
    } finally {
      jobs.delete(jobId);
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});

describe('prometheus metrics exposure', () => {
  const token = signAppJwt({ sub: 'metrics-user', email: 'metrics@test.local', plan: 'PREMIUM' });

  it('tracks proxy downloads and exposes counters', async () => {
    const chunk = new Uint8Array([1, 2, 3, 4]);
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(chunk);
        controller.close();
      },
    });
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({
        'content-type': 'application/octet-stream',
        'content-length': String(chunk.byteLength),
      }),
      body,
    } as any);
    vi.stubGlobal('fetch', fetchMock);

    const res = await request(app)
      .get('/api/proxy-download')
      .query({ url: 'https://example.com/file.bin', filename: 'file.bin' })
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const metricsRes = await request(app).get('/metrics.prom');
    expect(metricsRes.status).toBe(200);
    const text = metricsRes.text;
    expect(text).toContain('pumpaj_proxy_requests_total 1');
    expect(text).toContain('pumpaj_proxy_success_total 1');
    expect(text).toContain('pumpaj_proxy_bytes_total 4');
    expect(text).toMatch(/pumpaj_proxy_duration_seconds_bucket\{le="\+Inf"\} 1/);
  });
});

describe('audio format whitelist', () => {
  const token = signAppJwt({ sub: 'audio-tester', email: 'audio@test.local', plan: 'PREMIUM' });

  it('rejects invalid format in direct audio download', async () => {
    const res = await request(app)
      .get('/api/download/audio')
      .query({ url: 'https://example.com/test', title: 'audio', format: 'badformat' })
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'invalid_format' });
  });

  it('rejects invalid format when starting audio job', async () => {
    const res = await request(app)
      .post('/api/job/start/audio')
      .set('Authorization', `Bearer ${token}`)
      .send({ url: 'https://example.com/test', title: 'song', format: 'weird' });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'invalid_format' });
  });

  it('propagates SSRF errors such as NXDOMAIN', async () => {
    assertMock.mockRejectedValueOnce(Object.assign(new Error('NXDOMAIN'), { code: 'NXDOMAIN' }));

    const res = await request(app)
      .get('/api/download/audio')
      .query({ url: 'https://no-such-host.invalid', title: 'audio' })
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ ok: false, error: { code: 'NXDOMAIN' } });
  });
});
