'use client'
import React, { useEffect } from 'react'
import { AuthProvider } from '@/components/AuthProvider'
import { ToastProvider } from '@/components/ToastProvider'
import { SettingsProvider } from '@/components/SettingsContext'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { initSentry } from '@/lib/sentry-mock'

export function Providers({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    initSentry()
  }, [])

  return (
    <ErrorBoundary>
      <SettingsProvider>
        <AuthProvider>
          <ToastProvider>
            {children}
          </ToastProvider>
        </AuthProvider>
      </SettingsProvider>
    </ErrorBoundary>
  )
}
