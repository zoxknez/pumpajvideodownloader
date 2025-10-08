import { API_BASE, apiFetch, getSigned, jobFileUrl } from './client';

export type DownloadProgress = {
  loaded: number;
  total?: number;
  percent?: number;
  speed?: number;
  eta?: number;
};

const supportsFileSystemAccess = () =>
  typeof window !== 'undefined' &&
  typeof (window as any).showSaveFilePicker === 'function' &&
  Boolean(window.isSecureContext);

export function parseFilename(res: Response, fallback: string) {
  const cd = res.headers.get('content-disposition') || '';
  const match = cd.match(/filename\*?=(?:UTF-8'')?"?([^";]+)"?/i);
  const raw = match ? decodeURIComponent(match[1]) : fallback;
  return (
    raw
      .replace(/[\u0000-\u001f<>:"/\\|?*]+/g, '_')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 120) || fallback
  );
}

export async function proxyDownload(options: {
  url: string;
  filename: string;
  signal?: AbortSignal;
  onProgress?: (progress: DownloadProgress) => void;
}) {
  const target = new URL(`${API_BASE}/api/proxy-download`);
  target.searchParams.set('url', options.url);
  target.searchParams.set('filename', options.filename);

  if (options.onProgress) {
    try {
      const res = await apiFetch(target.toString(), { signal: options.signal });
      if (!res.ok) throw new Error(`Download failed: ${res.status}`);

      const total = Number(res.headers.get('content-length') || 0) || undefined;
      const reader = res.body?.getReader();
      if (!reader) throw new Error('No response body');
      const name = parseFilename(res, options.filename);

      const chunks: Uint8Array[] = [];
      let loaded = 0;
      const started = Date.now();

      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (!value) continue;

        chunks.push(value);
        loaded += value.length;

        const elapsed = (Date.now() - started) / 1000;
        const speed = elapsed > 0 ? loaded / elapsed : 0;
        const eta = total && speed > 0 ? (total - loaded) / speed : undefined;
        const percent = total ? Math.round((loaded / total) * 100) : undefined;

        options.onProgress({ loaded, total, percent, speed, eta });
      }

      const blob = new Blob(chunks as BlobPart[]);
      const blobUrl = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = blobUrl;
      anchor.download = name;
      anchor.click();
      URL.revokeObjectURL(blobUrl);
      return;
    } catch (error: any) {
      if (error?.name !== 'AbortError') {
        console.error('Proxy download failed', error);
      }
      throw error;
    }
  }

  window.open(target.toString(), '_blank');
}

async function saveWithFileSystem(res: Response, filename: string) {
  const body = res.body;
  if (!body) throw new Error('stream_unavailable');
  const picker = await (window as any).showSaveFilePicker({ suggestedName: filename });
  const writable = await picker.createWritable();
  const reader = body.getReader();
  try {
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) await writable.write(value);
    }
    await writable.close();
  } catch (error) {
    try {
      await writable.abort();
    } catch {}
    throw error;
  }
}

async function saveAsBlob(res: Response, filename: string) {
  const blob = await res.blob();
  const blobUrl = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = blobUrl;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(blobUrl);
}

export async function downloadJobFile(id: string, fallbackName = 'download.bin'): Promise<boolean> {
  const { token, q } = await getSigned(id, 'download');
  const signed = `${jobFileUrl(id)}?${q}=${encodeURIComponent(token)}`;
  const res = await apiFetch(signed);
  if (!res.ok) {
    throw new ProxyDownloadError('Job file download failed', { status: res.status });
  }
  const filename = parseFilename(res, fallbackName);
  const clone = res.clone();

  if (supportsFileSystemAccess()) {
    try {
      await saveWithFileSystem(res, filename);
      return true;
    } catch {
      // fall back to blob download below
    }
  }

  await saveAsBlob(clone, filename);
  return true;
}

export async function resolveFormatUrl(sourceUrl: string, formatId: string): Promise<string | null> {
  try {
    const res = await apiFetch('/api/get-url', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: sourceUrl, formatId }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data?.url || null;
  } catch {
    return null;
  }
}

export class ProxyDownloadError extends Error {
  status?: number;
  code?: string;
  proxyStatus?: string;
  requestId?: string;

  constructor(message: string, options?: { status?: number; code?: string; proxyStatus?: string; requestId?: string }) {
    super(message);
    this.name = 'ProxyDownloadError';
    this.status = options?.status;
    this.code = options?.code;
    this.proxyStatus = options?.proxyStatus;
    this.requestId = options?.requestId;
  }
}
