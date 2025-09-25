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
