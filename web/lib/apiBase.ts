function normalizeBase(value?: string | null): string {
  if (!value) return '';
  const trimmed = value.trim();
  if (!trimmed) return '';
  return trimmed.replace(/\/$/, '');
}

function readLocalStorage(key: string): string {
  try {
    if (typeof window === 'undefined') return '';
    const raw = window.localStorage?.getItem(key);
    return typeof raw === 'string' ? raw : '';
  } catch {
    return '';
  }
}

function resolveQueryParam(name: string): string {
  try {
    if (typeof window === 'undefined') return '';
    const qs = new URLSearchParams(window.location.search);
    return qs.get(name) ?? '';
  } catch {
    return '';
  }
}

function resolveProcessEnv(): string {
  try {
    if (typeof process === 'undefined') return '';
    return (
      process?.env?.NEXT_PUBLIC_API_BASE ||
      process?.env?.NEXT_PUBLIC_API ||
      process?.env?.API_BASE ||
      ''
    );
  } catch {
    return '';
  }
}

function resolveViteEnv(): string {
  try {
    const globalScope = globalThis as Record<string, unknown> | undefined;
    const candidate = (globalScope?.__vite_env as Record<string, string> | undefined)
      || (globalScope?.import_meta_env as Record<string, string> | undefined);
    if (!candidate) return '';
    if (typeof candidate.VITE_API_BASE === 'string') return candidate.VITE_API_BASE;
    if (typeof candidate.PUBLIC_API_BASE === 'string') return candidate.PUBLIC_API_BASE;
  } catch {}
  return '';
}

function resolveGlobal(): string {
  try {
    const anyGlobal = globalThis as Record<string, unknown> | undefined;
    const direct = anyGlobal && typeof anyGlobal.__API_BASE === 'string' ? anyGlobal.__API_BASE : '';
    if (direct) return direct;
    const doubleUnderscore = anyGlobal && typeof anyGlobal.__API_BASE__ === 'string' ? anyGlobal.__API_BASE__ : '';
    if (doubleUnderscore) return doubleUnderscore;
    return '';
  } catch {
    return '';
  }
}

function computeRuntimeBase(): string {
  const envBase = normalizeBase(resolveProcessEnv());
  if (envBase) return envBase;

  const viteBase = normalizeBase(resolveViteEnv());
  if (viteBase) return viteBase;

  const lsOverride = normalizeBase(readLocalStorage('pumpaj:apiBaseOverride'));
  if (lsOverride) return lsOverride;

  const legacyOverride = normalizeBase(readLocalStorage('pumpaj:legacyApiBase'));
  if (legacyOverride) return legacyOverride;

  const queryBase = normalizeBase(resolveQueryParam('apiBase'));
  if (queryBase) return queryBase;

  const globalBase = normalizeBase(resolveGlobal());
  if (globalBase) return globalBase;

  if (typeof window !== 'undefined') {
    if (window.location?.protocol === 'file:') {
      return 'http://127.0.0.1:5176';
    }
    const host = window.location?.hostname;
    if (host === 'localhost' || host === '127.0.0.1') {
      return 'http://localhost:5176';
    }
    return '';
  }

  return 'http://localhost:5176';
}

export const API_BASE = computeRuntimeBase();

const ABSOLUTE_PATTERN = /^https?:\/\//i;

function ensureLeadingSlash(path: string): string {
  if (!path) return '/';
  return path.startsWith('/') ? path : `/${path}`;
}

export function apiUrl(path: string): string {
  const normalized = ensureLeadingSlash(path);
  if (!API_BASE) return normalized;
  return `${API_BASE}${normalized}`;
}

export function absoluteApiUrl(path: string): string {
  const candidate = apiUrl(path);
  if (ABSOLUTE_PATTERN.test(candidate)) return candidate;
  if (typeof window !== 'undefined' && window.location?.origin) {
    return new URL(candidate, window.location.origin).toString();
  }
  const site = normalizeBase(process.env.NEXT_PUBLIC_SITE_URL ?? process.env.VERCEL_URL ?? '');
  if (site) {
    const base = ABSOLUTE_PATTERN.test(site) ? site : `https://${site}`;
    return new URL(candidate, base).toString();
  }
  return candidate;
}
