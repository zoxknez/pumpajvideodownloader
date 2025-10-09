export function normalizeYtError(e: any) {
  const msg = String(e?.message || e || '');
  const lower = msg.toLowerCase();
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
  if (/rate limit|too many requests|429/i.test(msg)) {
    return { status: 429, code: 'UPSTREAM_RATELIMIT', message: 'Upstream rate-limited' };
  }
  if (/yt-dlp not found|spawn yt-dlp enoent|enoent: no such file or directory,? spawn yt-dlp/.test(lower)) {
    return { status: 500, code: 'YTDLP_MISSING', message: 'yt-dlp nije pronađen na serveru' };
  }
  if (/please sign in|sign in to confirm|accounts\.google\.com|cookies are required|consent cookie/i.test(lower)) {
    return {
      status: 403,
      code: 'UPSTREAM_FORBIDDEN',
      message: 'YouTube zahteva prijavu – dodaj cookies fajl u Railway okruženju',
    };
  }
  if (/captcha|bot verification|unusual traffic/i.test(lower)) {
    return {
      status: 429,
      code: 'UPSTREAM_RATELIMIT',
      message: 'YouTube traži CAPTCHA – pokušaj kasnije ili dodaj cookies',
    };
  }

  const tail = msg.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const detail = tail.length ? tail[tail.length - 1] : '';
  const safeDetail = detail.replace(/https?:\/\/[\w./?&=%+-]+/gi, '[url]');
  const combined = safeDetail ? `Extractor error: ${safeDetail}` : 'Extractor error';
  return { status: 500, code: 'YTDLP_ERROR', message: combined };
}
