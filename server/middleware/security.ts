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

  app.use(helmet({
    contentSecurityPolicy: process.env.NODE_ENV === 'production' ? {
      useDefaults: true,
      directives: {
        "default-src": ["'self'"],
        "img-src": ["'self'", 'data:', 'blob:'],
        "connect-src": connectSrc,
        "media-src": ["'self'", 'blob:'],
        "script-src": ["'self'"],
        "style-src": ["'self'", "'unsafe-inline'"],
        "object-src": ["'none'"],
        "base-uri": ["'self'"]
      }
    } : false,
    frameguard: { action: 'deny' },
    referrerPolicy: { policy: 'no-referrer' },
    crossOriginEmbedderPolicy: false,
  } as any));
  app.use(hpp());
}
