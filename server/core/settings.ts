import fs from 'node:fs';
import path from 'node:path';

const dataDir = path.resolve(process.cwd(), 'server', 'data');
const file = path.join(dataDir, 'settings.json');

export type ServerSettings = {
  maxConcurrent?: number;
  proxyUrl?: string;
  limitRateKbps?: number;
  // Persist the last successfully bound server port to reuse on next start
  lastPort?: number;
};

export function readServerSettings(): ServerSettings {
  try {
    if (!fs.existsSync(file)) return {};
    const raw = fs.readFileSync(file, 'utf-8');
    const j = JSON.parse(raw || '{}');
    return {
      maxConcurrent: Number.isFinite(j?.maxConcurrent) ? Number(j.maxConcurrent) : undefined,
  proxyUrl: typeof j?.proxyUrl === 'string' && j.proxyUrl ? String(j.proxyUrl) : undefined,
  limitRateKbps: Number.isFinite(j?.limitRateKbps) ? Number(j.limitRateKbps) : undefined,
  lastPort: Number.isFinite(j?.lastPort) ? Number(j.lastPort) : undefined,
    };
  } catch {
    return {};
  }
}

export function writeServerSettings(s: ServerSettings) {
  try {
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
    const cur = readServerSettings();
    const next = { ...cur, ...s };
    fs.writeFileSync(file, JSON.stringify(next, null, 2), 'utf-8');
  } catch {
    // ignore
  }
}
