/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  eslint: {
    ignoreDuringBuilds: true,
  },
  experimental: {
    externalDir: true, // Allow imports from parent directories (desktop backup)
  },
  webpack: (config) => {
    // Allow importing from deskkgui folder
    const path = require('path');
    config.resolve.alias = {
      ...config.resolve.alias,
      '@deskkgui': path.resolve(__dirname, '../deskkgui/src'),
      // OVERRIDE: Desktop AuthProvider → Web AuthProvider (Supabase)
      '@deskkgui/components/AuthProvider': path.resolve(__dirname, './components/AuthProvider.tsx'),
      // OVERRIDE: Desktop Sentry → Mock (disable telemetry for web)
      '@deskkgui/telemetry/sentry': path.resolve(__dirname, './lib/sentry-mock.ts'),
    };
    return config;
  },
  // API Proxy - forward requests to backend (Railway)
  async rewrites() {
    const apiBase = process.env.NEXT_PUBLIC_API_BASE || 'https://pumpajvideodownloader-production.up.railway.app';
    return [
      {
        source: '/api/:path*',
        destination: `${apiBase}/api/:path*`,
      },
      {
        source: '/auth/:path*',
        destination: `${apiBase}/auth/:path*`,
      },
      {
        source: '/health',
        destination: `${apiBase}/health`,
      },
    ];
  },
  // Security headers
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
          // CSP: allow self, data/blob for images/media, external APIs for connect-src
          {
            key: 'Content-Security-Policy',
            value: "default-src 'self'; img-src 'self' data: blob: https:; media-src 'self' blob:; connect-src 'self' https: http:; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline';",
          },
        ],
      },
    ];
  },
};
module.exports = nextConfig;
