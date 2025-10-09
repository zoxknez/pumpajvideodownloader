import React from 'react';
import { Video, Play, Zap } from 'lucide-react';

import { DownloadCard } from './DownloadCard';
import { VideoFormatList } from './VideoFormatList';
import { JobProgressPanel, DownloadReadyPanel, JobErrorPanel, CompletedFileBanner } from './VideoSectionPanels';
import { useVideoFormats } from './hooks/useVideoFormats';
import { useDownloadJob } from './hooks/useDownloadJob';
import type { VideoSectionProps } from './types';
import { useToast } from '@/components/ToastProvider';
import { revealPath, openPath } from '@/lib/downloader';

export const VideoSection: React.FC<VideoSectionProps> = ({ analysisData, onFormatSelect, onDownloadStart }) => {
  const toast = useToast();
  const { displayFormats, selectedFormat, selectFormat } = useVideoFormats({ analysisData });
  const {
    jobId,
    readyJobId,
    jobProgress,
    jobStage,
    jobSpeed,
    jobEta,
    jobStatus,
    jobError,
    downloadReady,
    isSaving,
    completedPath,
    startBestDownload,
    startPresetDownload,
    saveReadyFile,
    openInNewTab,
    dismissReady,
    cancelActiveJob,
    clearError,
    clearCompletedPath,
    resetForSelectionChange,
  } = useDownloadJob({
    analysisData,
    selectedFormat,
    onDownloadStart,
    toast: { info: toast.info, error: toast.error },
  });

  const handleSelectFormat = (displayIndex: number) => {
    resetForSelectionChange();
    const result = selectFormat(displayIndex);
    if (result) {
      onFormatSelect?.(result.sourceIndex, result.raw);
    }
  };

  const handleRevealPath = () => {
    if (completedPath) revealPath(completedPath);
  };

  const handleOpenPath = () => {
    if (completedPath) openPath(completedPath);
  };

  if (analysisData) {
    return (
      <DownloadCard title="Video Formats" icon={Video} variant="flat">
        <div className="space-y-4">
          <VideoFormatList formats={displayFormats} selectedSourceIndex={selectedFormat} onSelect={handleSelectFormat} />

          {!jobId && (
            <div className="w-full pt-1">
              <button
                onClick={startBestDownload}
                className="w-full rounded-xl border border-white/10 bg-gradient-to-r from-blue-600 to-purple-600 px-4 py-2.5 text-white transition hover:scale-[1.01] hover:shadow-lg hover:shadow-blue-500/20"
              >
                Download
              </button>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <button
                  onClick={() => startPresetDownload('mp4')}
                  className="rounded-lg border border-white/10 bg-white/10 px-3 py-2 text-xs text-white transition hover:bg-white/20"
                >
                  Best MP4
                </button>
                <button
                  onClick={() => startPresetDownload('webm')}
                  className="rounded-lg border border-white/10 bg-white/10 px-3 py-2 text-xs text-white transition hover:bg-white/20"
                >
                  Best WEBM
                </button>
              </div>
            </div>
          )}

          <JobProgressPanel
            jobId={jobId}
            jobStatus={jobStatus}
            jobProgress={jobProgress}
            jobStage={jobStage}
            jobSpeed={jobSpeed}
            jobEta={jobEta}
            onCancel={cancelActiveJob}
          />

          <DownloadReadyPanel
            readyJobId={readyJobId}
            downloadReady={downloadReady}
            isSaving={isSaving}
            onSave={saveReadyFile}
            onOpenInTab={openInNewTab}
            onDismiss={dismissReady}
          />

          <JobErrorPanel jobError={jobError} onDismiss={clearError} onRetry={startBestDownload} />

          <CompletedFileBanner
            completedPath={completedPath}
            onReveal={handleRevealPath}
            onOpen={handleOpenPath}
            onHide={clearCompletedPath}
          />
        </div>
      </DownloadCard>
    );
  }

  return (
    <DownloadCard title="Video Downloads" icon={Video} variant="flat">
      <div className="space-y-4">
        <div className="relative overflow-hidden rounded-xl border border-white/10 bg-white/5 p-6">
          <div className="absolute right-2 top-2">
            <Zap className="h-5 w-5 text-yellow-400 animate-pulse" />
          </div>
          <div className="text-center">
            <Play className="attention-icon icon-glow glow-emerald mx-auto mb-2 h-8 w-8 text-emerald-300" />
            <h3 className="mb-2 text-lg font-bold text-white">Quality Options</h3>
            <p className="text-sm text-emerald-200">Download videos in any format &amp; quality</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-lg border border-white/10 bg-white/5 p-3 text-center">
            <div className="text-xl font-extrabold text-emerald-300">4K</div>
            <div className="text-[11px] text-emerald-200">Ultra HD</div>
          </div>
          <div className="rounded-lg border border-white/10 bg-white/5 p-3 text-center">
            <div className="text-sm font-bold text-cyan-200">All Formats</div>
            <div className="text-[11px] text-cyan-200/80">MP4 • WEBM • MKV</div>
          </div>
        </div>

        <div className="rounded-lg border border-white/10 bg-white/5 p-3">
          <div className="space-y-2 text-xs text-slate-300">
            <div className="flex items-center gap-2">
              <div className="h-2 w-2 rounded-full bg-green-500" />
              <span>Up to 8K resolution support</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="h-2 w-2 rounded-full bg-blue-500" />
              <span>60fps smooth playback</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="h-2 w-2 rounded-full bg-purple-500" />
              <span>HDR &amp; Dolby Vision ready</span>
            </div>
          </div>
        </div>

        <div className="rounded-lg border border-white/10 bg-white/5 p-4 text-center">
          <p className="mb-2 text-xs text-slate-400">Video download ready</p>
          <div className="text-sm font-medium text-green-300">Analyze URL to see options</div>
        </div>
      </div>
    </DownloadCard>
  );
};