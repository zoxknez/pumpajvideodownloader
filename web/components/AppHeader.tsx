'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import React from 'react';

const tabs = [
  { href: '/', label: 'Download' },
  { href: '/queue', label: 'Queue' },
  { href: '/history', label: 'History' },
  { href: '/batch', label: 'Batch' },
  { href: '/settings', label: 'Settings' },
] as const;

export default function AppHeader() {
  const pathname = usePathname();
  return (
    <header className="sticky top-0 z-50 border-b border-sky-200/60 bg-sky-100/80 backdrop-blur supports-[backdrop-filter]:bg-sky-100/60">
      <div className="mx-auto max-w-6xl px-4 py-3 flex items-center gap-4">
        <div className="font-extrabold tracking-tight text-sky-900 text-lg">PUMPAJ</div>
        <nav className="flex items-center gap-1">
          {tabs.map(t => {
            // Fix: handle sub-routes like /history/123
            const isActive = t.href === '/' ? pathname === '/' : pathname.startsWith(t.href);
            return (
              <Link
                key={t.href}
                href={t.href}
                className={[
                  'rounded-xl px-3 py-1.5 text-sm transition',
                  isActive
                    ? 'bg-sky-300/70 text-sky-950 shadow-sm'
                    : 'text-sky-900 hover:bg-sky-200/60',
                ].join(' ')}
              >
                {t.label}
              </Link>
            );
          })}
        </nav>
        <div className="ml-auto text-xs text-sky-800/80">local‑first • zero‑throttle</div>
      </div>
    </header>
  );
}
