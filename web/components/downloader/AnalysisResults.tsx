import React, { useMemo } from 'react';
import { AudioSection } from './AudioSection';
import { VideoSection } from './VideoSection';
import { AdvancedOptionsSection } from './AdvancedOptionsSection';
import { ArrowLeft, BarChart3 } from '@/lib/icons';
import { mapToAudioAnalysis, mapToThumbnails, mapToVideoAnalysis, formatDuration } from '@/lib/api-desktop';

interface AnalysisResultsProps {
  onBack: () => void;
  analyzedUrl: string;
  json?: any; // optional real yt-dlp json
}

export const AnalysisResults: React.FC<AnalysisResultsProps> = ({ onBack, analyzedUrl, json }) => {
  // No tabs: render all four sections like GUI 1 (pre-analysis) style
  // Prepare mapped data from real yt-dlp json when provided
  const videoMapped = useMemo(() => (json ? mapToVideoAnalysis(json) : null), [json]);
  const audioMapped = useMemo(() => (json ? mapToAudioAnalysis(json) : null), [json]);
  const thumbsMapped = useMemo(() => (json ? mapToThumbnails(json) : null), [json]);
  const subsInfo = useMemo(() => {
    if (!json) return { hasSubtitles: false, items: [] as any[] };
    const base: any = (json as any).entries?.[0] || json;
    const items = (base?.subtitles || base?.automatic_captions) || {};
    const all: any[] = [];
    Object.keys(items).forEach(lang => {
      const arr = items[lang] || [];
      arr.forEach((x: any) => all.push({ lang, ext: x.ext || 'vtt', url: x.url, auto: base?.subtitles ? false : true }));
    });
    return { hasSubtitles: all.length > 0, items: all };
  }, [json]);
  const chaptersInfo = useMemo(() => {
    if (!json) return { hasChapters: false, items: [] as any[] };
    const base: any = (json as any).entries?.[0] || json;
    const arr = base?.chapters || [];
    return { hasChapters: Array.isArray(arr) && arr.length > 0, items: arr };
  }, [json]);

  // Basic preview info
  const baseInfo = useMemo(() => {
    if (!json) {
      return {
        title: 'Analysis',
        thumbnail: 'https://via.placeholder.com/1280x720/1f2937/94a3b8?text=No+Preview',
        duration: '',
        uploader: '',
        views: '',
      };
    }
    const entries = (json as any).entries || [];
    const base = entries[0] || (json as any);
    const durationSec = base?.duration;
    const duration = typeof durationSec === 'number' ? formatDuration(durationSec) : base?.duration || '';
    const thumb = base?.thumbnail || (base?.thumbnails?.[base?.thumbnails?.length - 1]?.url);
    return {
      title: base?.title || 'Media',
      thumbnail: thumb || 'https://via.placeholder.com/1280x720/1f2937/94a3b8?text=Preview',
      duration,
      uploader: base?.uploader || base?.channel || '',
      views: base?.view_count ? `${base.view_count.toLocaleString()} views` : '',
    };
  }, [json]);

  // No tab metadata needed

  return (
    <div className="w-full">
        {/* Compact Header - aligned with content grid, centered info */}
        <div className="mb-4 max-w-[1400px] mx-auto">
          <div className="grid grid-cols-[auto_1fr_auto] items-center gap-4">
            <div className="-mt-1 md:-mt-2">
              <button
                onClick={onBack}
                className="flex items-center gap-2 px-4 py-2 bg-white/10 backdrop-blur-md rounded-xl text-white hover:bg-white/20 transition-all duration-300 border border-white/20 hover:scale-105 hover:shadow-lg hover:shadow-purple-500/25"
              >
                <ArrowLeft className="w-5 h-5" />
                Back to Input
              </button>
            </div>
            <div className="min-w-0 text-center">
              <div className="text-lg font-semibold text-white truncate" title={baseInfo.title}>{baseInfo.title || 'Analysis Results'}</div>
              <div className="text-[12px] text-slate-300 flex items-center justify-center gap-2 flex-wrap">
                {baseInfo.uploader && <span className="truncate max-w-[40ch]">{baseInfo.uploader}</span>}
                {baseInfo.uploader && (baseInfo.views || baseInfo.duration) && <span className="opacity-50">•</span>}
                {baseInfo.views && <span>{baseInfo.views}</span>}
                {baseInfo.views && baseInfo.duration && <span className="opacity-50">•</span>}
                {baseInfo.duration && <span>{baseInfo.duration}</span>}
              </div>
            </div>
            <div className="justify-self-end -mt-1 md:-mt-2">
              <div className="flex items-center gap-2 px-4 py-2 bg-green-500/20 backdrop-blur-md rounded-xl border border-green-400/30 glow-pulse animate-fade-in-up">
                <BarChart3 className="w-5 h-5 text-green-400 attention-icon icon-glow glow-green" />
                <span className="text-green-300 font-medium">Analysis Complete</span>
              </div>
            </div>
          </div>
        </div>

  {/* Three side-by-side sections: Video, Audio, Advance options */}
  <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6 max-w-[1400px] mx-auto">
          <div className="animate-fade-in-up" style={{ animationDelay: '40ms' }}>
            <VideoSection analysisData={videoMapped ? { ...videoMapped, sourceUrl: analyzedUrl, hasThumbnails: Boolean((thumbsMapped?.thumbnails || []).length) } : undefined} />
          </div>
          <div className="animate-fade-in-up" style={{ animationDelay: '120ms' }}>
            <AudioSection analysisData={audioMapped ? { ...audioMapped, sourceUrl: analyzedUrl } : undefined} />
          </div>
      <div className="animate-fade-in-up" style={{ animationDelay: '200ms' }}>
            <AdvancedOptionsSection
            videoTitle={(videoMapped as any)?.videoTitle || (thumbsMapped as any)?.videoTitle}
            subtitles={subsInfo.items as any}
            hasSubtitles={subsInfo.hasSubtitles}
            chapters={chaptersInfo.items as any}
            hasChapters={chaptersInfo.hasChapters}
        thumbnails={thumbsMapped?.thumbnails || []}
        sourceUrl={analyzedUrl}
            />
          </div>
  </div>
    </div>
  );
};

// duration formatting now imported from lib/api
