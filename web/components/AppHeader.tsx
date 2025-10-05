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

// Normalize path: remove trailing slash and query params
const normalizePath = (p: string) => p.replace(/\/+$/, '').split('?')[0] || '/';

// Check if tab is active (handles sub-routes, trailing slash, query params)
const isActiveTab = (href: string, pathname: string) => {
  const normHref = normalizePath(href);
  const normPath = normalizePath(pathname);
  return normHref === '/' ? normPath === '/' : normPath.startsWith(normHref);
};

export default function AppHeader() {
  const pathname = usePathname();
  return (
    <header className="sticky top-0 z-50 border-b border-sky-200/60 bg-sky-100/80 backdrop-blur supports-[backdrop-filter]:bg-sky-100/60">
      <div className="mx-auto max-w-6xl px-4 py-3 flex items-center gap-4">
        <div className="font-extrabold tracking-tight text-sky-900 text-lg">PUMPAJ</div>
        <nav className="flex items-center gap-1">
          {tabs.map(t => {
            const active = isActiveTab(t.href, pathname);
            return (
              <Link
                key={t.href}
                href={t.href}
                className={[
                  'rounded-xl px-3 py-1.5 text-sm transition',
                  active
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
