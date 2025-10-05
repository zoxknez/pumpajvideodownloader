'use client';

import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { API_BASE } from '@/lib/api';


const panel =
  'rounded-2xl border border-white/10 bg-white/[0.06] backdrop-blur-xl shadow-[0_12px_40px_rgba(2,6,23,0.35)]';
const subpanel = 'rounded-xl border border-white/10 bg-white/[0.05]';
const chip = 'inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-white/10 bg-white/[0.06] text-xs text-white/85';

type Tab = 'download' | 'queue' | 'batch' | 'history' | 'settings';

type DownloaderHomeProps = {
  onAnalyze?: (url: string) => void;
  initialTab?: Tab;
  onTabChange?: (tab: Tab) => void;
};

export type DownloaderHomeTab = Tab;

export default function DownloaderHome({ onAnalyze, initialTab = 'download', onTabChange }: DownloaderHomeProps) {
  const [tab, setTab] = useState<Tab>(initialTab);
  const [url, setUrl] = useState('');
  const disabled = !url.trim();

  useEffect(() => {
    setTab(initialTab);
  }, [initialTab]);

  const handleTabClick = useCallback(
    (next: Tab) => {
      setTab(next);
      onTabChange?.(next);
    },
    [onTabChange],
  );

  const runAnalyze = useCallback(async () => {
    const trimmed = url.trim();
    if (!trimmed) return;
    if (!onAnalyze) {
      try {
        const response = await fetch(`${API_BASE}/api/analyze?url=${encodeURIComponent(trimmed)}`);
        if (!response.ok) {
          alert('Analyze failed');
        } else {
          alert('Analyze ok – poveži onAnalyze da prikažeš rezultate.');
        }
      } catch (error) {
        console.error(error);
        alert('Analyze failed');
      }
    } else {
      onAnalyze(trimmed);
    }
  }, [onAnalyze, url]);

  return (
    <div className="space-y-4 text-white">
      {/* Top bar */}
      <div className={`${panel} p-4`}>
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <img src="/pumpaj-192.png?v=3" alt="Pumpaj" className="h-12 w-12 rounded-xl" />
            <h1 className="text-2xl md:text-3xl font-black tracking-tight">
              Pumpaj <span className="text-white/90">Media Downloader</span> <span className="text-base">✨</span>
            </h1>
          </div>
          <div className="hidden lg:flex items-center gap-2">
            <span className={chip}>
              Author: <b>a0o0o0o</b>
            </span>
            <a className={`${chip} hover:bg-white/[0.12]`} href="https://paypal.me/zoxknez" target="_blank" rel="noreferrer">
              💛 Donate
            </a>
            <span className={chip}>
              Server: <span className="text-emerald-300">Online</span>
            </span>
            <span className={chip}>Queue: 0 / max 2</span>
            <span className={chip}>Net: proxy off</span>
          </div>
        </div>

        {/* Tabs */}
        <div className="mt-4 flex flex-wrap gap-2">
          {([
            ['download', '💬', 'Download'],
            ['queue', '⏳', 'Queue'],
            ['batch', '⚙️', 'Batch'],
            ['history', '🕓', 'History'],
            ['settings', '⚙', 'Settings'],
          ] as [Tab, string, string][]).map(([key, icon, label]) => {
            const active = tab === key;
            return (
              <button
                key={key}
                onClick={() => handleTabClick(key)}
                className={`px-4 py-2 rounded-xl text-sm font-semibold transition border ${
                  active ? 'bg-white/[0.14] border-white/20 shadow' : 'bg-white/[0.06] border-white/10 hover:bg-white/[0.1]'
                }`}
              >
                <span className="mr-2">{icon}</span>
                {label}
              </button>
            );
          })}
        </div>
      </div>

      {/* URL bar */}
      <div className={`${panel} p-3`}>
        <div className="flex items-center gap-3">
          <div className="flex-1 relative">
            <input
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !disabled) runAnalyze();
              }}
              placeholder="Paste video/playlist URL here…"
              className="w-full rounded-xl border border-white/12 bg-white/[0.05] px-5 py-4 text-white placeholder-white/60 outline-none focus:border-blue-400/60 focus:ring-2 focus:ring-blue-500/20"
            />
            <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-2 text-white/40">
              <span>📅</span>
              <span>⏸</span>
            </div>
          </div>
          <button
            onClick={runAnalyze}
            disabled={disabled}
            className={`rounded-xl px-6 py-3 font-semibold text-white transition ${
              disabled
                ? 'bg-slate-600 cursor-not-allowed'
                : 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500'
            }`}
          >
            🔎 Analyze
          </button>
        </div>
      </div>

      {/* Cards grid – prikaz kao na desktop maketi */}
      {tab === 'download' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <FeatureCard title="Thumbnail Extraction" badge="🖼️" crown>
            <BigLine>Ultra HD Thumbnails</BigLine>
            <Mini>Extract perfect thumbnails in any resolution</Mini>
            <Badges items={['4K · Ultra HD', 'All Formats · JPG/PNG/WEBP']} />
            <Bullets items={['Pixel-perfect extraction', 'Multiple timestamps', 'Lossless originals when available']} />
            <Footer text="Ready to extract thumbnails – paste URL above" />
          </FeatureCard>

          <FeatureCard title="Video Downloads" badge="🎬">
            <BigLine>Quality Options</BigLine>
            <Mini>Download videos in any format & quality</Mini>
            <Badges items={['4K · Ultra HD', 'All Formats · MP4/WEBM/MKV']} />
            <Bullets items={['Up to 8K support', '60fps smooth playback', 'HDR & Dolby Vision ready']} />
            <Footer text="Analyze URL to see options" />
          </FeatureCard>

          <FeatureCard title="Audio Extraction" badge="🎧" dot>
            <BigLine>Studio Quality</BigLine>
            <Mini>Extract audio in lossless quality</Mini>
            <Badges items={['Lossless · FLAC/ALAC', 'All Formats · MP3/AAC/OPUS']} />
            <Bullets items={['Studio-grade extraction', 'Multi-format support', 'Metadata preservation']} />
            <Footer text="Start with URL analysis" />
          </FeatureCard>

          <FeatureCard title="Download Settings" badge="🛠️" crown>
            <BigLine>Pro Features</BigLine>
            <Mini>Advanced options for power users</Mini>
            <StatusPills />
            <Bullets items={['Secure by default (Helmet, CORS, limits)', 'Live progress via SSE', 'Smart defaults for speed']} />
            <Footer text="Options will adapt after analysis" />
          </FeatureCard>
        </div>
      )}

      {tab !== 'download' && (
        <div className={`${panel} p-6 text-white/80 text-sm`}>
          <div className="text-white font-semibold mb-2">Coming soon</div>
          Elegantan placeholder za: <b>{tab}</b> (povezaćemo na tvoje postojeće panele).
        </div>
      )}
    </div>
  );
}

