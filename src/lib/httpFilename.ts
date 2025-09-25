// Small helpers for deriving filenames and extensions from HTTP headers

// Parse filename from Content-Disposition header
export function parseFilenameFromContentDisposition(cd?: string | null): string | null {
  if (!cd) return null;
  // filename*=UTF-8''encoded or filename="name.ext"
  const star = cd.match(/filename\*=(?:UTF-8'')?([^;]+)/i);
  if (star) {
    try {
      return decodeURIComponent(star[1].trim().replace(/^"|"$/g, ''));
    } catch {}
  }
  const plain = cd.match(/filename="?([^";]+)"?/i);
  if (plain) return plain[1].trim();
  return null;
}

// Infer a likely file extension from Content-Type header
export function inferExtFromContentType(ct?: string | null): string | null {
  if (!ct) return null;
  const t = ct.toLowerCase().split(';')[0].trim();
  switch (t) {
    case 'video/mp4':
      return '.mp4';
    case 'video/webm':
      return '.webm';
    case 'video/x-matroska':
      return '.mkv';
    case 'audio/mpeg':
      return '.mp3';
    case 'audio/mp4':
    case 'audio/x-m4a':
    case 'audio/aac':
      return '.m4a';
    case 'audio/ogg':
      return '.ogg';
    case 'audio/opus':
      return '.opus';
    case 'application/vnd.apple.mpegurl':
    case 'application/x-mpegurl':
      return '.m3u8';
    default:
      return null;
  }
}
