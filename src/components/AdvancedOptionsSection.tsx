import React, { useMemo } from 'react';
import { DownloadCard } from './DownloadCard';
import { Languages, ListOrdered, Download as DownloadIcon, Image, FolderOpen, Link as LinkIcon, Copy } from 'lucide-react';
import { proxyDownload } from '../lib/api';
import { usePolicy } from './AuthProvider';

interface SubtitleItem { lang: string; ext: string; url: string; auto?: boolean; name?: string }
interface ChapterItem { title?: string; start: number; end?: number }
interface ThumbItem { quality: string; resolution: string; url: string; fileSize?: string }

export interface AdvancedOptionsSectionProps {
  videoTitle?: string;
  subtitles?: SubtitleItem[];
  hasSubtitles?: boolean;
  chapters?: ChapterItem[];
  hasChapters?: boolean;
  thumbnails?: ThumbItem[];
  sourceUrl?: string;
}

export const AdvancedOptionsSection: React.FC<AdvancedOptionsSectionProps> = ({
  videoTitle,
  subtitles,
  hasSubtitles,
  chapters,
  hasChapters,
  thumbnails,
  sourceUrl,
}) => {
  const [destination, setDestination] = React.useState('~/Downloads/PremiumMedia');
  // choose one best thumbnail (prefer largest resolution)
  const bestThumb = useMemo(() => {
    const list = thumbnails || [];
    const parseH = (r: string) => {
      const m = /x(\d+)/i.exec(r || '');
      return m ? parseInt(m[1], 10) : 0;
    };
    return [...list].sort((a, b) => parseH(b.resolution) - parseH(a.resolution))[0];
  }, [thumbnails]);
  const policy = usePolicy();
  const subtitlesAllowed = policy.allowSubtitles;
  const chaptersAllowed = policy.allowChapters;
  const metadataAllowed = policy.allowMetadata;
  const subtitlesAvailable = Boolean(hasSubtitles && (subtitles || []).length);
  const chaptersAvailable = Boolean(hasChapters && (chapters || []).length);
  const canDownloadSubtitles = subtitlesAllowed && subtitlesAvailable;
  const canDownloadChapters = chaptersAllowed && chaptersAvailable;
  const canCopySource = metadataAllowed && Boolean(sourceUrl);
  const lockedFeatures: string[] = [];
  if (!subtitlesAllowed) lockedFeatures.push('titlove');
  if (!chaptersAllowed) lockedFeatures.push('poglavlja');
  if (!metadataAllowed) lockedFeatures.push('metapodatke');
  return (
    <DownloadCard title="Advance options" icon={Image} variant="flat">
  <div className="space-y-3">
        <div className="flex items-center justify-between text-xs text-white/60">
          <span>Plan: <span className="font-medium text-white/80">{policy.plan}</span></span>
          {lockedFeatures.length
            ? <span className="text-yellow-300">Premium otključava: {lockedFeatures.join(', ')}</span>
            : <span className="text-emerald-300">Sve napredne opcije dostupne</span>}
        </div>
        {/* Thumbnail row */}
        <div className="flex items-center justify-between p-3 rounded-lg bg-white/5 border border-white/10">
          <div className="flex items-center gap-2">
            <Image className="w-4 h-4 text-yellow-300" />
            <span className="text-sm text-slate-200">Thumbnail</span>
          </div>
          <button
            className={`p-2 rounded-lg border ${bestThumb ? 'border-white/10 bg-white/5 hover:bg-white/10' : 'border-white/10 bg-white/5 opacity-40 cursor-not-allowed'}`}
            disabled={!bestThumb}
            onClick={async () => {
              if (!bestThumb) return;
              try {
                const name = `${(videoTitle || 'thumbnail').replace(/[^\w.-]+/g,'_')}_${bestThumb.quality}.jpg`;
                await proxyDownload({ url: bestThumb.url, filename: name });
              } catch {}
            }}
            title={bestThumb ? 'Download thumbnail' : 'Not available'}
          >
            <DownloadIcon className="w-4 h-4 text-slate-200" />
          </button>
        </div>

        {/* Chapters row (basic SRT export) */}
        <div className="flex items-center justify-between p-3 rounded-lg bg-white/5 border border-white/10">
          <div className="flex items-center gap-2">
            <ListOrdered className="w-4 h-4 text-emerald-300" />
            <span className="text-sm text-slate-200">Chapter download</span>
          </div>
          <button
            className={`p-2 rounded-lg border ${canDownloadChapters ? 'border-white/10 bg-white/5 hover:bg-white/10' : chaptersAllowed ? 'border-white/10 bg-white/5 opacity-40 cursor-not-allowed' : 'border-yellow-500/40 bg-yellow-500/10 text-yellow-100 cursor-not-allowed'}`}
            disabled={!canDownloadChapters}
            onClick={() => {
              if (!canDownloadChapters) return;
              try {
                const fmt = (t: number) => {
                  const h = Math.floor(t/3600).toString().padStart(2,'0');
                  const m = Math.floor((t%3600)/60).toString().padStart(2,'0');
                  const s = Math.floor(t%60).toString().padStart(2,'0');
                  const ms = Math.floor((t - Math.floor(t)) * 1000).toString().padStart(3,'0');
                  return `${h}:${m}:${s},${ms}`;
                };
                const list = chapters || [];
                const srt = list.map((c, i) => {
                  const start = c.start || 0; const end = (c.end ?? (list[i+1]?.start ?? (start+2)));
                  return `${i+1}\n${fmt(start)} --> ${fmt(end)}\n${String(c.title||'').trim()}\n`;
                }).join('\n');
                const blob = new Blob([srt], { type: 'application/x-subrip;charset=utf-8' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a'); a.href = url; a.download = `${(videoTitle || 'chapters').replace(/[^\w.-]+/g,'_')}.srt`; a.click(); URL.revokeObjectURL(url);
              } catch {}
            }}
            title={canDownloadChapters ? 'Download chapters (SRT)' : chaptersAllowed ? 'Nije dostupno' : 'Premium plan otključava poglavlja'}
          >
            <DownloadIcon className="w-4 h-4 text-slate-200" />
          </button>
        </div>
        {!chaptersAllowed && (
          <div className="text-[11px] text-yellow-200">Premium korisnici mogu preuzeti poglavlja i markere.</div>
        )}

        {/* Subtitles row (basic: first track) */}
        <div className="flex items-center justify-between p-3 rounded-lg bg-white/5 border border-white/10">
          <div className="flex items-center gap-2">
            <Languages className="w-4 h-4 text-blue-300" />
            <span className="text-sm text-slate-200">Subtitles</span>
          </div>
          <button
            className={`p-2 rounded-lg border ${canDownloadSubtitles ? 'border-white/10 bg-white/5 hover:bg-white/10' : subtitlesAllowed ? 'border-white/10 bg-white/5 opacity-40 cursor-not-allowed' : 'border-yellow-500/40 bg-yellow-500/10 text-yellow-100 cursor-not-allowed'}`}
            disabled={!canDownloadSubtitles}
            onClick={async () => {
              if (!canDownloadSubtitles) return;
              try {
                const first = (subtitles || []).find((s) => !s.auto) || (subtitles || [])[0];
                if (!first) return;
                const base = (videoTitle || 'sub').replace(/[^\w.-]+/g, '_');
                const fname = `${base}.${first.lang}.${first.ext}`;
                await proxyDownload({ url: first.url, filename: fname });
              } catch {}
            }}
            title={canDownloadSubtitles ? 'Download subtitles' : subtitlesAllowed ? 'Nije dostupno' : 'Premium plan otključava titlove'}
          >
            <DownloadIcon className="w-4 h-4 text-slate-200" />
          </button>
        </div>
        {!subtitlesAllowed && (
          <div className="text-[11px] text-yellow-200">Titlovi su deo Premium paketa.</div>
        )}

        {/* Source URL row (useful: copy to clipboard) */}
        <div className="flex items-center justify-between p-3 rounded-lg bg-white/5 border border-white/10">
          <div className="flex items-center gap-2">
            <LinkIcon className="w-4 h-4 text-slate-300" />
            <span className="text-sm text-slate-200">Source URL</span>
          </div>
          <button
            className={`p-2 rounded-lg border ${canCopySource ? 'border-white/10 bg-white/5 hover:bg-white/10' : metadataAllowed ? 'border-white/10 bg-white/5 opacity-40 cursor-not-allowed' : 'border-yellow-500/40 bg-yellow-500/10 text-yellow-100 cursor-not-allowed'}`}
            disabled={!canCopySource}
            onClick={async () => {
              try { if (sourceUrl) await navigator.clipboard.writeText(sourceUrl); } catch {}
            }}
            title={canCopySource ? 'Copy URL' : metadataAllowed ? 'Nije dostupno' : 'Premium plan otključava metapodatke'}
          >
            <Copy className="w-4 h-4 text-slate-200" />
          </button>
        </div>
        {!metadataAllowed && (
          <div className="text-[11px] text-yellow-200">Metapodaci i dodatni alati zahtevaju Premium nalog.</div>
        )}

        {/* subtle divider before destination */}
        <div className="border-t border-white/10" />

  {/* Download Destination (minimal) at bottom */}
        <div className="flex items-center justify-between p-3 rounded-lg bg-white/5 border border-white/10">
          <div className="flex items-center gap-2">
            <FolderOpen className="w-4 h-4 text-slate-300" />
            <span className="text-sm text-slate-200">Download Destination</span>
          </div>
          <button
            className="px-3 py-1.5 text-xs rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 text-slate-300 max-w-[70%] truncate"
            onClick={() => {
              const next = window.prompt('Download to:', destination || '');
              if (typeof next === 'string') {
                const v = next.trim();
                if (v) setDestination(v);
              }
            }}
            title="Change destination"
          >
            {destination}
          </button>
        </div>
      </div>
    </DownloadCard>
  );
};
