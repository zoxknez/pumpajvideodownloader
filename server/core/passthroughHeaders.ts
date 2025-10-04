export const SAFE_PASSTHROUGH = new Set([
  'content-type',
  'content-length',
  'content-disposition',
  'accept-ranges',
  'etag',
  'last-modified',
  'cache-control',
]);

export function passthroughHeaders(
  src: Headers | Record<string, string | string[] | undefined>,
  res: { setHeader: (name: string, value: any) => void },
  allow: Iterable<string> = SAFE_PASSTHROUGH
) {
  const allowed = allow instanceof Set ? allow : new Set(Array.from(allow, (k) => k.toLowerCase()));
  const entries = src instanceof Headers ? Array.from(src.entries()) : Object.entries(src);
  for (const [rawKey, value] of entries) {
    const key = rawKey?.toLowerCase?.();
    if (!key || !allowed.has(key)) continue;
    if (Array.isArray(value)) {
      if (value.length > 0) res.setHeader(key, value[value.length - 1]);
    } else if (typeof value !== 'undefined') {
      res.setHeader(key, value as any);
    }
  }
}
