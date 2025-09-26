import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

export type HistoryItem = {
  id: string;
  title: string;
  url: string;
  thumbnail?: string;
  type: 'video' | 'audio' | 'thumbnail' | 'playlist';
  format: string;
  quality?: string;
  size?: string;
  downloadDate: string;
  status: 'completed' | 'failed' | 'in-progress' | 'canceled' | 'queued';
  progress?: number;
};

// Store history under <cwd>/data when running from server directory
const DATA_DIR = path.join(process.cwd(), 'data');
const FILE = path.join(DATA_DIR, 'history.json');
// Legacy paths for migration support
const LEGACY_DIR_1 = path.join(process.cwd(), 'server', 'data');
const LEGACY_FILE_1 = path.join(LEGACY_DIR_1, 'history.json');
const LEGACY_DIR_2 = path.join(process.cwd(), 'server', 'server', 'data');
const LEGACY_FILE_2 = path.join(LEGACY_DIR_2, 'history.json');

function ensure() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(FILE)) {
    // Try migrate from legacy paths
    try {
      const candidates = [LEGACY_FILE_1, LEGACY_FILE_2];
      for (const legacy of candidates) {
        if (fs.existsSync(legacy)) {
          const buf = fs.readFileSync(legacy, 'utf8');
          fs.writeFileSync(FILE, buf, 'utf8');
          return;
        }
      }
    } catch {}
    fs.writeFileSync(FILE, '[]', 'utf8');
  }
}

export function readHistory(): HistoryItem[] {
  ensure();
  try {
    return JSON.parse(fs.readFileSync(FILE, 'utf8')) as HistoryItem[];
  } catch {
    return [];
  }
}

const MAX_HISTORY = parseInt(process.env.MAX_HISTORY || '2000', 10);

export function writeHistory(items: HistoryItem[]) {
  ensure();
  const pruned = items.slice(0, MAX_HISTORY);
  fs.writeFileSync(FILE, JSON.stringify(pruned, null, 2), 'utf8');
}

export function appendHistory(partial: Omit<HistoryItem, 'id' | 'downloadDate'> & { id?: string; downloadDate?: string }): HistoryItem {
  const items = readHistory();
  const item: HistoryItem = {
    id: partial.id || randomUUID(),
    downloadDate: partial.downloadDate || new Date().toISOString().replace('T', ' ').slice(0, 16),
    ...partial,
  } as HistoryItem;
  items.unshift(item);
  writeHistory(items);
  return item;
}

export function updateHistory(id: string, updates: Partial<HistoryItem>) {
  const items = readHistory();
  const idx = items.findIndex((i) => i.id === id);
  if (idx >= 0) {
    items[idx] = { ...items[idx], ...updates } as HistoryItem;
    writeHistory(items);
    return items[idx];
  }
  return null;
}

export function removeHistory(id: string) {
  const items = readHistory().filter((i) => i.id !== id);
  writeHistory(items);
  return items;
}

export function clearHistory() {
  writeHistory([]);
}
