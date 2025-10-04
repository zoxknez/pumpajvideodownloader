import { domainToASCII } from 'node:url';
import type { AppConfig } from './config.js';

const stripTrailingDots = (value: string) => value.replace(/\.+$/, '');

function normalizeHost(value: string) {
  return domainToASCII(stripTrailingDots(value)).toLowerCase();
}

export function isUrlAllowed(url: string | undefined, cfg: AppConfig): boolean {
  if (!url || !/^https?:\/\//i.test(url)) return false;
  try {
    const u = new URL(url);
    const hostname = normalizeHost(u.hostname);
    const allowed = (cfg.allowedHosts ?? []).map((entry) => {
      if (!entry) return null;
      const trimmed = entry.trim();
      if (trimmed.startsWith('*.')) {
        const base = normalizeHost(trimmed.slice(2));
        return base ? `*.${base}` : null;
      }
      return normalizeHost(trimmed);
    }).filter(Boolean) as string[];

    if (allowed.length === 0) return true;

    return allowed.some((entry) => {
      if (entry.startsWith('*.')) {
        const base = entry.slice(2);
        return hostname === base || hostname.endsWith(`.${base}`);
      }
      return hostname === entry;
    });
  } catch {
    return false;
  }
}
