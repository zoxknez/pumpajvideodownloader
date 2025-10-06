'use client';

import React from 'react';
import dynamic from 'next/dynamic';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import ClientOnly from '@/components/ClientOnly';
import { LoginGate } from '@/components/AuthProvider';

const DownloadView = dynamic(() => import('@/components/DownloadView'), { ssr: false });

export default function Page() {
  return (
    <LoginGate>
      <ErrorBoundary>
        <ClientOnly>
          <DownloadView />
        </ClientOnly>
      </ErrorBoundary>
    </LoginGate>
  );
}
