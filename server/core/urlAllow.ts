import type { AppConfig } from './config.js';

export function isUrlAllowed(url: string | undefined, cfg: AppConfig): boolean {
  if (!url || !/^https?:\/\//i.test(url)) return false;
  try {
    const hostname = new URL(url).hostname.toLowerCase();
    const allowed = cfg.allowedHosts;
    if (allowed && allowed.length > 0) {
      return allowed.some((entry) => {
        const candidate = entry.toLowerCase();
        return hostname === candidate || hostname.endsWith(`.${candidate}`);
      });
    }
    return true;
  } catch {
    return false;
  }
}
