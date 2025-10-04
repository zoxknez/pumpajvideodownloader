import fs from 'node:fs';
import path from 'node:path';

// New canonical location: <cwd>/data/settings.json
const dataDir = path.resolve(process.cwd(), 'data');
const file = path.join(dataDir, 'settings.json');
// Legacy location: <cwd>/server/data/settings.json (when cwd === server, this is server/server/data)
const legacyDir = path.resolve(process.cwd(), 'server', 'data');
const legacyFile = path.join(legacyDir, 'settings.json');

export type ServerSettings = {
  maxConcurrent?: number;
  proxyUrl?: string;
  limitRateKbps?: number;
  // Persist the last successfully bound server port to reuse on next start
  lastPort?: number;
};

export function readServerSettings(): ServerSettings {
  try {
    // If new file doesn't exist, try legacy and migrate content
    if (!fs.existsSync(file)) {
      if (fs.existsSync(legacyFile)) {
        try {
          const legacyRaw = fs.readFileSync(legacyFile, 'utf-8');
          const j = JSON.parse(legacyRaw || '{}');
          if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
          fs.writeFileSync(file, JSON.stringify(j, null, 2), 'utf-8');
        } catch {}
      } else {
        return {};
      }
    }
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
    const tmp = `${file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(next, null, 2), 'utf-8');
    fs.renameSync(tmp, file);
  } catch {
    // ignore
  }
}
