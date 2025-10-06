import type { Express } from 'express';
import helmet from 'helmet';
import hpp from 'hpp';

export function applySecurity(app: Express, corsOrigin?: string) {
  // Build connect-src directive with valid values only
  const connectSrc = ["'self'"];
  if (corsOrigin && corsOrigin.trim()) {
    const origins = corsOrigin.split(',').map(o => o.trim()).filter(o => o);
    connectSrc.push(...origins);
  }

  const analyticsScriptHosts = ['https://va.vercel-scripts.com'];
  const analyticsConnectHosts = ['https://va.vercel-scripts.com', 'https://vitals.vercel-insights.com'];

  app.use(helmet({
    contentSecurityPolicy: process.env.NODE_ENV === 'production' ? {
      useDefaults: true,
      directives: {
        "default-src": ["'self'"],
        "img-src": ["'self'", 'data:', 'blob:'],
        "connect-src": [...connectSrc, ...analyticsConnectHosts],
        "media-src": ["'self'", 'blob:'],
        "script-src": ["'self'", "'unsafe-inline'", "'unsafe-eval'", ...analyticsScriptHosts],
        "style-src": ["'self'", "'unsafe-inline'"],
        "object-src": ["'none'"],
        "base-uri": ["'self'"],
        "frame-ancestors": ["'none'"],
      }
    } : false,
    frameguard: { action: 'deny' },
    referrerPolicy: { policy: 'no-referrer' },
    crossOriginEmbedderPolicy: false,
  } as any));
  app.use(hpp());
}
