import youtubedl from 'youtube-dl-exec';
import { combineSignals } from './abort.js';

const DEFAULT_TIMEOUT_MS = 60_000;
const MAX_BUFFER = 64 * 1024 * 1024; // 64MB

export async function dumpJson(url: string, opts?: { timeoutMs?: number; signal?: AbortSignal; args?: Record<string, any> }) {
  const timeoutMs = opts?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const timeoutSig: AbortSignal & { cleanup?: () => void } = (AbortSignal as any)?.timeout
    ? (AbortSignal as any).timeout(timeoutMs)
    : newAbortWithTimeout(timeoutMs);
  const ctrl = combineSignals(opts?.signal, timeoutSig);
  const raw = await (youtubedl as any)(url, {
    dumpSingleJson: true,
    noCheckCertificates: true,
    noWarnings: true,
    ignoreErrors: false,
    retries: 5,
    socketTimeout: 20,
    ...(opts?.args || {}),
  }, { shell: false, windowsHide: true, signal: ctrl, maxBuffer: MAX_BUFFER, env: cleanedChildEnv(process.env) });
  try {
    // youtube-dl-exec can return a string (stdout), Buffer, or sometimes an already-parsed object
    if (!raw) throw new Error('empty_output');
    // If object with stdout, attempt to parse that
    if (typeof raw === 'object' && raw !== null) {
      // Already a JSON object (best case)
      if (raw.constructor === Object && !('stdout' in raw)) {
        return raw as any;
      }
      // Node Buffer
      if (typeof (raw as any).toString === 'function' && Buffer.isBuffer(raw)) {
        const text = (raw as Buffer).toString('utf8');
        return JSON.parse(text);
      }
      // Exec-like result
      if ('stdout' in (raw as any)) {
        const out = String((raw as any).stdout || '');
        return JSON.parse(out);
      }
      // Fallback to stringification if possible
      const s = String(raw);
      return JSON.parse(s);
    }
    // String case
    const text = String(raw);
    return JSON.parse(text);
  } finally {
    timeoutSig?.cleanup?.();
  }
}

function newAbortWithTimeout(ms: number) {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort('timeout'), ms);
  const signal = ac.signal as AbortSignal & { cleanup?: () => void };
  signal.cleanup = () => clearTimeout(timer);
  return signal;
}

// Remove proxy-related env vars from the child process to reduce SSRF/leak risk
export function cleanedChildEnv(base: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const env = { ...base };
  const allowProxy = base.ALLOW_UPSTREAM_PROXY === '1';
  if (!allowProxy) {
    const keys = [
      'HTTP_PROXY', 'http_proxy',
      'HTTPS_PROXY', 'https_proxy',
      'NO_PROXY', 'no_proxy',
      'ALL_PROXY', 'all_proxy',
    ];
    for (const k of keys) delete (env as any)[k];
  }
  return env;
}

// Simple semaphore to limit concurrency of expensive operations
export function createSemaphore(max: number) {
  let current = 0;
  const queue: Array<() => void> = [];
  function acquire() {
    return new Promise<() => void>((resolve) => {
      const tryAcquire = () => {
        if (current < max) { current++; resolve(release); }
        else queue.push(tryAcquire);
      };
      tryAcquire();
    });
  }
  function release() {
    current = Math.max(0, current - 1);
    const next = queue.shift();
    if (next) next();
  }
  return { acquire };
}
