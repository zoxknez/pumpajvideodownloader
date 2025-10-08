import { Readable } from 'node:stream';
import type { Request, Response } from 'express';
import type { Logger } from '../core/logger.js';
import { policyFor } from '../core/policy.js';
import { assertPublicHttpHost } from '../core/ssrfGuard.js';
import { safeName } from '../core/ytHelpers.js';

export type SubtitleDeps = {
  ffmpegEnabled: () => boolean;
};

export function setupSubtitleRoutes(app: any, requireAuth: any, log: Logger, deps: SubtitleDeps) {
  const { ffmpegEnabled } = deps;

  app.get('/api/subtitles/download', requireAuth as any, async (req: Request, res: Response) => {
    if (!ffmpegEnabled()) {
      return res.status(501).json({
        error: 'feature_disabled',
        message: 'Subtitle extraction requires FFmpeg which is disabled in this deployment',
      });
    }

    try {
      const src = String((req.query as any).url || '');
      const title = String((req.query as any).title || 'subtitles');
      const outFmt = String((req.query as any).format || 'vtt').toLowerCase();
      const offsetSec = Number((req.query as any).offset || 0) || 0;
      if (!src || !/^https?:\/\//i.test(src)) return res.status(400).json({ error: 'invalid_src' });
      await assertPublicHttpHost(src);

      const policy = policyFor((req as any).user?.plan);
      if (!policy.allowSubtitles) return res.status(403).json({ error: 'SUBTITLES_NOT_ALLOWED' });

  const outExt = outFmt === 'srt' ? 'srt' : 'vtt';

      if (offsetSec === 0 && /\.vtt($|\?|#)/i.test(src) && outExt === 'vtt') {
        const upstream = await fetch(src, { headers: { 'user-agent': 'Mozilla/5.0' } });
        if (!upstream.ok || !upstream.body) return res.status(502).json({ error: 'upstream_failed', status: upstream.status });
        res.setHeader('Content-Type', 'text/vtt; charset=utf-8');
        const safe = safeName(title || 'subtitles');
        res.setHeader('Content-Disposition', `attachment; filename="${safe}.vtt"`);
        return (Readable as any).fromWeb(upstream.body as any).pipe(res);
      }

      return res.status(501).json({ error: 'ffmpeg_not_available' });
    } catch (err: any) {
      log.error('subtitles_download_failed', err?.message || err);
      res.status(500).json({ error: 'subtitles_failed' });
    }
  });
}
