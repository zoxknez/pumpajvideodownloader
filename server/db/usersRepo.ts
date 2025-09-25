import { randomUUID } from 'node:crypto';

export interface DbUser {
  id: string;
  email?: string;
  username?: string;
  providerSub: string;
  plan: 'FREE'|'PREMIUM';
}

const mem = new Map<string, DbUser>();

export async function upsertUserFromProvider(sub: string, email?: string, username?: string): Promise<DbUser> {
  const existing = [...mem.values()].find(u => u.providerSub === sub);
  if (existing) {
    const mutated: DbUser = {
      ...existing,
      email: email ?? existing.email,
      username: username ?? existing.username ?? existing.providerSub,
    };
    mem.set(mutated.id, mutated);
    return mutated;
  }
  const id = randomUUID();
  const user: DbUser = {
    id,
    email,
    username: username || sub,
    providerSub: sub,
    plan: 'FREE',
  };
  mem.set(id, user);
  return user;
}

export async function findUserByProviderSub(sub: string) {
  return [...mem.values()].find(u => u.providerSub === sub) ?? null;
}

export async function getUserById(id: string) {
  return mem.get(id) ?? null;
}
