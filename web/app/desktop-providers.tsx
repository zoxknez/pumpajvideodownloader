'use client';

// Desktop providers - ONLY what web doesn't have (no AuthProvider, it uses Supabase)
// Order: ErrorBoundary → Settings → Toast
import { ToastProvider } from '@/components/ToastProvider';
import { SettingsProvider } from '@/components/SettingsContext';
import { ErrorBoundary } from '@/components/ErrorBoundary';

export function DesktopProviders({ children }: { children: React.ReactNode }) {
  return (
    <ErrorBoundary>
      <SettingsProvider>
        <ToastProvider>
          {children}
        </ToastProvider>
      </SettingsProvider>
    </ErrorBoundary>
  );
}
