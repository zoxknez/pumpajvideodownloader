import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'node:fs';
import path from 'node:path';

// https://vitejs.dev/config/
function resolveBackendPort(): number {
  try {
    const p = path.resolve(process.cwd(), 'server', 'server', 'data', 'settings.json');
    if (fs.existsSync(p)) {
      const j = JSON.parse(fs.readFileSync(p, 'utf8'));
      const n = Number(j?.lastPort);
      if (Number.isFinite(n) && n > 0) return n;
    }
  } catch {}
  return 5176;
}

export default defineConfig((env) => {
  const bePort = resolveBackendPort();
  return {
  base: env.command === 'build' ? './' : '/',
    plugins: [react()],
    optimizeDeps: {
      exclude: ['lucide-react'],
    },
    server: {
      port: 5183,
      strictPort: false,
      proxy: {
        '/api': {
          target: `http://127.0.0.1:${bePort}`,
          changeOrigin: true,
        },
        '/auth': {
          target: `http://127.0.0.1:${bePort}`,
          changeOrigin: true,
        },
        '/health': {
          target: `http://127.0.0.1:${bePort}`,
          changeOrigin: true,
        },
      },
    },
  };
});
