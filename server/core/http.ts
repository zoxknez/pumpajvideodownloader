import type { Response } from 'express';
import type { ChildProcess } from 'node:child_process';
import { spawnSync } from 'node:child_process';

/**
 * HTTP response utilities
 * Consistent header setting and response helpers
 */

/**
 * Set no-cache headers (HTTP/1.0 and HTTP/1.1 compatible)
 * Use for all download/streaming/SSE responses
 */
export const setNoStore = (res: Response): void => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Pragma', 'no-cache');
};

/**
 * Set CORS headers for allowed origin
 */
export const setCorsHeaders = (res: Response, origin: string): void => {
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Credentials', 'true');
};

/**
 * Set SSE headers
 */
export const setSseHeaders = (res: Response): void => {
  res.setHeader('Content-Type', 'text/event-stream');
  setNoStore(res);
  res.setHeader('X-Accel-Buffering', 'no');
  res.setHeader('Connection', 'keep-alive');
};

/**
 * Set download headers with RFC 5987 filename* encoding for Unicode support
 */
export const setDownloadHeaders = (
  res: Response,
  filename: string,
  size?: number,
  etag?: string
): void => {
  // RFC 5987: filename* with UTF-8 encoding for better Unicode support
  const asciiSafe = filename.replace(/[^\x20-\x7E]/g, '_'); // ASCII fallback
  const utf8Encoded = encodeURIComponent(filename);
  res.setHeader('Content-Disposition', `attachment; filename="${asciiSafe}"; filename*=UTF-8''${utf8Encoded}`);
  
  if (size !== undefined) {
    res.setHeader('Content-Length', String(size));
  }
  if (etag) {
    res.setHeader('ETag', etag);
  }
  setNoStore(res);
  res.setHeader('Accept-Ranges', 'bytes');
};

/**
 * Append value to Vary header
 */
export const appendVary = (res: Response, value: string): void => {
  const existing = res.getHeader('Vary');
  if (!existing) {
    res.setHeader('Vary', value);
    return;
  }
  const parts = String(existing)
    .split(',')
    .map((s) => s.trim().toLowerCase());
  const lower = value.toLowerCase();
  if (!parts.includes(lower)) {
    parts.push(lower);
    res.setHeader('Vary', parts.join(', '));
  }
};

/**
 * Safely kill child process and its descendants (cross-platform)
 * 
 * POSIX: Uses negative PID to kill process group (requires detached: true)
 * Windows: Uses taskkill /T /F to kill process tree
 * 
 * Sends SIGTERM first, then SIGKILL after 5s timeout
 */
export const safeKill = (child?: ChildProcess & { killed?: boolean }): void => {
  if (!child?.pid || child.killed) return;

  try {
    if (process.platform !== 'win32') {
      // POSIX: Try to kill process group first (negative PID)
      try {
        process.kill(-child.pid, 'SIGTERM');
      } catch {
        // Fallback to single process kill
        try {
          process.kill(child.pid, 'SIGTERM');
        } catch {}
      }

      // SIGKILL after 5s timeout
      setTimeout(() => {
        if (child.killed || !child.pid) return;
        try {
          process.kill(-child.pid, 'SIGKILL');
        } catch {
          try {
            process.kill(child.pid, 'SIGKILL');
          } catch {}
        }
      }, 5000);
    } else {
      // Windows: taskkill with /T (tree) and /F (force)
      try {
        spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], {
          timeout: 10000,
          windowsHide: true,
        });
      } catch {
        // Fallback: try without /F flag first
        try {
          spawnSync('taskkill', ['/PID', String(child.pid), '/T'], {
            timeout: 5000,
            windowsHide: true,
          });
        } catch {}
      }
    }
    
    child.killed = true;
  } catch (err) {
    // Log but don't throw - killing is best-effort
    console.warn('safeKill failed:', err);
  }
};
