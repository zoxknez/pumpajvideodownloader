'use client';

import React from 'react';
import dynamic from 'next/dynamic';
import AppHeader from '@/components/AppHeader';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { LoginGate } from '@/components/AuthProvider';

const QueueView = dynamic(() => import('@/components/QueueView'), { ssr: false });

export default function QueuePage() {
  return (
    <LoginGate>
      <AppHeader />
      <ErrorBoundary>
        <QueueView />
      </ErrorBoundary>
    </LoginGate>
  );
}
