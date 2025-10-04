import fs from 'node:fs';
import path from 'node:path';
import request from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';

import { app } from '../index.js';
import { signAppJwt } from '../core/jwksVerify.js';

const usersFile = path.resolve(process.cwd(), 'data', 'users.json');
const createdUserIds: string[] = [];

afterAll(() => {
  if (!createdUserIds.length) return;
  try {
    const raw = fs.existsSync(usersFile) ? fs.readFileSync(usersFile, 'utf8') : '[]';
    const parsedRaw = JSON.parse(raw);
    const parsed = Array.isArray(parsedRaw) ? parsedRaw : [];
    const filtered = parsed.filter((u: any) => !createdUserIds.includes(u?.id));
    fs.writeFileSync(usersFile, JSON.stringify(filtered, null, 2), 'utf8');
  } catch {}
});

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

describe('registration flow', () => {
  it('grants premium status to newly registered users', async () => {
    const username = `trial-${Date.now().toString(36)}`;
    const res = await request(app)
      .post('/auth/register')
      .send({ username, password: 'secret123', email: `${username}@test.dev` });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('user');
    expect(res.body.user).toMatchObject({ plan: 'PREMIUM' });
    expect(res.body.user?.planExpiresAt).toBeFalsy();
    expect(res.body).toHaveProperty('policy');
    expect(res.body.policy).toMatchObject({ plan: 'PREMIUM' });
    if (res.body.user?.id) createdUserIds.push(res.body.user.id);
  });
});
