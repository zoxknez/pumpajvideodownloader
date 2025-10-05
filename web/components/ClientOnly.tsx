'use client';
import React from 'react';

export default function ClientOnly({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = React.useState(false);
  React.useEffect(() => setReady(true), []);
  if (!ready) return null;
  return <>{children}</>;
}
