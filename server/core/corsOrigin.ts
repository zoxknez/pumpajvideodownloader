export function buildCorsOrigin(raw?: string) {
  if (!raw) return true as any; // dev: allow all
  const items = raw
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)
    .map(s => {
      if (s.startsWith('/') && s.endsWith('/')) {
        try { return new RegExp(s.slice(1, -1)); } catch { return undefined; }
      }
      return s;
    })
    .filter(Boolean) as Array<string | RegExp>;
  return (origin: string | undefined, cb: (err: any, ok?: boolean) => void) => {
    if (!origin) return cb(null, true);
    const ok = items.some(i => i instanceof RegExp ? i.test(origin) : i === origin);
    cb(null, ok);
  };
}

/**
 * Check if origin is allowed based on CORS_ORIGIN env var.
 * Returns true if allowed, false otherwise.
 */
export function isOriginAllowed(origin: string | undefined, corsOriginEnv?: string): boolean {
  if (!corsOriginEnv) return true; // No restriction - allow all
  if (!origin) return false; // No origin header - deny
  
  const items = corsOriginEnv
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);
  
  return items.some(item => {
    if (item.startsWith('/') && item.endsWith('/')) {
      // Regex pattern
      try {
        const regex = new RegExp(item.slice(1, -1));
        return regex.test(origin);
      } catch {
        return false;
      }
    }
    // Exact match
    return item === origin;
  });
}
