import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

// Unified user shape used across routes
export type Plan = 'FREE' | 'PREMIUM';
export interface DbUser {
  id: string;
  email?: string;
  username?: string;
  usernameLower?: string;
  providerSub?: string;
  plan: Plan;
  planExpiresAt?: string | null;
  passwordHash?: string;
  createdAt?: string;
  updatedAt?: string;
}

function withNormalizedPlan(user: DbUser, now = Date.now()): { normalized: DbUser; changed: boolean } {
  if (!user) return { normalized: user, changed: false };
  let changed = false;
  const normalizedPlan: Plan = user.plan === 'FREE' ? 'FREE' : 'PREMIUM';
  let planExpiresAt = user.planExpiresAt;

  if (normalizedPlan !== user.plan) {
    changed = true;
  }

  if (normalizedPlan === 'PREMIUM' && planExpiresAt) {
    const expires = Date.parse(String(planExpiresAt));
    if (Number.isFinite(expires) && expires <= now) {
      return {
        normalized: { ...user, plan: 'FREE', planExpiresAt: undefined },
        changed: true,
      };
    }
  }

  if (normalizedPlan === 'FREE' && planExpiresAt) {
    planExpiresAt = undefined;
    changed = true;
  }

  return {
    normalized: { ...user, plan: normalizedPlan, planExpiresAt },
    changed,
  };
}

type Paths = {
  file: string;
  dir: string;
  legacyFile?: string;
  legacyDir?: string;
};

function resolvePaths(): Paths {
  const custom = process.env.USERS_DB_PATH ? path.resolve(process.env.USERS_DB_PATH) : undefined;
  if (custom) {
    return {
      file: custom,
      dir: path.dirname(custom),
    };
  }
  const dataDir = path.resolve(process.cwd(), 'data');
  const file = path.join(dataDir, 'users.json');
  const legacyDir = path.resolve(process.cwd(), 'server', 'data');
  const legacyFile = path.join(legacyDir, 'users.json');
  return { file, dir: path.dirname(file), legacyDir, legacyFile };
}

function normalizeUsername(username?: string | null) {
  const raw = String(username ?? '').trim();
  if (!raw) return { value: '', lower: '' } as const;
  return { value: raw, lower: raw.toLowerCase() } as const;
}

function load(): DbUser[] {
  const { file, dir, legacyFile } = resolvePaths();
  try {
    if (!fs.existsSync(file)) {
      // Try migrate from legacy location
      if (legacyFile && fs.existsSync(legacyFile)) {
        try {
          const legacyRaw = fs.readFileSync(legacyFile, 'utf8');
          const j = JSON.parse(legacyRaw || '[]');
          if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
          fs.writeFileSync(file, JSON.stringify(j, null, 2), 'utf8');
        } catch {}
      }
    }
    if (!fs.existsSync(file)) return [];
    const raw = fs.readFileSync(file, 'utf8');
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    const now = Date.now();
    let mutated = false;
    const normalized = (arr as DbUser[])
      .map((u) => {
        if (!u) return u;
        const { value, lower } = normalizeUsername(u.username);
        const { normalized: planUser, changed } = withNormalizedPlan(u, now);
        if (changed) mutated = true;
        return {
          ...planUser,
          username: value || undefined,
          usernameLower: lower || undefined,
          planExpiresAt: planUser.planExpiresAt ? String(planUser.planExpiresAt) : undefined,
        } as DbUser;
      })
      .filter(Boolean) as DbUser[];
    if (mutated) {
      try {
        save(normalized);
      } catch {}
    }
    return normalized;
  } catch {
    return [];
  }
}

function save(list: DbUser[]) {
  const { file, dir } = resolvePaths();
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const serializable = list.map((u) => ({ ...u, usernameLower: u.usernameLower || normalizeUsername(u.username).lower || undefined }));
  fs.writeFileSync(file, JSON.stringify(serializable, null, 2), 'utf8');
}

function withUpdatedTimestamps(user: DbUser, isNew: boolean): DbUser {
  const now = new Date().toISOString();
  return {
    ...user,
    createdAt: isNew ? now : user.createdAt ?? now,
    updatedAt: now,
  };
}

function indexById(users: DbUser[], id: string) {
  return users.findIndex((u) => u && u.id === id);
}

function indexByUsername(users: DbUser[], username: string) {
  const key = normalizeUsername(username).lower;
  if (!key) return -1;
  return users.findIndex((u) => (u?.usernameLower || normalizeUsername(u?.username).lower) === key);
}

// Core helpers
export function getUserById(id: string): DbUser | undefined {
  return load().find((u) => u.id === id);
}

export function findUserByProviderSub(sub: string): DbUser | undefined {
  const all = load();
  return all.find((u) => u.providerSub === sub);
}

