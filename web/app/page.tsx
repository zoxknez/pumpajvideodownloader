// app/page.tsx
'use client';

import { AuthProvider, LoginGate } from '@/components/AuthProvider';
import DownloaderHome from '@/components/DownloaderHome';

export default function HomePage() {
  return (
    <AuthProvider>
      <LoginGate>
        {/* When user is logged in, show the main downloader application */}
        <DownloaderHome />
      </LoginGate>
    </AuthProvider>
  );
}
