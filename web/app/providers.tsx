'use client'
import React from 'react'
import { AuthProvider } from '@/components/AuthProvider'
import { ToastProvider } from '@/components/ToastProvider'
import { SettingsProvider } from '@/components/SettingsContext'
import { ErrorBoundary } from '@/components/ErrorBoundary'

export function Providers({ children }: { children: React.ReactNode }) {
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
