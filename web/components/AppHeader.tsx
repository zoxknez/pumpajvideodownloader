'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import React, { useState } from 'react';

const tabs = [
  { href: '/', label: 'Analyze' },
  { href: '/downloading', label: 'Downloading' },
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

const SUPPORTED_SITES = [
  'YouTube', 'Vimeo', 'Dailymotion', 'TikTok', 'Instagram', 'Facebook', 'Twitter/X', 'Twitch', 'Reddit',
  'Streamable', 'SoundCloud', 'Bandcamp', 'Mixcloud', 'Imgur', 'Pornhub', 'Xvideos', 'Xhamster',
  'OnlyFans', 'Fansly', 'Chaturbate', 'Stripchat', 'BitChute', 'Rumble', 'Odysee', 'VK', 'Bilibili',
  'Snapchat', 'Pinterest', 'Tumblr', 'Spotify', 'TED', 'Udemy', 'Coursera', 'Khan Academy',
  'BBC', 'CNN', 'ESPN', 'NBA', 'Archive.org', 'Mediafire', 'Mega.nz', 'Dropbox', 'Google Drive',
  '...and 1800+ more sites!'
];

export default function AppHeader() {
  const pathname = usePathname();
  const [showSites, setShowSites] = useState(false);

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
        <div className="ml-auto flex items-center gap-2">
          <div className="text-xs text-sky-800/80">local‑first • zero‑throttle</div>
          <div className="relative">
            <button
              onMouseEnter={() => setShowSites(true)}
              onMouseLeave={() => setShowSites(false)}
              className="text-xs bg-gradient-to-r from-sky-500 to-blue-600 text-white px-2.5 py-1 rounded-full font-semibold shadow-sm hover:shadow-md transition-all hover:scale-105 cursor-help"
            >
              1800+ Sites
            </button>
            {showSites && (
              <div className="absolute right-0 top-full mt-2 w-80 bg-white rounded-xl shadow-2xl border border-sky-200/60 p-4 z-50 animate-in fade-in slide-in-from-top-2 duration-200">
                <div className="text-xs font-semibold text-sky-900 mb-2 flex items-center gap-2">
                  <span className="text-base">🌐</span>
                  Supported Sites
                </div>
                <div className="flex flex-wrap gap-1.5 max-h-64 overflow-y-auto">
                  {SUPPORTED_SITES.map((site, i) => (
                    <span
                      key={i}
                      className="text-xs bg-sky-50 text-sky-700 px-2 py-0.5 rounded-md border border-sky-200/40"
                    >
                      {site}
                    </span>
                  ))}
                </div>
                <div className="mt-3 pt-3 border-t border-sky-100 text-xs text-sky-600">
                  Powered by <span className="font-semibold">yt-dlp</span>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
