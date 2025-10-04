import { WebTracerProvider } from '@opentelemetry/sdk-trace-web';
import { ConsoleSpanExporter, SimpleSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { registerInstrumentations } from '@opentelemetry/instrumentation';
import { FetchInstrumentation } from '@opentelemetry/instrumentation-fetch';

let otelProvider: WebTracerProvider | null = null;

function toRegExp(pattern: string): RegExp | null {
  try {
    return new RegExp(pattern);
  } catch {
    return null;
  }
}

export function initOtel(): WebTracerProvider | null {
  if (otelProvider) return otelProvider;
  const provider = new WebTracerProvider();
  provider.addSpanProcessor(new SimpleSpanProcessor(new ConsoleSpanExporter()));
  provider.register();

  const propagatePatterns: RegExp[] = [];
  const corsPattern = (import.meta as any)?.env?.VITE_OTEL_FETCH_CORS as string | undefined;
  if (corsPattern) {
    const rx = toRegExp(corsPattern);
    if (rx) propagatePatterns.push(rx);
  } else {
    const apiBase = (import.meta as any)?.env?.VITE_API_BASE as string | undefined;
    if (apiBase && /^https?:\/\//i.test(apiBase)) {
      const escaped = apiBase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      propagatePatterns.push(new RegExp(`^${escaped}`));
    }
  }

  registerInstrumentations({
    instrumentations: [
      new FetchInstrumentation({
        propagateTraceHeaderCorsUrls: propagatePatterns.length ? propagatePatterns : undefined,
      }),
    ],
  });

  otelProvider = provider;
  return otelProvider;
}

export function isOtelActive(): boolean {
  return otelProvider !== null;
}
