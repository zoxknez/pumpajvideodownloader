import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'node:fs';
import path from 'node:path';

// https://vitejs.dev/config/
function resolveBackendPort(): number {
  try {
    // Prefer new canonical path: <repo>/server/data/settings.json
    const pNew = path.resolve(process.cwd(), 'server', 'data', 'settings.json');
    if (fs.existsSync(pNew)) {
      const j = JSON.parse(fs.readFileSync(pNew, 'utf8'));
      const n = Number(j?.lastPort);
      if (Number.isFinite(n) && n > 0) return n;
    }
    // Fallback to legacy path used by older builds
    const pLegacy = path.resolve(process.cwd(), 'server', 'server', 'data', 'settings.json');
    if (fs.existsSync(pLegacy)) {
      const j = JSON.parse(fs.readFileSync(pLegacy, 'utf8'));
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
    build: {
      rollupOptions: {
        output: {
          manualChunks: {
            // Vendor chunk - React libraries
            vendor: ['react', 'react-dom'],
            // Auth chunk - Supabase for authentication
            auth: ['@supabase/supabase-js'],
            // Monitoring chunk - Sentry for telemetry
            monitoring: ['@sentry/browser'],
            // UI chunk - UI libraries
            ui: ['lucide-react']
          }
        }
      },
      // Increase chunk size warning limit
      chunkSizeWarningLimit: 1000
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
