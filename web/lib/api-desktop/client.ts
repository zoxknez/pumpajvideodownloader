import { getSupabase } from '../supabaseClient';
import { API_BASE, apiUrl } from '../apiBase';

export { API_BASE } from '../apiBase';

const CLIENT_TRACE_HEADER = 'pumpaj-web';
const DEFAULT_TIMEOUT_MS = 20000;

export type SignedScope = 'download' | 'progress';

type SignedEntry = { token: string; q: string; exp: number };

const signCache = new Map<string, SignedEntry>();

const cacheKey = (id: string, scope: SignedScope) => `${scope}:${id}`;

function randomId(): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
  } catch {}
  return Math.random().toString(36).slice(2, 11);
}

export function absoluteUrl(path: string): string {
  if (!path) return apiUrl('/');
  if (/^https?:\/\//i.test(path)) return path;
  return apiUrl(path.startsWith('/') ? path : `/${path}`);
}

export function jobFileUrl(id: string): string {
  return absoluteUrl(`/api/job/file/${encodeURIComponent(id)}`);
}

export function withTimeout<T>(factory: (signal: AbortSignal) => Promise<T>, ms = DEFAULT_TIMEOUT_MS): Promise<T> {
  const ac = new AbortController();
  const timeoutId = setTimeout(() => ac.abort(), ms);
  return factory(ac.signal).finally(() => clearTimeout(timeoutId));
}

const toHeaderEntries = (init?: HeadersInit): Array<[string, string]> => {
  if (!init) return [];
  if (init instanceof Headers) {
    const entries: Array<[string, string]> = [];
    init.forEach((value, key) => entries.push([key, value]));
    return entries;
  }
  if (Array.isArray(init)) {
    return init.map(([key, value]) => [String(key), String(value)]);
  }
  if (typeof init === 'object') {
    return Object.entries(init as Record<string, unknown>).map(([key, value]) => [key, String(value)]);
  }
  return [];
};

async function resolveAuthToken(): Promise<string | null> {
  const supabase = getSupabase();
  if (supabase) {
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token || null;
      if (token) return token;
    } catch {
      // ignored
    }
  }

  if (typeof window !== 'undefined') {
    try {
      const token = window.localStorage?.getItem('app:token') ?? null;
      if (token) return token;
    } catch {
      // ignored
    }
  }

  return null;
}

export async function authHeaders(extra?: HeadersInit): Promise<Record<string, string>> {
  const entries = toHeaderEntries(extra).filter(([key]) => key.toLowerCase() !== 'authorization');
  const headerMap = new Map<string, string>();
  for (const [key, value] of entries) {
    headerMap.set(key, value);
  }

  const token = await resolveAuthToken();
  if (token) {
    headerMap.set('Authorization', `Bearer ${token}`);
  }

  return Object.fromEntries(headerMap);
}

async function buildHeaders(extra?: HeadersInit): Promise<Headers> {
  const combined = await authHeaders(extra);
  const headers = new Headers(combined as HeadersInit);
  if (!headers.has('X-Req-Id')) headers.set('X-Req-Id', randomId());
  if (!headers.has('X-Client-Trace')) headers.set('X-Client-Trace', CLIENT_TRACE_HEADER);
  return headers;
}

export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = await buildHeaders(init.headers);
  const target = absoluteUrl(path);
  const started = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const response = await fetch(target, {
    ...init,
    headers,
    credentials: init.credentials ?? 'include',
  });

  if (typeof performance !== 'undefined') {
    const duration = performance.now() - started;
    if (duration > 10_000) {
      console.debug?.('[apiFetch] slow request', { target, durationMs: Math.round(duration) });
    }
  }

  return response;
}

export function clearSignCache() {
  signCache.clear();
}

export function invalidateSignedEntry(id: string, scope: SignedScope) {
  signCache.delete(cacheKey(id, scope));
}

export async function getSigned(id: string, scope: SignedScope): Promise<SignedEntry> {
  const key = cacheKey(id, scope);
  const now = Date.now();
  const cached = signCache.get(key);
  if (cached && cached.exp - now > 15_000) {
    return cached;
  }

  const path = scope === 'download' ? `/api/job/file/${encodeURIComponent(id)}/sign` : `/api/progress/${encodeURIComponent(id)}/sign`;

  try {
    const res = await apiFetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
    if (!res.ok) {
      signCache.delete(key);
      throw new Error(`sign_failed_${res.status}`);
    }
    const data = await res.json().catch(() => ({}));
    const token = String(data?.token || '');
    const q = String(data?.queryParam || 's');
    if (!token) {
      signCache.delete(key);
      throw new Error('sign_failed_missing_token');
    }
    const exp = Number(data?.expiresAt) || now + 600_000;
    const entry: SignedEntry = { token, q, exp };
    signCache.set(key, entry);
    return entry;
  } catch (error) {
    signCache.delete(key);
    throw error;
  }
}

export { apiUrl };
