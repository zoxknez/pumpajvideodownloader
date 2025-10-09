import React from 'react';
import { Video, Play, Loader2, CheckCircle, XCircle } from 'lucide-react';
import { DownloadCard } from './DownloadCard';
import { VideoFormatList } from './VideoFormatList';
import { useVideoFormats } from './hooks/useVideoFormats';
import { useSimpleDownload } from './hooks/useSimpleDownload';
import type { VideoSectionProps } from './types';
import { useToast } from '@/components/ToastProvider';

export const VideoSection: React.FC<VideoSectionProps> = ({ analysisData, onFormatSelect, onDownloadStart }) => {
  const toast = useToast();
  const { displayFormats, selectedFormat, selectFormat } = useVideoFormats({ analysisData });
  const { status, progress, stage, speed, eta, isActive, startDownload, reset } = useSimpleDownload({
    analysisData,
    toast: { info: toast.info, error: toast.error },
  });

  const handleSelectFormat = (displayIndex: number) => {
    reset();
    const result = selectFormat(displayIndex);
    if (result) {
      onFormatSelect?.(result.sourceIndex, result.raw);
    }
  };

  const handleDownload = () => {
    onDownloadStart?.();
    startDownload();
  };

  const formatStage = (stage: string) => stage.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());

  if (!analysisData) {
    return (
      <DownloadCard title="Video Downloads" icon={Video} variant="flat">
        <div className="space-y-4">
          <div className="relative overflow-hidden rounded-xl border border-white/10 bg-white/5 p-6">
            <div className="absolute right-2 top-2">
              <Play className="h-5 w-5 text-yellow-400 animate-pulse" />
            </div>
            <div className="text-center">
              <Play className="mx-auto mb-2 h-8 w-8 text-emerald-300" />
              <h3 className="mb-2 text-lg font-bold text-white">Quality Options</h3>
              <p className="text-sm text-emerald-200">Download videos in any format &amp; quality</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-lg border border-white/10 bg-white/5 p-3 text-center">
              <div className="text-2xl font-bold text-blue-400">8K</div>
              <div className="text-xs text-slate-400">Max Quality</div>
            </div>
            <div className="rounded-lg border border-white/10 bg-white/5 p-3 text-center">
              <div className="text-2xl font-bold text-purple-400">Fast</div>
              <div className="text-xs text-slate-400">Smart Merge</div>
            </div>
          </div>
        </div>
      </DownloadCard>
    );
  }

  return (
    <DownloadCard title="Video Formats" icon={Video} variant="flat">
      <div className="space-y-4">
        {/* Format Selection */}
        <VideoFormatList 
          formats={displayFormats} 
          selectedSourceIndex={selectedFormat} 
          onSelect={handleSelectFormat} 
        />

        {/* Download Button / Progress */}
        {!isActive ? (
          <div className="w-full pt-1">
            <button
              onClick={handleDownload}
              className="w-full rounded-xl border border-white/10 bg-gradient-to-r from-emerald-600 to-green-600 px-4 py-3 text-white font-medium transition hover:scale-[1.02] hover:shadow-lg hover:shadow-emerald-500/30 flex items-center justify-center gap-2"
            >
              <Play className="w-5 h-5" />
              Open in New Tab
            </button>
            <p className="text-xs text-center text-slate-400 mt-2">
              Video will open in browser - watch or right-click "Save as..."
            </p>
          </div>
        ) : (
          <div className="w-full rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-4 space-y-3">
            {/* Status Header */}
            <div className="flex items-center justify-between text-sm font-medium text-emerald-100">
              <span className="flex items-center gap-2">
                {status === 'completed' ? (
                  <CheckCircle className="w-4 h-4 text-emerald-400" />
                ) : status === 'failed' ? (
                  <XCircle className="w-4 h-4 text-red-400" />
                ) : (
                  <Loader2 className="w-4 h-4 animate-spin" />
                )}
                {formatStage(stage || 'Processing')}
              </span>
              <span>{Math.round(progress)}%</span>
            </div>

            {/* Progress Bar */}
            <div className="h-3 w-full overflow-hidden rounded bg-white/10">
              <div
                className="h-3 bg-gradient-to-r from-emerald-500 to-green-500 transition-all duration-300"
                style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
              />
            </div>

            {/* Speed & ETA */}
            {(speed || eta) && (
              <div className="flex items-center justify-between text-xs text-emerald-100/90">
                {speed && (
                  <div>
                    Speed: <span className="font-semibold text-emerald-50">{speed}</span>
                  </div>
                )}
                {eta && (
                  <div>
                    ETA: <span className="font-semibold text-emerald-50">{eta}</span>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </DownloadCard>
  );
};
