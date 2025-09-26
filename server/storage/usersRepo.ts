import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

// Unified user shape used across routes
export type Plan = 'FREE' | 'PREMIUM';
export interface DbUser {
  id: string;
  email?: string;
  username?: string;
  providerSub?: string;
  plan: Plan;
}

// Canonical location: <cwd>/data/users.json (when run from server/, this is server/data/users.json)
const DATA_DIR = path.resolve(process.cwd(), 'data');
const FILE = path.join(DATA_DIR, 'users.json');
// Legacy location for migration: <cwd>/server/data/users.json (resolved to server/server/data when cwd=server)
const LEGACY_DIR = path.resolve(process.cwd(), 'server', 'data');
const LEGACY_FILE = path.join(LEGACY_DIR, 'users.json');

function load(): DbUser[] {
  try {
    if (!fs.existsSync(FILE)) {
      // Try migrate from legacy location
      if (fs.existsSync(LEGACY_FILE)) {
        try {
          const legacyRaw = fs.readFileSync(LEGACY_FILE, 'utf8');
          const j = JSON.parse(legacyRaw || '[]');
          if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
          fs.writeFileSync(FILE, JSON.stringify(j, null, 2), 'utf8');
        } catch {}
      }
    }
    const raw = fs.readFileSync(FILE, 'utf8');
    const arr = JSON.parse(raw);
    if (Array.isArray(arr)) return arr as DbUser[];
    return [];
  } catch {
    return [];
  }
}
function save(list: DbUser[]) {
  const dir = path.dirname(FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(list, null, 2), 'utf8');
}

// Core helpers
export function getUserById(id: string): DbUser | undefined {
  return load().find((u) => u.id === id);
}

export function findUserByProviderSub(sub: string): DbUser | undefined {
  const all = load();
  return all.find((u) => u.providerSub === sub);
}

export function upsertUserFromProvider(sub: string, email?: string, username?: string): DbUser {
  const all = load();
  const existing = all.find((u) => u.providerSub === sub);
  if (existing) {
    const next: DbUser = {
      ...existing,
      email: email ?? existing.email,
      username: username ?? existing.username ?? sub,
      plan: existing.plan ?? 'FREE',
    };
    const i = all.findIndex((u) => u.id === existing.id);
    if (i >= 0) all[i] = next; else all.unshift(next);
    save(all);
    return next;
  }
  const id = randomUUID();
  const user: DbUser = {
    id,
    email,
    username: username || sub,
    providerSub: sub,
    plan: 'FREE',
  };
  all.unshift(user);
  save(all);
  return user;
}

export function setPlan(id: string, plan: Plan) {
  const all = load();
  const i = all.findIndex((x) => x.id === id);
  if (i >= 0) {
    all[i] = { ...all[i], plan };
    save(all);
  } else {
    all.unshift({ id, email: '', plan });
    save(all);
  }
}

// Back-compat for previous storage/usersRepo API used by authActivate.ts
export type UserRecord = { id: string; email: string; plan: Plan };
export function upsertUser(u: UserRecord) {
  const all = load();
  const i = all.findIndex((x) => x.id === u.id);
  const merged: DbUser = { ...u } as any;
  if (i >= 0) all[i] = { ...all[i], ...merged };
  else all.unshift(merged);
  save(all);
}
