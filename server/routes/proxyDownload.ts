import type { Request, Response } from 'express';
import path from 'node:path';
import { pipeline } from 'node:stream';
import { promisify } from 'node:util';
import type { AppConfig } from '../core/config.js';
import { isUrlAllowed } from '../core/urlAllow.js';
import { assertPublicHttpHost } from '../core/ssrfGuard.js';

const pump = promisify(pipeline);

type ProxyErrorCode = 'MISSING_URL' | 'INVALID_URL' | 'PROXY_ERROR' | 'SSRF_FORBIDDEN';

function sendError(res: Response, status: number, code: ProxyErrorCode) {
  if (!res.headersSent) {
    res.status(status).json({ error: code });
  } else {
    try { res.end(); } catch {}
  }
}

export function createProxyDownloadHandler(cfg: AppConfig) {
  return async function proxyDownload(req: Request, res: Response) {
    try {
      const url = String(req.query.url || '');
      if (!url) return sendError(res, 400, 'MISSING_URL');
      if (!isUrlAllowed(url, cfg)) return sendError(res, 400, 'INVALID_URL');

      try {
        await assertPublicHttpHost(url);
      } catch (err: any) {
        const code = err?.code === 'SSRF_FORBIDDEN' ? 'SSRF_FORBIDDEN' : 'INVALID_URL';
        return sendError(res, 400, code as ProxyErrorCode);
      }

      const unsafe = String(req.query.filename ?? 'download.bin');
      const safeName = path.basename(unsafe).replace(/[\r\n"]/g, '_').slice(0, 128);
      res.setHeader('Content-Disposition', `attachment; filename="${safeName}"`);

      const range = req.headers['range'] as string | undefined;
      const headers: Record<string, string> = {};
      if (range) headers['Range'] = range;

      const r = await fetch(url, { headers });
      res.status(r.status);
      r.headers.forEach((v, k) => {
        if (['content-type', 'content-length', 'accept-ranges', 'content-range'].includes(k.toLowerCase())) {
          res.setHeader(k, v);
        }
      });
      if (!res.getHeader('Accept-Ranges')) res.setHeader('Accept-Ranges', 'bytes');

      if (!r.body) return sendError(res, 502, 'PROXY_ERROR');
    const { Readable } = await import('node:stream');
    // Node 18: web ReadableStream to Node stream
    const nodeStream = Readable.fromWeb(r.body as unknown as any);
      await pump(nodeStream, res);
    } catch {
      sendError(res, 500, 'PROXY_ERROR');
    }
  };
}
