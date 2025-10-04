import React, { useRef, useState } from 'react';
import { DownloadCard } from './DownloadCard';
import { Image, Sparkles, Crown, Eye, Download as DownloadIcon } from 'lucide-react';
import { proxyDownload, ProxyDownloadError } from '../lib/api';
import { useToast } from './ToastProvider';

export interface ThumbnailSectionProps {
  analysisData?: {
    sourceUrl?: string;
    videoTitle: string;
    duration: string;
    thumbnails: Array<{
      quality: string;
      resolution: string;
      url: string;
      fileSize: string;
      timestamp?: string;
  badge: 'popular' | 'fast' | 'hd';
    }>;
    originalResolution: string;
    hasMultipleThumbnails: boolean;
  };
  onThumbnailSelect?: (thumbnailIndex: number, thumbnailData: any) => void;
}

export const ThumbnailSection: React.FC<ThumbnailSectionProps> = ({ analysisData, onThumbnailSelect }) => {
  const [selectedThumbnail, setSelectedThumbnail] = useState(0);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [thumbPct, setThumbPct] = useState<number | undefined>(undefined);
  const [thumbSpeed, setThumbSpeed] = useState<string>('');
  const [thumbEta, setThumbEta] = useState<string>('');
  const [downloading, setDownloading] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const { success, error: toastError } = useToast();

  if (analysisData) {
    const thumbnails = analysisData.thumbnails?.map((thumb) => ({
      quality: thumb.quality,
      size: thumb.resolution,
      url: thumb.url,
      fileSize: thumb.fileSize,
      timestamp: thumb.timestamp,
      badge: thumb.badge.toUpperCase(),
    })) || [];

    const getBadgeColor = (badge: string) => {
      switch (badge.toLowerCase()) {
        case 'popular':
          return 'bg-gradient-to-r from-yellow-500 to-orange-500 text-white';
        case 'popular2':
          return 'bg-gradient-to-r from-green-500 to-emerald-500 text-white';
        case 'fast':
          return 'bg-gradient-to-r from-blue-500 to-cyan-500 text-white';
        case 'hd':
          return 'bg-gradient-to-r from-purple-500 to-pink-500 text-white';
        default:
          return 'bg-gradient-to-r from-slate-500 to-slate-600 text-white';
      }
    };

    const handleThumbnailSelect = (index: number) => {
      setSelectedThumbnail(index);
      onThumbnailSelect?.(index, thumbnails[index]);
    };

    return (
      <DownloadCard title="Thumbnail Gallery" icon={Image} variant="flat">
        <div className="space-y-4">
          {/* Real Video Info */}
          <div className="relative overflow-hidden rounded-xl bg-white/5 p-4 border border-white/10">
            <div className="flex items-center gap-2 mb-2">
              <Sparkles className="w-4 h-4 text-yellow-400" />
              <span className="text-xs font-semibold text-blue-300 uppercase tracking-wide">Extracted Thumbnails</span>
            </div>
            <div className="text-sm text-slate-300 mb-1 font-medium">{analysisData.videoTitle}</div>
            <div className="flex items-center gap-4 text-xs text-slate-400">
              <span>Duration: {analysisData.duration}</span>
              <span>Original: {analysisData.originalResolution}</span>
              <span>Available: {thumbnails.length} thumbnails</span>
            </div>
          </div>

          <div className="relative">
            <div
              ref={scrollRef}
              className="max-h-[336px] overflow-y-auto pr-1 nice-scroll grid grid-cols-1 gap-3"
            >
              {thumbnails.map((thumb, index) => (
                <div
                  key={thumb.url || `${thumb.quality}-${thumb.size}`}
                  className={`relative rounded-lg overflow-hidden border transition-all duration-300 cursor-pointer transform hover:scale-[1.02] hover:shadow-lg ${selectedThumbnail === index ? 'border-blue-500 shadow-lg shadow-blue-500/25' : 'border-white/10 hover:border-white/20'}`}
                  onClick={() => handleThumbnailSelect(index)}
                >
                  {/* Inline badge near center */}

                  {/* Timestamp badge if available */}
                  {thumb.timestamp && (
                    <div className="absolute top-2 left-2 z-10">
                      <span className="px-2 py-1 text-xs font-medium rounded-full bg-black/60 text-white">{thumb.timestamp}</span>
                    </div>
                  )}

                  <div className="flex items-center gap-3 p-3 bg-white/5 backdrop-blur-sm min-h-[78px]">
                    <div className="relative group">
                      <img
                        src={thumb.url}
                        alt={`Thumbnail ${thumb.quality}`}
                        className="w-20 h-12 rounded object-cover transition-transform duration-300 group-hover:scale-105"
                        onError={(e) => {
                          const target = e.target as HTMLImageElement;
                          target.src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iODAiIGhlaWdodD0iNDgiIHZpZXdCb3g9IjAgMCA4MCA0OCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHJlY3Qgd2lkdGg9IjgwIiBoZWlnaHQ9IjQ4IiBmaWxsPSIjMzMzIiByeD0iNCIvPgo8cGF0aCBkPSJNMzYgMTZIMzJWMjBIMzZWMTZaIiBmaWxsPSIjNjY2Ii8+CjxwYXRoIGQ9Ik00OCAyMEgyOFYzMkg0OFYyMFoiIGZpbGw9IiM2NjYiLz4KPC9zdmc+';
                        }}
                      />
                      <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity duration-300 rounded flex items-center justify-center">
                        <Eye className="w-4 h-4 text-white" />
                      </div>
                    </div>
                    <div className="flex-1">
                      <div className="text-[14px] font-semibold text-slate-100 flex items-center gap-2 flex-wrap">
                        {thumb.quality}
                        <span className={`px-1.5 py-0.5 text-[10px] font-bold rounded-full ${getBadgeColor(thumb.badge)}`}>{thumb.badge}</span>
                      </div>
                      <div className="text-[12px] text-slate-300">{thumb.size} • {thumb.fileSize || 'Size pending'}</div>
                    </div>
                    <div className="w-4 h-4 rounded-full border-2 border-slate-500 flex items-center justify-center">
                      {selectedThumbnail === index && <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse"></div>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Download Button */}
          <button
            className="w-full py-3 px-4 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 text-white font-medium rounded-lg transition-all duration-300 transform hover:scale-[1.02] active:scale-[0.98] shadow-lg hover:shadow-xl relative overflow-hidden group"
            disabled={downloading}
            onClick={async () => {
              const chosen = thumbnails[selectedThumbnail];
              if (chosen?.url) {
                const base = (analysisData.videoTitle || 'thumbnail').replace(/[^\w.-]+/g, '_') || 'thumbnail';
                const name = `${base}_${chosen.quality}.jpg`;
                setDownloading(true); setThumbPct(undefined); setThumbSpeed(''); setThumbEta('');
                abortRef.current?.abort();
                abortRef.current = new AbortController();
                try {
                  await proxyDownload({ url: chosen.url, filename: name, onProgress: (p) => {
                    setThumbPct(p.pct); setThumbSpeed(p.speed || ''); setThumbEta(p.eta || '');
                  }, signal: abortRef.current.signal });
                  success('Saving file…', 'Saving file');
                } catch (err: any) {
                  if (err?.name !== 'AbortError') {
                    const msg = err instanceof ProxyDownloadError ? err.message : 'Thumbnail download failed.';
                    toastError(msg);
                  }
                } finally {
                  setDownloading(false); setTimeout(() => { setThumbPct(undefined); setThumbSpeed(''); setThumbEta(''); }, 1000);
                }
              } else {
                alert('Thumbnail URL not available.');
              }
            }}
          >
            <div className="absolute inset-0 bg-white/20 transform -skew-x-12 -translate-x-full group-hover:translate-x-full transition-transform duration-700 pointer-events-none"></div>
            <DownloadIcon className="w-4 h-4 inline mr-2" />
            {downloading ? 'Preparing…' : `Download ${thumbnails[selectedThumbnail]?.quality || 'Selected'}`}
          </button>

          {typeof thumbPct === 'number' && (
            <div className="mt-2 p-2 rounded-lg border border-blue-500/40 bg-blue-500/10">
              <div className="flex items-center justify-between text-blue-200 text-xs mb-1">
                <span>Downloading… {thumbSpeed && <span className="text-white/70">{thumbSpeed}</span>} {thumbEta && <span className="text-white/60">ETA {thumbEta}</span>}</span>
                <div className="flex items-center gap-2">
                  <span>{Math.round(thumbPct)}%</span>
                  <button className="px-2 py-0.5 text-[10px] rounded border border-red-500/40 bg-red-500/10 text-red-200 hover:bg-red-500/20"
                          onClick={() => { abortRef.current?.abort(); setDownloading(false); setTimeout(() => { setThumbPct(undefined); setThumbSpeed(''); setThumbEta(''); }, 200); }}>✕</button>
                </div>
              </div>
              <div className="w-full h-3 rounded bg-white/10 overflow-hidden">
                <div className="h-3 bg-gradient-to-r from-blue-500 to-purple-500" style={{ width: `${Math.max(0, Math.min(100, thumbPct))}%` }} />
              </div>
            </div>
          )}

          {/* Multiple thumbnails info */}
          {analysisData.hasMultipleThumbnails && (
            <div className="text-center p-2 rounded-lg bg-white/5 border border-white/10">
              <p className="text-xs text-slate-400">💡 Multiple thumbnail timestamps available from video analysis</p>
            </div>
          )}
        </div>
      </DownloadCard>
    );
  }

  // Phase 1 default (simplified per request)
  return (
    <DownloadCard title="Thumbnail Extraction" icon={Image} variant="flat">
      <div className="space-y-4">
        {/* Hero Banner */}
        <div className="relative overflow-hidden rounded-xl bg-white/5 p-6 border border-white/10">
          <div className="absolute top-2 right-2">
            <Crown className="w-5 h-5 text-yellow-400 animate-pulse" />
          </div>
          <div className="text-center">
            <Sparkles className="w-8 h-8 text-yellow-400 mx-auto mb-2 attention-icon icon-glow glow-amber" />
            <h3 className="text-lg font-bold text-white mb-2">Ultra HD Thumbnails</h3>
            <p className="text-sm text-blue-200">Extract perfect thumbnails in any resolution</p>
          </div>
        </div>

        {/* Keep only two top tiles */}
        <div className="grid grid-cols-2 gap-2">
          <div className="text-center p-3 rounded-lg bg-white/5 border border-white/10">
            <div className="text-xl font-extrabold text-amber-300">4K</div>
            <div className="text-[11px] text-amber-200">Ultra HD</div>
          </div>
          <div className="text-center p-3 rounded-lg bg-white/5 border border-white/10">
            <div className="text-sm font-bold text-teal-200">All Formats</div>
            <div className="text-[11px] text-teal-200/80">JPG • PNG • WEBP</div>
          </div>
        </div>

        {/* Features (3 items) */}
        <div className="p-3 rounded-lg bg-white/5 border border-white/10">
          <div className="space-y-2 text-xs text-slate-300">
            <div className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-blue-500"/><span>Pixel‑perfect extraction</span></div>
            <div className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-purple-500"/><span>Multiple timestamps support</span></div>
            <div className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-emerald-500"/><span>Lossless originals when available</span></div>
          </div>
        </div>

        {/* CTA */}
        <div className="text-center p-4 rounded-lg bg-white/5 border border-white/10">
          <p className="text-xs text-slate-400 mb-2">Ready to extract thumbnails</p>
          <div className="text-sm font-medium text-blue-300">Paste URL above to start</div>
        </div>
      </div>
    </DownloadCard>
  );
};