'use client';

import React from 'react';
import dynamic from 'next/dynamic';
import AppHeader from '@/components/AppHeader';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { LoginGate } from '@/components/AuthProvider';

const BatchView = dynamic(() => import('@/components/BatchView'), { ssr: false });

export default function BatchPage() {
  return (
    <LoginGate>
      <AppHeader />
      <ErrorBoundary>
        <BatchView />
      </ErrorBoundary>
    </LoginGate>
  );
}
