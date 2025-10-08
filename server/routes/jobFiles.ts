import fs from 'node:fs';
import path from 'node:path';
import type { Request, Response } from 'express';
import type { Logger } from '../core/logger.js';
import type { Job } from '../core/jobHelpers.js';
import type { FinalizeJobFn } from '../core/jobState.js';
import { setNoStore, setDownloadHeaders, appendVary } from '../core/http.js';
import { signToken } from '../core/signed.js';
import { signIssued, signTtl } from '../middleware/httpMetrics.js';
import type { HistoryItem } from '../core/history.js';

export type JobFileDeps = {
  jobs: Map<string, Job>;
  finalizeJob: FinalizeJobFn;
  readHistory: () => HistoryItem[];
  log: Logger;
};

export type JobFileMiddleware = {
  requireAuth: any;
  requireAuthOrSigned: any;
  signBucket: any;
  jobBucket: any;
};

export function setupJobFileRoutes(app: any, middleware: JobFileMiddleware, deps: JobFileDeps) {
  const { requireAuth, requireAuthOrSigned, signBucket, jobBucket } = middleware;
  const { jobs, finalizeJob, readHistory, log } = deps;

  app.post('/api/job/file/:id/sign', requireAuth as any, signBucket, (req: Request, res: Response) => {
    const id = (req.params as any).id;
    const job = jobs.get(id);
    if (!job || !job.produced) {
      return res.status(404).json({ error: 'not_found' });
    }

    const requested = Number((req.body as any)?.expiresIn ?? 0);
    const ttl = Number.isFinite(requested) && requested > 0 ? Math.min(Math.floor(requested), 3600) : 1800;
    const scope = 'download' as const;
    const token = signToken({ sub: `job:${id}`, scope, ver: job.version }, ttl);
    signIssued.inc({ scope });
    signTtl.observe(ttl);
    setNoStore(res);
    return res.json({ token, expiresAt: Date.now() + ttl * 1000, queryParam: 's' });
  });

  app.post('/api/progress/:id/sign', requireAuth as any, signBucket, (req: Request, res: Response) => {
    const id = (req.params as any).id;
    const job = jobs.get(id);
    if (!job) {
      return res.status(404).json({ error: 'not_found' });
    }

    const requested = Number((req.body as any)?.expiresIn ?? 0);
    const ttl = Number.isFinite(requested) && requested > 0 ? Math.min(Math.floor(requested), 3600) : 600;
    const scope = 'progress' as const;
    const token = signToken({ sub: `job:${id}`, scope, ver: job.version }, ttl);
    signIssued.inc({ scope });
    signTtl.observe(ttl);
    setNoStore(res);
    return res.json({ token, expiresAt: Date.now() + ttl * 1000, queryParam: 's' });
  });

  app.get('/api/job/file/:id', requireAuthOrSigned('download'), jobBucket, (req: Request, res: Response) => {
    const id = (req.params as any).id;
    const job = jobs.get(id);
    if (!job || !job.produced) return res.status(404).json({ error: 'not_found' });
    const full = path.join(job.tmpDir, job.produced);
    if (!fs.existsSync(full)) return res.status(404).json({ error: 'file_missing' });

    try {
      const stat = fs.statSync(full);
      appendVary(res, 'Authorization');
      const ext = path.extname(full).toLowerCase();
      const audioExts = new Set(['.mp3', '.m4a', '.aac', '.opus', '.flac', '.wav', '.ogg', '.oga', '.alac']);
      const isAudio = audioExts.has(ext);
      const videoType = ext === '.mkv' ? 'video/x-matroska' : ext === '.webm' ? 'video/webm' : 'video/mp4';
      const audioType =
        ext === '.mp3'
          ? 'audio/mpeg'
          : ext === '.opus'
            ? 'audio/opus'
            : ext === '.ogg' || ext === '.oga'
              ? 'audio/ogg'
              : ext === '.flac'
                ? 'audio/flac'
                : ext === '.wav'
                  ? 'audio/wav'
                  : 'audio/mp4';
      res.setHeader('Content-Type', isAudio ? audioType : videoType);

      const etag = `W/"${stat.size.toString(16)}-${Math.floor(stat.mtimeMs).toString(16)}"`;
      res.setHeader('ETag', etag);
      res.setHeader('Last-Modified', stat.mtime.toUTCString());

  const historyEntry = readHistory().find((x) => x.id === id);
  const base = (historyEntry?.title || (job.type === 'audio' ? 'audio' : 'video')).replace(/[^\w.-]+/g, '_');
      const extName = path.extname(full).replace(/^\./, '') || (job.type === 'audio' ? 'm4a' : 'mp4');
      setDownloadHeaders(res, `${base}.${extName}`, undefined, etag);

      const ifNoneMatch = req.headers['if-none-match'];
      if (ifNoneMatch) {
        const tags = String(ifNoneMatch).split(',').map((t) => t.trim());
        const matches = tags.some((t) => t === etag || t === '*');
        if (matches) {
          res.status(304);
          return res.end();
        }
      }

      const rangeHeader = req.headers.range;
      if (rangeHeader) {
        const rangeStr = String(rangeHeader);
        let start: number;
        let end: number;
        const suffixMatch = rangeStr.match(/bytes=-(\d+)$/);
        const standardMatch = rangeStr.match(/bytes=(\d+)-(\d+)?$/);

        if (suffixMatch) {
          const suffix = parseInt(suffixMatch[1], 10);
          if (suffix <= 0 || !Number.isFinite(suffix)) {
            res.status(416);
            res.setHeader('Content-Range', `bytes */${stat.size}`);
            return res.end();
          }
          start = Math.max(0, stat.size - suffix);
          end = stat.size - 1;
        } else if (standardMatch) {
          start = parseInt(standardMatch[1], 10);
          end = standardMatch[2] ? parseInt(standardMatch[2], 10) : stat.size - 1;
        } else {
          res.status(416);
          res.setHeader('Content-Range', `bytes */${stat.size}`);
          return res.end();
        }

        if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end < start || start >= stat.size) {
          res.status(416);
          res.setHeader('Content-Range', `bytes */${stat.size}`);
          return res.end();
        }

        end = Math.min(end, stat.size - 1);

        res.status(206);
        res.setHeader('Content-Range', `bytes ${start}-${end}/${stat.size}`);
        res.setHeader('Content-Length', String(end - start + 1));
        appendVary(res, 'Range');
        const stream = fs.createReadStream(full, { start, end });
        const isFull = start === 0 && end === stat.size - 1;
        const ender = () => {
          try {
            stream.destroy();
          } catch {}
        };
        res.on('close', ender);
        res.on('aborted', ender);
        stream.pipe(res);
        stream.on('close', () => {
          if (isFull) {
            try {
              fs.unlinkSync(full);
            } catch {}
            finalizeJob(id, 'completed', { job, keepJob: false, keepFiles: false });
          }
        });
        return;
      }

      res.setHeader('Content-Length', String(stat.size));
      appendVary(res, 'Range');
      if (req.method === 'HEAD') return res.end();

      const stream = fs.createReadStream(full);
      const ender = () => {
        try {
          stream.destroy();
        } catch {}
      };
      res.on('close', ender);
      res.on('aborted', ender);
      stream.pipe(res);
      stream.on('close', () => {
        try {
          fs.unlink(full, () => {});
        } catch {}
        finalizeJob(id, 'completed', { job, keepJob: false, keepFiles: false });
      });
    } catch (err: any) {
      log.error('job_file_failed', err?.message || err);
      res.status(500).json({ error: 'job_file_failed' });
    }
  });
}