/* ---------- sitni pomoćni delovi ---------- */

function FeatureCard({ title, badge, children, crown, dot }: { title: string; badge: string; children: ReactNode; crown?: boolean; dot?: boolean }) {
  return (
    <div className={`${panel} p-4`}>
      <div className="flex items-center justify-between">
        <div className={`${chip} uppercase tracking-wider`}>
          {badge} {title}
        </div>
        <div className="text-yellow-300/80">{crown ? '👑' : dot ? '🟡' : null}</div>
      </div>
      <div className={`${subpanel} mt-3 p-4 min-h-[220px]`}>{children}</div>
    </div>
  );
}

function BigLine({ children }: { children: ReactNode }) {
  return <div className="text-lg font-extrabold text-white mb-1">{children}</div>;
}

function Mini({ children }: { children: ReactNode }) {
  return <div className="text-sm text-white/80">{children}</div>;
}

function Bullets({ items }: { items: string[] }) {
  return (
    <ul className="mt-3 space-y-1.5 text-sm text-white/85">
      {items.map((text) => (
        <li key={text} className="flex items-start gap-2">
          <span className="mt-0.5">•</span>
          <span>{text}</span>
        </li>
      ))}
    </ul>
  );
}

function Badges({ items }: { items: string[] }) {
  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {items.map((text) => (
        <span key={text} className="px-2.5 py-1 rounded-lg bg-white/[0.07] border border-white/12 text-xs">
          {text}
        </span>
      ))}
    </div>
  );
}

function Footer({ text }: { text: string }) {
  return (
    <div className="mt-4 text-xs text-white/60 border-t border-white/10 pt-3">{text}</div>
  );
}

function StatusPills() {
  return (
    <div className="mt-3 grid grid-cols-3 gap-2">
      <span className="px-2.5 py-1 rounded-lg bg-emerald-500/15 text-emerald-200 text-xs text-center">Online</span>
      <span className="px-2.5 py-1 rounded-lg bg-sky-500/15 text-sky-200 text-xs text-center">Ready</span>
      <span className="px-2.5 py-1 rounded-lg bg-violet-500/15 text-violet-200 text-xs text-center">Secure</span>
    </div>
  );
}
