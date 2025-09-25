import fs from 'node:fs';
import path from 'node:path';

export type UserRecord = { id: string; email: string; plan: 'FREE' | 'PREMIUM' };
const FILE = path.join(process.cwd(), 'server', 'data', 'users.json');

function load(): UserRecord[] {
  try { return JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch { return []; }
}
function save(list: UserRecord[]) {
  const dir = path.dirname(FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(list, null, 2), 'utf8');
}

export function getUserById(id: string) {
  return load().find(u => u.id === id);
}
export function upsertUser(u: UserRecord) {
  const all = load();
  const i = all.findIndex(x => x.id === u.id);
  if (i >= 0) all[i] = u; else all.unshift(u);
  save(all);
}
export function setPlan(id: string, plan: 'FREE'|'PREMIUM') {
  const all = load();
  const i = all.findIndex(x => x.id === id);
  if (i >= 0) { all[i].plan = plan; save(all); }
  else { all.unshift({ id, email: '', plan }); save(all); }
}
