import { API_BASE, apiUrl, absoluteApiUrl } from './apiBase';
import { apiFetch, downloadJobFile as coreDownloadJobFile, mapToAudioAnalysis, mapToThumbnails, mapToVideoAnalysis, formatDuration } from './api-desktop';

export { API_BASE, apiUrl, absoluteApiUrl };
export { mapToAudioAnalysis, mapToThumbnails, mapToVideoAnalysis, formatDuration };
export const downloadJobFile = coreDownloadJobFile;

async function handleJson<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(text || `Request failed (${res.status})`);
  }
  return res.json();
}

export async function postJSON<T>(path: string, body: any): Promise<T> {
  const res = await apiFetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body ?? {}),
  });
  return handleJson<T>(res);
}

export async function getJSON<T>(path: string): Promise<T> {
  const res = await apiFetch(path, { method: 'GET' });
  return handleJson<T>(res);
}
