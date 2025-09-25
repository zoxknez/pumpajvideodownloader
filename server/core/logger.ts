import fs from 'node:fs';
import path from 'node:path';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LOG_DIR = path.resolve(process.cwd(), 'logs');
const LOG_FILE = path.join(LOG_DIR, 'app.log');
const MAX_BYTES = 2_000_000; // 2MB
const BACKUPS = 3;

function rotateIfNeeded(filePath: string) {
  try {
    if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });
    if (!fs.existsSync(filePath)) return;
    const stat = fs.statSync(filePath);
    if (stat.size < MAX_BYTES) return;
    for (let i = BACKUPS - 1; i >= 0; i--) {
      const src = i === 0 ? filePath : `${filePath}.${i}`;
      const dst = `${filePath}.${i + 1}`;
      if (fs.existsSync(src)) {
        try { fs.renameSync(src, dst); } catch {}
      }
    }
  } catch {}
}

function write(line: string) {
  try {
    rotateIfNeeded(LOG_FILE);
    fs.appendFileSync(LOG_FILE, line + '\n', 'utf8');
  } catch {}
}

function ts() {
  return new Date().toISOString();
}

export function getLogger(name = 'app') {
  const prefix = (lvl: string) => `${ts()} | ${lvl.toUpperCase()} | ${name} |`;
  return {
    debug: (...args: any[]) => { const msg = `${prefix('debug')} ${args.map(String).join(' ')}`; write(msg); if (process.env.NODE_ENV !== 'production') console.debug(msg); },
    info:  (...args: any[]) => { const msg = `${prefix('info')} ${args.map(String).join(' ')}`;  write(msg); console.log(msg); },
    warn:  (...args: any[]) => { const msg = `${prefix('warn')} ${args.map(String).join(' ')}`;  write(msg); console.warn(msg); },
    error: (...args: any[]) => { const msg = `${prefix('error')} ${args.map(String).join(' ')}`; write(msg); console.error(msg); },
  };
}

export type Logger = ReturnType<typeof getLogger>;
