import React from 'react';

import type { JobStatus } from './types';
import { formatStageLabel } from './hooks/useDownloadJob';

export type JobProgressPanelProps = {
  jobId: string | null;
  jobStatus: JobStatus;
  jobProgress: number;
  jobStage: string;
  jobSpeed: string | null;
  jobEta: string | null;
  onCancel: () => void;
};

export const JobProgressPanel: React.FC<JobProgressPanelProps> = ({
  jobId,
  jobStatus,
  jobProgress,
  jobStage,
  jobSpeed,
  jobEta,
  onCancel,
}) => {
  if (!jobId || jobStatus !== 'running') return null;
  const stageLabel = formatStageLabel(jobStage);

  return (
    <div className="w-full rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-4 space-y-3">
      <div className="flex items-center justify-between text-sm font-medium text-emerald-100">
        <span className="capitalize">{stageLabel}…</span>
        <span>{Math.round(jobProgress)}%</span>
      </div>
      <div className="h-3 w-full overflow-hidden rounded bg-white/10">
        <div
          className="h-3 bg-gradient-to-r from-emerald-500 to-green-500 transition-all"
          style={{ width: `${Math.min(100, Math.max(0, jobProgress))}%` }}
        />
      </div>
      <div className="flex items-start justify-between text-xs text-emerald-100/90">
        <div className="space-y-1">
          {jobSpeed ? (
            <div>
              Speed <span className="font-semibold text-emerald-50">{jobSpeed}</span>
            </div>
          ) : (
            <div className="text-emerald-100/60">Preparing streams…</div>
          )}
          {jobEta ? (
            <div>
              ETA <span className="font-semibold text-emerald-50">{jobEta}</span>
            </div>
          ) : null}
        </div>
        <button
          onClick={onCancel}
          className="rounded-lg border border-emerald-400/40 px-3 py-1.5 text-xs text-emerald-50 transition hover:bg-emerald-400/20"
        >
          Cancel
        </button>
      </div>
    </div>
  );
};

export type DownloadReadyPanelProps = {
  readyJobId: string | null;
  downloadReady: boolean;
  isSaving: boolean;
  onSave: () => void;
  onOpenInTab: () => void;
  onDismiss: () => void;
};

export const DownloadReadyPanel: React.FC<DownloadReadyPanelProps> = ({
  readyJobId,
  downloadReady,
  isSaving,
  onSave,
  onOpenInTab,
  onDismiss,
}) => {
  if (!downloadReady || !readyJobId) return null;

  return (
    <div className="w-full space-y-3 rounded-xl border border-blue-500/40 bg-blue-500/10 p-4">
      <div className="flex items-center justify-between text-sm font-medium text-blue-100">
        <span>Download ready</span>
        <span className="text-xs uppercase tracking-wide opacity-80">Awaiting save</span>
      </div>
      <p className="text-xs text-blue-100/80">
        Open in new tab to play/preview, or save directly to your device.
      </p>
      <div className="flex flex-wrap gap-2">
        <button
          onClick={onOpenInTab}
          className="rounded-lg border border-white/10 bg-gradient-to-r from-emerald-500 to-green-500 px-4 py-2 text-sm font-medium text-white transition hover:scale-[1.02] hover:shadow-lg"
        >
          Open in new tab
        </button>
        <button
          onClick={onSave}
          disabled={isSaving}
          className="rounded-lg border border-white/10 bg-gradient-to-r from-blue-500 to-indigo-500 px-4 py-2 text-sm font-medium text-white transition disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isSaving ? 'Saving…' : 'Save file'}
        </button>
        <button
          onClick={onDismiss}
          className="rounded-lg border border-blue-400/40 px-3 py-2 text-xs text-blue-50 transition hover:bg-blue-400/10"
        >
          Dismiss
        </button>
      </div>
    </div>
  );
};

export type JobErrorPanelProps = {
  jobError: string | null;
  onDismiss: () => void;
  onRetry: () => void;
};

export const JobErrorPanel: React.FC<JobErrorPanelProps> = ({ jobError, onDismiss, onRetry }) => {
  if (!jobError) return null;

  return (
    <div className="w-full space-y-2 rounded-xl border border-red-500/40 bg-red-500/10 p-4 text-red-100">
      <div className="text-sm font-semibold">Download failed</div>
      <div className="break-words text-xs opacity-80">{jobError}</div>
      <div className="flex flex-wrap gap-2">
        <button
          onClick={onDismiss}
          className="rounded-lg border border-red-400/50 px-3 py-1.5 text-xs text-red-50 transition hover:bg-red-400/10"
        >
          Dismiss
        </button>
        <button
          onClick={onRetry}
          className="rounded-lg border border-red-400/40 bg-red-500/20 px-3 py-1.5 text-xs text-red-50 transition hover:bg-red-500/30"
        >
          Try again
        </button>
      </div>
    </div>
  );
};

export type CompletedFileBannerProps = {
  completedPath: string | null;
  onReveal: () => void;
  onOpen: () => void;
  onHide: () => void;
};

export const CompletedFileBanner: React.FC<CompletedFileBannerProps> = ({ completedPath, onReveal, onOpen, onHide }) => {
  if (!completedPath) return null;

  return (
    <div className="mt-2 flex items-center gap-2 rounded-lg border border-white/15 bg-white/5 p-3">
      <div className="flex-1 truncate text-sm text-white/80">
        Saved: <span className="text-white/90">{completedPath}</span>
      </div>
      <button
        onClick={onReveal}
        className="rounded-lg border border-white/20 bg-white/10 px-3 py-1.5 text-xs text-white transition hover:bg-white/20"
      >
        Show in folder
      </button>
      <button
        onClick={onOpen}
        className="rounded-lg border border-white/20 bg-white/10 px-3 py-1.5 text-xs text-white transition hover:bg-white/20"
      >
        Open file
      </button>
      <button
        onClick={onHide}
        className="rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-xs text-white/70"
      >
        Hide
      </button>
    </div>
  );
};
