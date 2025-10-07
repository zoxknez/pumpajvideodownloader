/**
 * Log viewing routes
 * Handles /api/logs/tail, /api/logs/recent, /api/logs/download
 */

import type { Response, Request } from 'express';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Setup log routes
 */
export function setupLogRoutes(app: any, requireAuth: any) {
  // ========================
  // GET /api/logs/tail (last N lines)
  // ========================
  app.get('/api/logs/tail', requireAuth as any, (req: Request, res: Response) => {
    try {
      const max = Math.max(1, Math.min(500, parseInt(String(req.query.lines || '200'), 10) || 200));
      const logDir = path.resolve(process.cwd(), 'logs');
      const logFile = path.join(logDir, 'app.log');
      if (!fs.existsSync(logFile)) return res.json({ lines: [] });
      const buf = fs.readFileSync(logFile, 'utf8');
      const tail = buf.split(/\r?\n/).slice(-max);
      res.json({ lines: tail });
    } catch (err: any) {
      res.status(500).json({ error: 'tail_failed', details: String(err?.message || err) });
    }
  });

  // ========================
  // GET /api/logs/recent (filtered logs)
  // ========================
  app.get('/api/logs/recent', requireAuth as any, (req: Request, res: Response) => {
    try {
      const logDir = path.resolve(process.cwd(), 'logs');
      const logFile = path.join(logDir, 'app.log');
      if (!fs.existsSync(logFile)) return res.json({ lines: [] });
      const max = Math.max(1, Math.min(1000, parseInt(String(req.query.lines || '300'), 10) || 300));
      const level = String(req.query.level || '').toLowerCase();
      const q = String(req.query.q || '').trim().toLowerCase();
      let lines = fs
        .readFileSync(logFile, 'utf8')
        .split(/\r?\n/)
        .filter(Boolean);
      if (level && ['debug', 'info', 'warn', 'error'].includes(level)) {
        const token = `| ${level.toUpperCase()} |`;
        lines = lines.filter((l) => l.includes(token));
      }
      if (q) lines = lines.filter((l) => l.toLowerCase().includes(q));
      const out = lines.slice(-max);
      res.json({ lines: out, count: out.length });
    } catch (err: any) {
      res.status(500).json({ error: 'recent_failed', details: String(err?.message || err) });
    }
  });

  // ========================
  // GET /api/logs/download (export logs as file)
  // ========================
  app.get('/api/logs/download', requireAuth as any, (req: Request, res: Response) => {
    try {
      const logDir = path.resolve(process.cwd(), 'logs');
      const logFile = path.join(logDir, 'app.log');
      if (!fs.existsSync(logFile)) {
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        return res.end('');
      }
      const max = Math.max(1, Math.min(5000, parseInt(String(req.query.lines || '1000'), 10) || 1000));
      const level = String(req.query.level || '').toLowerCase();
      const q = String(req.query.q || '').trim().toLowerCase();
      let lines = fs
        .readFileSync(logFile, 'utf8')
        .split(/\r?\n/)
        .filter(Boolean);
      if (level && ['debug', 'info', 'warn', 'error'].includes(level)) {
        const token = `| ${level.toUpperCase()} |`;
        lines = lines.filter((l) => l.includes(token));
      }
      if (q) lines = lines.filter((l) => l.toLowerCase().includes(q));
      const out = lines.slice(-max).join('\n');
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="logs.txt"');
      res.end(out);
    } catch (err: any) {
      res.status(500).json({ error: 'download_failed', details: String(err?.message || err) });
    }
  });
}
