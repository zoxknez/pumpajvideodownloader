import * as Sentry from '@sentry/browser';

let sentryReady = false;

function resolveTracingIntegration(): any | null {
  const integrationFactory = (Sentry as any).browserTracingIntegration;
  if (typeof integrationFactory === 'function') {
    try {
      return integrationFactory();
    } catch {
      return null;
    }
  }
  const BrowserTracing = (Sentry as any).BrowserTracing;
  if (typeof BrowserTracing === 'function') {
    try {
      return new BrowserTracing();
    } catch {
      return null;
    }
  }
  return null;
}

export function initSentry(): void {
  if (sentryReady) return;
  const dsn = (import.meta as any)?.env?.VITE_SENTRY_DSN as string | undefined;
  if (!dsn) return;

  const sampleRateRaw = (import.meta as any)?.env?.VITE_SENTRY_TRACES_SAMPLE_RATE;
  const sampleRate = Number(sampleRateRaw);
  const integrations: any[] = [];
  const tracingIntegration = resolveTracingIntegration();
  if (tracingIntegration) integrations.push(tracingIntegration);

  Sentry.init({
    dsn,
    integrations,
    tracesSampleRate: Number.isFinite(sampleRate) ? sampleRate : 0.1,
    release: (import.meta as any)?.env?.VITE_SENTRY_RELEASE,
  });

  const hub = (Sentry as any).getCurrentHub?.();
  sentryReady = Boolean(hub?.getClient?.());
}

export function captureProxyError(res: Response, context: Record<string, unknown> = {}): void {
  const hub = (Sentry as any).getCurrentHub?.();
  const client = hub?.getClient?.();
  if (!client) return;
  const reqId = res.headers.get('x-request-id') || undefined;
  const proxyStatus = res.headers.get('proxy-status') || undefined;
  const retryAfter = res.headers.get('retry-after') || undefined;

  Sentry.captureMessage('proxy_download_error', {
    level: 'warning',
    extra: {
      reqId,
      proxyStatus,
      retryAfter,
      status: res.status,
      ...context,
    },
  });
}

export function isSentryReady(): boolean {
  return sentryReady;
}
