import type { Request, Response } from 'express';
import { Readable } from 'node:stream';
import { chooseExtFromMimeOrUrl, sanitizeFileName } from './utils.js';

function buildAllowedHosts(): Set<string> {
  const raw = process.env.PROXY_ALLOW_HOSTS
    || 'youtube.com,youtu.be,ytimg.com,googlevideo.com,vimeo.com,cdn.videodelivery.net';
  return new Set(
    raw
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean),
  );
}

const ALLOW = buildAllowedHosts();

function hostMatchesAllowList(hostname: string): boolean {
  const normalized = hostname.replace(/^www\./, '');
  if (ALLOW.has(normalized)) return true;
  for (const entry of ALLOW) {
    if (normalized === entry) return true;
    if (normalized.endsWith(`.${entry}`)) return true;
  }
  return false;
}

function assertPublicHttpHost(url: URL) {
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error('bad_protocol');
  }
  if (!hostMatchesAllowList(url.hostname)) {
    throw new Error('host_blocked');
  }
}

export async function proxyDownload(req: Request, res: Response) {
  try {
    const srcCandidate = req.query.src ?? req.query.url;
    const src = String(srcCandidate ?? '').trim();
    const title = String(req.query.title ?? req.query.filename ?? '').trim();

    if (!src) {
      res.status(400).send('missing_src');
      return;
    }

    const target = new URL(src);
    assertPublicHttpHost(target);

    const headResponse = await fetch(target, { method: 'HEAD' }).catch(() => null);
    const contentType = headResponse?.ok ? headResponse.headers.get('content-type') : null;

    const safeBase = sanitizeFileName(title || target.pathname.split('/').pop() || 'download');
    const ext = chooseExtFromMimeOrUrl(contentType, target.toString()) || 'bin';
    const filename = `${safeBase}.${ext}`;

    const upstream = await fetch(target, { method: 'GET' });
    if (!upstream.ok || !upstream.body) {
      res.status(502).send('upstream_failed');
      return;
    }

    const length = upstream.headers.get('content-length');
    if (length) res.setHeader('Content-Length', length);
    const type = upstream.headers.get('content-type') || 'application/octet-stream';
    res.setHeader('Content-Type', type);

    const ascii = filename.replace(/[^\x20-\x7E]/g, '');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
    );

    const body: any = upstream.body;
    if (body && typeof body.pipe === 'function') {
      body.pipe(res);
      return;
    }

    if (body) {
      const nodeStream = Readable.fromWeb(body as any);
      nodeStream.on('error', () => res.end());
      nodeStream.pipe(res);
      return;
    }

    res.status(502).send('upstream_failed');
  } catch (error: any) {
    res.status(400).send(error?.message || 'proxy_failed');
  }
}
