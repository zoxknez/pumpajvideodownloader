import type { SuperAgentRequest } from 'superagent';
import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { app } from '../index.js';
import { signAppJwt } from '../core/jwksVerify.js';

function expectSseOk(req: SuperAgentRequest) {
  return new Promise<string>((resolve, reject) => {
    let buffer = '';
    let finished = false;

    req
      .set('Accept', 'text/event-stream')
      .buffer(false)
      .on('response', (res) => {
        if (res.statusCode !== 200) {
          finished = true;
          return reject(new Error(`Expected 200, got ${res.statusCode}`));
        }
        res.on('data', (chunk: Buffer) => {
          buffer += chunk.toString('utf8');
          if (buffer.includes('\n\n') && !finished) {
            finished = true;
            resolve(buffer);
            req.abort();
          }
        });
        res.on('end', () => {
          if (!finished) {
            finished = true;
            resolve(buffer);
          }
        });
      })
      .on('error', (err) => {
        if (!finished && ((req as any)._aborted || (err as any)?.code === 'ECONNRESET')) {
          finished = true;
          return resolve(buffer);
        }
        if (!finished) reject(err);
      })
      .end();
  });
}

describe('progress SSE auth', () => {
  const token = signAppJwt({ sub: 'sse-user', email: 'sse@pumpaj.dev', plan: 'PREMIUM' });

  it('rejects missing auth headers', async () => {
    const res = await request(app).get('/api/progress/test-job');
    expect(res.status).toBe(401);
  });

  it('accepts SSE with auth header', async () => {
    const body = await expectSseOk(
      request(app)
        .get('/api/progress/test-job')
        .set('Authorization', `Bearer ${token}`),
    );
    expect(body).toContain('event: ping');
  });

  it('accepts SSE with token query param', async () => {
    const body = await expectSseOk(
      request(app)
        .get(`/api/progress/test-job?token=${token}`),
    );
    expect(body).toContain('event: ping');
  });

  it('replays buffered events when Last-Event-ID is provided', async () => {
    const jobId = 'resume-job';
    const locals = app.locals as any;
    locals.pushSse(jobId, { id: jobId, progress: 40 }, undefined, 100);
    locals.pushSse(jobId, { id: jobId, progress: 90 }, undefined, 120);

    const body = await expectSseOk(
      request(app)
        .get(`/api/progress/${jobId}`)
        .set('Authorization', `Bearer ${token}`)
        .set('Last-Event-ID', '110'),
    );
    expect(body).not.toContain('progress":40');
    expect(body).toContain('progress":90');

    (locals.sseBuffers as Map<string, string[]>).delete(jobId);
  });
});
