/**
 * Mock Sentry for web - disables desktop telemetry
 */

export function initSentry(): void {
  // Sentry disabled for web version
  console.log('[Sentry] Telemetry disabled for web version');
}

export function captureSentryException(error: any, context?: any): void {
  // Mock - just log to console
  if (process.env.NODE_ENV === 'development') {
    console.error('[Sentry Mock]', error, context);
  }
}

export function setSentryUser(user: any): void {
  // Mock - no-op
}

export function addSentryBreadcrumb(breadcrumb: any): void {
  // Mock - no-op
}
