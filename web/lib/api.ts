import { getSupabase } from './supabaseClient';

const API = process.env.NEXT_PUBLIC_API!;

async function authHeaders(): Promise<Record<string, string>> {
  const supabase = getSupabase();
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function postJSON<T>(path: string, body: any): Promise<T> {
  const headers = await authHeaders();
  const res = await fetch(`${API}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(headers as Record<string, string>) },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function getJSON<T>(path: string): Promise<T> {
  const headers = await authHeaders();
  const res = await fetch(`${API}${path}`, { headers: headers as Record<string, string> });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function downloadJobFile(jobId: string): Promise<void> {
  const headers = await authHeaders();
  const res = await fetch(`${API}/api/job/file/${jobId}`, { headers: headers as Record<string, string> });
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
