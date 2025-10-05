import 'dotenv/config';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { analyzeUrl, getDirectUrl } from './yt.js';
import { proxyDownload } from './proxyDownload.js';

const app = express();

const PORT = Number(process.env.PORT || 5176);
const WEB_ORIGIN = process.env.WEB_ORIGIN || 'http://localhost:3000';
const ENABLE_LEGACY = String(process.env.ENABLE_LEGACY_DOWNLOADS || 'false').toLowerCase() === 'true';

app.use(helmet({ crossOriginResourcePolicy: false }));
app.use(express.json({ limit: '1mb' }));

const allow = new Set<string>([
  WEB_ORIGIN,
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
]);

app.use(
  cors({
    credentials: true,
    origin(origin, callback) {
      if (!origin) {
        callback(null, true);
        return;
      }
      try {
        const parsed = new URL(origin);
        const normalized = `${parsed.protocol}//${parsed.host}`;
        if (allow.has(normalized)) {
          callback(null, true);
          return;
        }
      } catch {}
      callback(new Error('CORS blocked'));
    },
  }),
);

async function handleAnalyzeRequest(rawUrl?: string) {
  const url = String(rawUrl || '').trim();
  if (!url) {
    const error = new Error('missing_url');
    (error as any).status = 400;
    throw error;
  }
  return analyzeUrl(url);
}

app.get('/api/health', (_req, res) => {
  res.json({ ok: true });
});

app.get('/api/analyze', async (req, res) => {
  try {
    const data = await handleAnalyzeRequest(req.query.url as string | undefined);
    res.json({ ok: true, ...data });
  } catch (error: any) {
    res.status(error?.status || 500).json({ ok: false, error: error?.message || 'analyze_failed' });
  }
});

app.post('/api/analyze', async (req, res) => {
  try {
    const data = await handleAnalyzeRequest(req.body?.url as string | undefined);
    res.json({ ok: true, ...data });
  } catch (error: any) {
    res.status(error?.status || 500).json({ ok: false, error: error?.message || 'analyze_failed' });
  }
});

app.get('/api/get-url', async (req, res) => {
  try {
    const url = String(req.query.url || '').trim();
    if (!url) {
      res.status(400).json({ ok: false, error: 'missing_url' });
      return;
    }
    const kind = (String(req.query.kind || 'best').toLowerCase() === 'audio' ? 'audio' : 'best') as 'best' | 'audio';
    const formatId = req.query.format_id ? String(req.query.format_id) : undefined;
    const title = req.query.title ? String(req.query.title) : undefined;

    const result = await getDirectUrl({ url, kind, formatId, title });
    res.json({ ok: true, ...result });
  } catch (error: any) {
    res.status(500).json({ ok: false, error: error?.message || 'get_url_failed' });
  }
});

app.get('/api/redirect', async (req, res) => {
  try {
    const url = String(req.query.url || '').trim();
    if (!url) {
      res.status(400).send('missing_url');
      return;
    }
    const kind = (String(req.query.kind || 'best').toLowerCase() === 'audio' ? 'audio' : 'best') as 'best' | 'audio';
    const formatId = req.query.format_id ? String(req.query.format_id) : undefined;
    const title = req.query.title ? String(req.query.title) : undefined;

    const { finalUrl, filename } = await getDirectUrl({ url, kind, formatId, title });
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.redirect(finalUrl);
  } catch (error: any) {
    res.status(500).send(error?.message || 'redirect_failed');
  }
});

app.get('/api/proxy-download', proxyDownload);

if (ENABLE_LEGACY) {
  console.log('[server] Legacy download routes enabled');
} else {
  console.log('[server] Legacy download routes DISABLED');
}

app.use((_req, res) => {
  res.status(404).json({ ok: false, error: 'not_found' });
});

export { app };

if (process.env.NODE_ENV !== 'test' && !process.env.VITEST) {
  app.listen(PORT, () => {
    console.log(`[server] Pumpaj API on http://localhost:${PORT}`);
    console.log(`[server] WEB_ORIGIN: ${WEB_ORIGIN}`);
  });
}
