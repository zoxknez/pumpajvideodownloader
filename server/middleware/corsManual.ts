import type { NextFunction, Request, Response } from 'express';
import type { Logger } from '../core/logger.js';
import { isOriginAllowed } from '../core/corsOrigin.js';

export type CorsOptions = {
  getAllowedOrigins?: () => string | undefined;
};

export function createManualCorsMiddleware(log: Logger, options: CorsOptions = {}) {
  const { getAllowedOrigins } = options;

  return function manualCors(req: Request, res: Response, next: NextFunction) {
    const origin = req.headers.origin;
    const corsOriginEnv = getAllowedOrigins ? getAllowedOrigins() : process.env.CORS_ORIGIN;

    if (req.method === 'OPTIONS' || !res.locals.corsLogged) {
      log.debug(`CORS check: origin=${origin}, allowed=${corsOriginEnv || 'ALL'}`);
      res.locals.corsLogged = true;
    }

    const isAllowed = isOriginAllowed(origin, corsOriginEnv);

    if (origin && isAllowed) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Allow-Credentials', 'true');
      if (req.method === 'OPTIONS') {
        log.debug(`CORS: ✅ Allowed origin ${origin}`);
      }
    } else if (!corsOriginEnv) {
      if (origin) {
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Access-Control-Allow-Credentials', 'true');
      } else {
        res.setHeader('Access-Control-Allow-Origin', '*');
      }
      if (req.method === 'OPTIONS') {
        log.debug('CORS: ✅ Dev mode - allowing all origins');
      }
    } else if (origin) {
      const allowedList = (corsOriginEnv || '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      log.warn(`CORS: ❌ Rejected origin "${origin}"`);
      log.warn(`CORS: Allowed origins: [${allowedList.map((o) => `"${o}"`).join(', ')}]`);
      log.warn(`CORS: Origin length: ${origin.length}, first allowed length: ${allowedList[0]?.length || 0}`);
      log.warn(`CORS: Exact match check: "${origin}" === "${allowedList[0]}" → ${origin === allowedList[0]}`);
    }

    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS,HEAD');
    res.setHeader(
      'Access-Control-Allow-Headers',
      'Content-Type,Authorization,Accept,X-Requested-With,Range,If-Range,If-None-Match,If-Modified-Since,X-Req-Id,x-req-id,X-Request-Id,X-Client-Trace,Traceparent,traceparent,X-Traceparent'
    );
    res.setHeader(
      'Access-Control-Expose-Headers',
      'Content-Disposition,Content-Length,Content-Type,ETag,Last-Modified,Accept-Ranges,Content-Range,X-Request-Id,Proxy-Status,Retry-After,X-Traceparent'
    );
    res.setHeader('Access-Control-Max-Age', '86400');
    res.setHeader('Vary', 'Origin');

    if (req.method === 'OPTIONS') {
      res.status(204).end();
      return;
    }

    next();
  };
}
