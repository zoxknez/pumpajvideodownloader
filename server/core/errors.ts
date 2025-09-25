export function normalizeYtError(e: any) {
  const msg = String(e?.message || e || '');
  if (/Network is unreachable|ETIMEDOUT|ECONNRESET|ENETUNREACH|EHOSTUNREACH/i.test(msg)) {
    return { status: 504, code: 'UPSTREAM_TIMEOUT', message: 'Upstream timeout' };
  }
  if (/HTTP Error 4\d\d|Forbidden|Unauthorized|403|401/i.test(msg)) {
    return { status: 403, code: 'UPSTREAM_FORBIDDEN', message: 'Forbidden/Unauthorized' };
  }
  if (/This video is unavailable|private/i.test(msg)) {
    return { status: 404, code: 'CONTENT_UNAVAILABLE', message: 'Content unavailable' };
  }
  if (/Unsupported URL|No video formats|no such format/i.test(msg)) {
    return { status: 422, code: 'UNSUPPORTED_URL', message: 'Unsupported URL or no formats' };
  }
  return { status: 500, code: 'YTDLP_ERROR', message: 'Extractor error' };
}
