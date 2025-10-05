export function sanitizeFileName(name: string): string {
  const base = name
    .normalize('NFKD')
    .replace(/[/\\?%*:|"<>]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const ascii = base.replace(/[^\x20-\x7E]/g, '');
  return ascii || 'download';
}

export function chooseExtFromMimeOrUrl(contentType?: string | null, url?: string): string | undefined {
  const lower = (contentType || '').toLowerCase();

  if (lower.includes('audio/')) {
    if (lower.includes('mpeg')) return 'mp3';
    if (lower.includes('aac')) return 'aac';
    if (lower.includes('ogg')) return 'ogg';
    if (lower.includes('opus')) return 'opus';
    if (lower.includes('flac')) return 'flac';
    return 'audio';
  }

  if (lower.includes('video/')) {
    if (lower.includes('mp4')) return 'mp4';
    if (lower.includes('webm')) return 'webm';
    if (lower.includes('x-matroska')) return 'mkv';
    return 'video';
  }

  if (url) {
    const match = url.toLowerCase().match(/\.(mp4|webm|mkv|mp3|aac|ogg|opus|flac)(\?|#|$)/);
    if (match) return match[1];
  }

  return undefined;
}
