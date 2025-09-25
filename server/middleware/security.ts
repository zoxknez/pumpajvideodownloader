import type { Express } from 'express';
import helmet from 'helmet';
import hpp from 'hpp';

export function applySecurity(app: Express, corsOrigin?: string) {
  app.use(helmet({
    contentSecurityPolicy: process.env.NODE_ENV === 'production' ? {
      useDefaults: true,
      directives: {
        "default-src": ["'self'"],
        "img-src": ["'self'", 'data:', 'blob:'],
        "connect-src": ["'self'", corsOrigin || "'self'"],
        "script-src": ["'self'"],
        "style-src": ["'self'", "'unsafe-inline'"],
        "object-src": ["'none'"],
        "base-uri": ["'self'"]
      }
    } : false,
    frameguard: { action: 'deny' },
    referrerPolicy: { policy: 'no-referrer' }
  } as any));
  app.use(hpp());
}
