import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

export type HistoryItem = {
  id: string;
  userId: string;
  title: string;
  url: string;
  thumbnail?: string;
  type: 'video' | 'audio' | 'thumbnail' | 'playlist' | 'batch' | 'clip';
  format?: string;
  quality?: string;
  size?: string;
  sizeBytes?: number;
  downloadDate: string; // legacy field retained for compatibility
  status: 'completed' | 'failed' | 'in-progress' | 'canceled' | 'queued';
  progress?: number;
  error?: string;
  completedAt?: string;
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

function normalizeItem(raw: any): HistoryItem {
  const fallbackDate = new Date().toISOString();
  return {
    id: String(raw?.id ?? randomUUID()),
    userId: String(raw?.userId || 'legacy'),
    title: String(raw?.title || 'job'),
    url: String(raw?.url || ''),
    thumbnail: raw?.thumbnail ? String(raw.thumbnail) : undefined,
    type: (raw?.type as HistoryItem['type']) || 'video',
    format: raw?.format ? String(raw.format) : undefined,
    quality: raw?.quality ? String(raw.quality) : undefined,
    size: raw?.size ? String(raw.size) : undefined,
    sizeBytes: Number.isFinite(raw?.sizeBytes) ? Number(raw.sizeBytes) : undefined,
    downloadDate: raw?.downloadDate ? String(raw.downloadDate) : fallbackDate,
    status: ['completed', 'failed', 'in-progress', 'canceled', 'queued'].includes(raw?.status)
      ? raw.status
      : 'queued',
    progress: Number.isFinite(raw?.progress) ? Math.max(0, Math.min(100, Number(raw.progress))) : undefined,
    error: raw?.error ? String(raw.error) : undefined,
    completedAt: raw?.completedAt ? String(raw.completedAt) : undefined,
  } satisfies HistoryItem;
}

export function readHistory(): HistoryItem[] {
  ensure();
  try {
    const parsed = JSON.parse(fs.readFileSync(FILE, 'utf8')) as any[];
    if (!Array.isArray(parsed)) return [];
    return parsed.map(normalizeItem);
  } catch {
    return [];
  }
}

const MAX_HISTORY = parseInt(process.env.MAX_HISTORY || '2000', 10);

export function writeHistory(items: HistoryItem[]) {
  ensure();
  const pruned = items.slice(-MAX_HISTORY);
  fs.writeFileSync(FILE, JSON.stringify(pruned, null, 2), 'utf8');
}

export function appendHistory(
  partial: Omit<HistoryItem, 'id' | 'downloadDate' | 'status'> & {
    id?: string;
    downloadDate?: string;
    status?: HistoryItem['status'];
  }
): HistoryItem {
  ensure();
  const items = readHistory();
  const now = new Date().toISOString();
  const id = partial.id || randomUUID();
  const existingIdx = items.findIndex((entry) => entry.id === id);
  if (existingIdx >= 0) items.splice(existingIdx, 1);

  const item: HistoryItem = {
    id,
    userId: String(partial.userId || 'legacy'),
    title: (partial.title || 'job').slice(0, 300),
    url: partial.url,
    thumbnail: partial.thumbnail,
    type: partial.type || 'video',
    format: partial.format,
    quality: partial.quality,
    size: partial.size,
    sizeBytes: Number.isFinite(partial.sizeBytes) ? Number(partial.sizeBytes) : undefined,
    downloadDate: partial.downloadDate || now,
    status: partial.status || 'queued',
    progress: clampProgress(partial.progress),
    error: partial.error,
    completedAt: partial.completedAt,
  };

  items.push(item);
  writeHistory(items);
  return item;
}

export function updateHistory(id: string, updates: Partial<HistoryItem>) {
  ensure();
  const items = readHistory();
  const idx = items.findIndex((i) => i.id === id);
  if (idx >= 0) {
    const next = normalizeItem({ ...items[idx], ...updates });
    next.progress = clampProgress(next.progress);
    items[idx] = next;
    writeHistory(items);
    return next;
  }
  return null;
}

export function removeHistory(id: string, userId?: string) {
  const items = readHistory();
  const next = items.filter((item) => {
    if (item.id !== id) return true;
    if (userId && item.userId && item.userId !== userId) return true;
    return false;
  });
  if (next.length !== items.length) {
    writeHistory(next);
  }
  return next;
}

export function clearHistory(userId?: string) {
  if (!userId) {
    writeHistory([]);
    return;
  }
  const remaining = readHistory().filter((item) => item.userId !== userId);
  writeHistory(remaining);
}

function clampProgress(value: number | undefined) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
  return Math.max(0, Math.min(100, Math.floor(value)));
}
