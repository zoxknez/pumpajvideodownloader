import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { extname } from 'node:path';
import { sanitizeFileName, chooseExtFromMimeOrUrl } from './utils.js';

const exec = promisify(execFile);
const YTDLP_BINARY = process.env.YTDLP_BINARY || 'yt-dlp';

export type AnalyzeResult = {
  info: any;
  summary: {
    id?: string;
    title?: string;
    duration?: number;
    uploader?: string;
    extractor?: string;
    webpage_url?: string;
    hasFormats: boolean;
  };
};

export async function analyzeUrl(url: string): Promise<AnalyzeResult> {
  const { stdout } = await exec(YTDLP_BINARY, ['-J', url], {
    maxBuffer: 1024 * 1024 * 8,
  });

  const json = JSON.parse(stdout);
  const entry = json?.entries?.[0] || json;

  return {
    info: entry,
    summary: {
      id: entry?.id,
      title: entry?.title,
      duration: entry?.duration,
      uploader: entry?.uploader,
      extractor: entry?.extractor,
      webpage_url: entry?.webpage_url || url,
      hasFormats: Array.isArray(entry?.formats) && entry.formats.length > 0,
    },
  };
}

export type GetUrlArgs = {
  url: string;
  kind?: 'best' | 'audio';
  formatId?: string;
  title?: string;
};

export type GetUrlResult = {
  finalUrl: string;
  filename: string;
};

export async function getDirectUrl({ url, kind = 'best', formatId, title }: GetUrlArgs): Promise<GetUrlResult> {
  const format = formatId ? formatId : kind === 'audio' ? 'bestaudio' : 'best';
  const { stdout } = await exec(YTDLP_BINARY, ['-g', '-f', format, url], {
    maxBuffer: 1024 * 1024 * 2,
  });

  const lines = stdout.split('\n').map((line) => line.trim()).filter(Boolean);
  const finalUrl = lines[0];
  if (!finalUrl) {
    throw new Error('direct_url_not_found');
  }

  const safeTitle = sanitizeFileName(title || '');

  let ext = '';
  try {
    const pathname = new URL(finalUrl).pathname;
    ext = extname(pathname).toLowerCase().replace(/^\./, '');
  } catch {}

  if (!ext) {
    ext = chooseExtFromMimeOrUrl(undefined, finalUrl) || (kind === 'audio' ? 'audio' : 'video');
  }

  const filename = safeTitle
    ? `${safeTitle}.${ext}`
    : kind === 'audio'
      ? `audio.${ext}`
      : `video.${ext}`;

  return { finalUrl, filename };
}
