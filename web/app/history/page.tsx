'use client';

import React from 'react';
import dynamic from 'next/dynamic';
import AppHeader from '@/components/AppHeader';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { LoginGate } from '@/components/AuthProvider';

const HistoryView = dynamic(() => import('@/components/HistoryView'), { ssr: false });

export default function HistoryPage() {
  return (
    <LoginGate>
      <AppHeader />
      <ErrorBoundary>
        <HistoryView />
      </ErrorBoundary>
    </LoginGate>
  );
}
