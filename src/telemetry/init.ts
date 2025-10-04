import { initSentry } from './sentry';
import { initOtel } from './otel';

(() => {
  if (typeof window === 'undefined') return;

  try {
    initSentry();
  } catch (err) {
    console.warn('Failed to initialize Sentry telemetry', err);
  }

  const enableOtel = String((import.meta as any)?.env?.VITE_ENABLE_OTEL ?? '').toLowerCase();
  if (enableOtel === 'true') {
    try {
      initOtel();
    } catch (err) {
      console.warn('Failed to initialize OpenTelemetry', err);
    }
  }
})();
