'use client';

import React from 'react';
import dynamic from 'next/dynamic';
import AppHeader from '@/components/AppHeader';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { LoginGate } from '@/components/AuthProvider';

const SettingsView = dynamic(() => import('@/components/SettingsView'), { ssr: false });

export default function SettingsPage() {
  return (
    <LoginGate>
      <AppHeader />
      <ErrorBoundary>
        <SettingsView />
      </ErrorBoundary>
    </LoginGate>
  );
}