export function findUserByUsername(username: string): DbUser | undefined {
  const key = normalizeUsername(username).lower;
  if (!key) return undefined;
  return load().find((u) => (u.usernameLower || normalizeUsername(u.username).lower) === key);
}

export function upsertUserFromProvider(sub: string, email?: string, username?: string): DbUser {
  const all = load();
  const existing = all.find((u) => u.providerSub === sub);
  const { value, lower } = normalizeUsername(username || existing?.username || sub);
  if (existing) {
    const { normalized: refreshed } = withNormalizedPlan(existing);
    const next: DbUser = withUpdatedTimestamps({
      ...existing,
      email: email ?? existing.email,
      username: value || existing.username || sub,
      usernameLower: lower || existing.usernameLower,
      plan: refreshed.plan ?? 'PREMIUM',
      planExpiresAt: refreshed.planExpiresAt,
    }, false);
    const i = indexById(all, existing.id);
    if (i >= 0) all[i] = next; else all.unshift(next);
    save(all);
    return next;
  }
  const id = randomUUID();
  const user: DbUser = withUpdatedTimestamps({
    id,
    email,
    username: value || sub,
    usernameLower: lower || normalizeUsername(sub).lower,
    providerSub: sub,
    plan: 'PREMIUM',
    planExpiresAt: undefined,
  }, true);
  all.unshift(user);
  save(all);
  return user;
}

export function createUserWithPassword(username: string, passwordHash: string, email?: string): DbUser {
  const all = load();
  const { value, lower } = normalizeUsername(username);
  if (!value) throw new Error('username_required');
  const existingIndex = indexByUsername(all, value);
  if (existingIndex >= 0 && all[existingIndex].passwordHash) {
    throw new Error('username_taken');
  }
  const existing = existingIndex >= 0 ? all[existingIndex] : undefined;
  const isNewUser = existingIndex < 0;
  const refreshedExisting = existing ? withNormalizedPlan(existing).normalized : undefined;
  const nowUser: DbUser = withUpdatedTimestamps({
    id: existingIndex >= 0 ? all[existingIndex].id : randomUUID(),
    email: email ?? refreshedExisting?.email,
    username: value,
    usernameLower: lower,
    plan: isNewUser ? 'PREMIUM' : (refreshedExisting?.plan ?? 'PREMIUM'),
    planExpiresAt: isNewUser ? undefined : refreshedExisting?.planExpiresAt,
    passwordHash,
    providerSub: refreshedExisting?.providerSub,
  }, existingIndex < 0);
  if (existingIndex >= 0) {
    all[existingIndex] = nowUser;
  } else {
    all.unshift(nowUser);
  }
  save(all);
  return nowUser;
}

export function updateUserPassword(id: string, passwordHash: string) {
  const all = load();
  const idx = indexById(all, id);
  if (idx < 0) return;
  all[idx] = withUpdatedTimestamps({ ...all[idx], passwordHash }, false);
  save(all);
}

export function setPlan(id: string, plan: Plan) {
  const all = load();
  const i = indexById(all, id);
  if (i >= 0) {
    const next: DbUser = withUpdatedTimestamps({ ...all[i], plan, planExpiresAt: undefined }, false);
    all[i] = next;
    save(all);
  } else {
    const user: DbUser = withUpdatedTimestamps({ id, email: '', plan, planExpiresAt: undefined }, true);
    all.unshift(user);
    save(all);
  }
}

export function updateUserRecord(user: DbUser) {
  const all = load();
  const idx = indexById(all, user.id);
  const normalized = normalizeUsername(user.username);
  const next: DbUser = withUpdatedTimestamps({
    ...user,
    username: normalized.value || user.username,
    usernameLower: normalized.lower || user.usernameLower,
  }, idx < 0);
  if (idx >= 0) all[idx] = next;
  else all.unshift(next);
  save(all);
}

// Back-compat for previous storage/usersRepo API used by authActivate.ts
export type UserRecord = { id: string; email: string; plan: Plan };
export function upsertUser(u: UserRecord) {
  const all = load();
  const i = indexById(all, u.id);
  const base = i >= 0 ? all[i] : undefined;
  const merged: DbUser = withUpdatedTimestamps({ ...(base || {}), ...u, planExpiresAt: undefined } as DbUser, i < 0);
  if (i >= 0) all[i] = merged;
  else all.unshift(merged);
  save(all);
}

export function getActiveUser(id: string): DbUser | undefined {
  const user = getUserById(id);
  if (!user) return undefined;
  const { normalized, changed } = withNormalizedPlan(user);
  if (changed) updateUserRecord(normalized);
  return normalized;
}

export function hasActivePremium(user: DbUser | undefined, now = Date.now()): boolean {
  if (!user) return false;
  if (user.plan !== 'PREMIUM') return false;
  if (!user.planExpiresAt) return true;
  const expires = Date.parse(String(user.planExpiresAt));
  return Number.isFinite(expires) && expires > now;
}
