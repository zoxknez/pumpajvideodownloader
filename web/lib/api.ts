import { getSupabase } from './supabaseClient';

function normalizeBase(value?: string | null): string {
  if (!value) return '';
  const trimmed = value.trim();
  if (!trimmed) return '';
  return trimmed.replace(/\/$/, '');
}

const API_BASE_RUNTIME = (() => {
  const envBase = normalizeBase(process.env.NEXT_PUBLIC_API_BASE ?? process.env.NEXT_PUBLIC_API ?? '');
  if (envBase) return envBase;

  // LocalStorage override (manual user runtime override)
  try {
    if (typeof window !== 'undefined') {
      const lsOverride = normalizeBase(localStorage.getItem('pumpaj:apiBaseOverride'));
      if (lsOverride) return lsOverride;
    }
  } catch {}

  try {
    if (typeof window !== 'undefined') {
      const qs = new URLSearchParams(window.location.search);
      const fromQuery = normalizeBase(qs.get('apiBase'));
      if (fromQuery) return fromQuery;
    }
  } catch {}

  try {
    const fromGlobal = normalizeBase((globalThis as any)?.__API_BASE as string | undefined);
    if (fromGlobal) return fromGlobal;
  } catch {}

  if (typeof window !== 'undefined' && window.location?.protocol === 'file:') {
    return 'http://127.0.0.1:5176';
  }

  return '';
})();

export const API_BASE = API_BASE_RUNTIME;

export function apiUrl(path: string): string {
  if (!API_BASE) return path;
  return `${API_BASE}${path}`;
}

async function authHeaders(): Promise<Record<string, string>> {
  const supabase = getSupabase();
  if (!supabase) return {};
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function postJSON<T>(path: string, body: any): Promise<T> {
  const headers = await authHeaders();
  const res = await fetch(apiUrl(path), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(headers as Record<string, string>) },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function getJSON<T>(path: string): Promise<T> {
  const headers = await authHeaders();
  const res = await fetch(apiUrl(path), { headers: headers as Record<string, string> });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function downloadJobFile(jobId: string): Promise<void> {
  const headers = await authHeaders();
  const res = await fetch(apiUrl(`/api/job/file/${jobId}`), { headers: headers as Record<string, string> });
  if (!res.ok) throw new Error(await res.text());
  const blob = await res.blob();
  const cd = res.headers.get('content-disposition') || '';
  const m = cd.match(/filename="([^"]+)"/i);
  const filename = m?.[1] || 'download.bin';

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
