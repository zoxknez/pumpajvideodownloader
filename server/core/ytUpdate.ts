import { spawn } from 'node:child_process';
import type { Logger } from './logger.js';

const DEFAULT_INTERVAL_HOURS = 6;
let started = false;
let updating: Promise<void> | null = null;

function readIntervalMs(): number {
  const raw = process.env.YTDLP_AUTO_UPDATE_HOURS;
  if (!raw) return DEFAULT_INTERVAL_HOURS * 60 * 60 * 1000;
  const hours = Number(raw);
  if (!Number.isFinite(hours) || hours <= 0) {
    return DEFAULT_INTERVAL_HOURS * 60 * 60 * 1000;
  }
  return Math.max(0.5, hours) * 60 * 60 * 1000;
}

export function startYtDlpAutoUpdate(log: Logger): void {
  if (started) return;
  started = true;

  if (process.env.YTDLP_AUTO_UPDATE === '0') {
    log.info('ytdlp_auto_update_disabled', 'Skipping yt-dlp auto-update (env override)');
    return;
  }

  const run = (trigger: string) => {
    updating ??= ensureYtDlpFresh(log, trigger).finally(() => {
      updating = null;
    });
    return updating;
  };

  void run('startup');

  const intervalMs = readIntervalMs();
  const timer = setInterval(() => {
    if (updating) return;
    void run('interval');
  }, intervalMs);

  if (typeof timer.unref === 'function') {
    timer.unref();
  }
}

async function ensureYtDlpFresh(log: Logger, trigger: string): Promise<void> {
  return new Promise((resolve) => {
    try {
      const child = spawn('yt-dlp', ['-U'], {
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      let lastLine = '';
      let stderr = '';

      child.stdout?.on('data', (chunk: Buffer) => {
        const text = chunk.toString('utf8');
        const lines = text.split(/\r?\n/).filter(Boolean);
        if (lines.length) {
          lastLine = lines[lines.length - 1];
        }
      });

      child.stderr?.on('data', (chunk: Buffer) => {
        stderr += chunk.toString('utf8');
      });

      child.on('error', (err) => {
        log.warn('ytdlp_update_spawn_failed', {
          trigger,
          error: String(err),
        });
        resolve();
      });

      child.on('close', (code) => {
        if (code === 0) {
          log.info('ytdlp_update_checked', {
            trigger,
            detail: lastLine || 'no_output',
          });
        } else {
          log.warn('ytdlp_update_failed', {
            trigger,
            exitCode: code,
            stderr: stderr.trim().slice(0, 512) || lastLine || 'unknown',
          });
        }
        resolve();
      });
    } catch (err: any) {
      log.warn('ytdlp_update_exception', {
        trigger,
        error: String(err?.message || err),
      });
      resolve();
    }
  });
}
