// app/page.tsx
'use client';

import { AuthProvider, LoginGate } from '@/components/AuthProvider';
import { AppShell } from '@/components/AppShell';

export default function HomePage() {
  return (
    <AuthProvider>
      <LoginGate>
        {/* When user is logged in, show the full app with header, sidebar, tabs, etc */}
        <AppShell />
      </LoginGate>
    </AuthProvider>
  );
}
