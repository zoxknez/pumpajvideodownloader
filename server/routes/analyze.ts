import type { Request, Response, NextFunction } from 'express';
import ytdlp from 'youtube-dl-exec';
import type { AppConfig } from '../core/config.js';
import type { Logger } from '../core/logger.js';
import { AnalyzeBody } from '../core/validate.js';
import { assertPublicHttpHost } from '../core/ssrfGuard.js';
import { normalizeYtError } from '../core/errors.js';
import { dumpJson as dumpInfoJson, cleanedChildEnv } from '../core/yt.js';
import { isUrlAllowed } from '../core/urlAllow.js';
import { makeHeaders } from '../core/ytHelpers.js';
import { HttpError } from '../core/httpError.js';
import { wrap } from '../core/wrap.js';

export type AnalyzeDeps = {
  cfg: AppConfig;
  log: Logger;
  analyzeRateLimit: any;
  proxyBucket: any;
  proxyLimiter: any;
  proxyDownload: (req: Request, res: Response, next: NextFunction) => Promise<void> | void;
};

export function setupAnalyzeRoutes(app: any, requireAuth: any, deps: AnalyzeDeps) {
  const { cfg, log, analyzeRateLimit, proxyBucket, proxyLimiter, proxyDownload } = deps;

  app.post('/api/analyze', analyzeRateLimit, requireAuth as any, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { url } = AnalyzeBody.parse(req.body);
      if (!isUrlAllowed(url, cfg)) return res.status(400).json({ error: 'Invalid or missing url' });
      await assertPublicHttpHost(url!);
      const json = await dumpInfoJson(url!, {
        args: {
          preferFreeFormats: true,
          addHeader: makeHeaders(url!),
          ...(cfg.maxFileSizeMb ? { maxFilesize: `${cfg.maxFileSizeMb}M` } : {}),
          ...(cfg.maxDurationSec ? { matchFilter: `duration <= ${cfg.maxDurationSec}` } : {}),
        },
      });
      res.json(json);
    } catch (err: any) {
      const { status, code, message } = normalizeYtError(err);
      log.error('analyze_failed', err?.message || err);
      return next(new HttpError(status, code, message));
    }
  });

  app.get('/api/proxy-download', requireAuth as any, proxyBucket, proxyLimiter, wrap(proxyDownload));

  app.post('/api/get-url', requireAuth as any, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { url, formatId } = req.body as { url?: string; formatId?: string };
      if (!url || !formatId || !isUrlAllowed(url, cfg)) {
        return res.status(400).json({ error: 'missing_or_invalid_params' });
      }
      const FORMAT_ID_RE = /^[0-9a-zA-Z+*/.\-]{1,32}$/;
      if (!FORMAT_ID_RE.test(formatId)) {
        return res.status(400).json({ error: 'invalid_format_id' });
      }
      await assertPublicHttpHost(url);
      const output: string = await (ytdlp as any)(
        url,
        {
          getUrl: true,
          format: formatId,
          noCheckCertificates: true,
          noWarnings: true,
          addHeader: makeHeaders(url),
          ...(cfg.maxFileSizeMb ? { maxFilesize: `${cfg.maxFileSizeMb}M` } : {}),
          ...(cfg.maxDurationSec ? { matchFilter: `duration <= ${cfg.maxDurationSec}` } : {}),
        },
        { env: cleanedChildEnv(process.env) }
      );
      const lines = String(output).trim().split(/\r?\n/).filter(Boolean);
      res.json({ url: lines[0] || '' });
    } catch (err: any) {
      log.error('get_url_failed', err?.message || err);
      return next(new HttpError(400, 'GET_URL_FAILED', String(err?.stderr || err?.message || err)));
    }
  });
}
