import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  cancelJob,
  downloadJobFile,
  isJobFileReady,
  proxyDownload,
  resolveFormatUrl,
  startBestJob,
  subscribeJobProgress,
} from '@/lib/api-desktop';
import {
  ipcAvailable,
  onDoneIpc,
  onProgressIpc,
  startIpcAdvanced,
} from '@/lib/downloader';
import type { JobStatus, VideoAnalysisData, VideoFormatDetails } from '../types';

type ToastFns = {
  info: (message: string) => void;
  error: (message: string) => void;
};

type UseDownloadJobParams = {
  analysisData?: VideoAnalysisData;
  selectedFormat: number;
  onDownloadStart?: () => void;
  toast: ToastFns;
};

type ProgressEvent = {
  progress?: number;
  stage?: string;
  speed?: string | null;
  eta?: string | null;
};

type StatusEvent = 'completed' | 'failed' | 'canceled';

const DEFAULT_TITLE = 'video';

export const formatStageLabel = (stage?: string) => (stage ? stage.replace(/_/g, ' ') : 'working');

const normalizeTitle = (title?: string) => (title && title.trim().length ? title : DEFAULT_TITLE);

const buildFilename = (title: string, quality: string, extension: string) => {
  const sanitize = (value: string) => value.replace(/[\\/:*?"<>|]+/g, '_').replace(/[\s]+/g, '_');
  return `${sanitize(title)}_${sanitize(quality)}.${extension}`;
};

export const useDownloadJob = ({ analysisData, selectedFormat, onDownloadStart, toast }: UseDownloadJobParams) => {
  const [jobId, setJobId] = useState<string | null>(null);
  const [readyJobId, setReadyJobId] = useState<string | null>(null);
  const [jobProgress, setJobProgress] = useState<number>(0);
  const [jobStage, setJobStage] = useState<string>('');
  const [jobSpeed, setJobSpeed] = useState<string | null>(null);
  const [jobEta, setJobEta] = useState<string | null>(null);
  const [jobStatus, setJobStatus] = useState<JobStatus>('idle');
  const [jobError, setJobError] = useState<string | null>(null);
  const [downloadReady, setDownloadReady] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [completedPath, setCompletedPath] = useState<string | null>(null);

  const jobStartRef = useRef<number>(0);
  const triedHeadRef = useRef<boolean>(false);
  const directFallbackRef = useRef<boolean>(false);
  const subscriptionRef = useRef<{ close?: () => void } | null>(null);

  const info = toast.info;
  const toastError = toast.error;

  const currentFormat: VideoFormatDetails | undefined = useMemo(() => {
    if (!analysisData?.formats?.length) return undefined;
    return analysisData.formats[selectedFormat] ?? analysisData.formats[0];
  }, [analysisData, selectedFormat]);

  const closeSubscription = useCallback(() => {
    try {
      subscriptionRef.current?.close?.();
    } catch {}
    subscriptionRef.current = null;
  }, []);

  const resetTrackingFlags = useCallback((clearReady?: boolean) => {
    triedHeadRef.current = false;
    directFallbackRef.current = false;
    setIsSaving(false);
    if (clearReady) {
      setReadyJobId(null);
      setDownloadReady(false);
      setJobError(null);
    }
  }, []);

  const resetForSelectionChange = useCallback(() => {
    resetTrackingFlags(true);
    setJobStage('');
    setJobProgress(0);
    setJobSpeed(null);
    setJobEta(null);
    setJobStatus('idle');
    setCompletedPath(null);
  }, [resetTrackingFlags]);

  const handleStatusEvent = useCallback(
    (status: StatusEvent, detail?: { error?: string; reason?: string }) => {
      resetTrackingFlags();
      closeSubscription();
      triedHeadRef.current = true;

      if (status === 'completed') {
        setReadyJobId((prev) => prev ?? jobId);
        setJobId(null);
        setJobStatus('completed');
        setJobStage((prev) => prev || 'completed');
        setJobProgress((prev) => (prev >= 99 ? prev : 100));
        setJobSpeed(null);
        setJobEta(null);
        setDownloadReady(true);
        setJobError(null);
        info('Download ready — click “Save file” to choose location.');
        return;
      }

      if (status === 'failed') {
        setJobId(null);
        setReadyJobId(null);
        setJobStatus('failed');
        setJobStage('failed');
        setJobSpeed(null);
        setJobEta(null);
        setDownloadReady(false);
        const message = detail?.error || detail?.reason || 'Download failed.';
        setJobError(message);
        toastError('Download failed.');
        return;
      }

      if (status === 'canceled') {
        setJobId(null);
        setReadyJobId(null);
        setJobStatus('canceled');
        setJobStage('canceled');
        setJobSpeed(null);
        setJobEta(null);
        setDownloadReady(false);
        info('Download canceled.');
      }
    },
    [closeSubscription, info, jobId, resetTrackingFlags, toastError]
  );

  const startIpcJob = useCallback(
    async (format: string) => {
      if (!analysisData?.sourceUrl) return;
      resetTrackingFlags(true);
      setJobError(null);
      setJobSpeed(null);
      setJobEta(null);
      setCompletedPath(null);

      const id = crypto.randomUUID();
      closeSubscription();

      const offProgress = onProgressIpc((payload) => {
        if (payload?.id !== id) return;
        const progress = payload?.progress || {};
        const total = Number(progress.total_bytes || progress.total_bytes_estimate || 0);
        const loaded = Number(progress.downloaded_bytes || 0);
        const percentage = total > 0 ? Math.min(100, Math.round((loaded / total) * 100)) : undefined;
        if (typeof percentage === 'number' && Number.isFinite(percentage)) {
          setJobProgress(percentage);
        }
        setJobStage(progress.status || 'downloading');
        setJobStatus('running');
      });

      const offDone = onDoneIpc((payload) => {
        if (payload?.id !== id) return;
        try {
          setCompletedPath(payload?.filepath || null);
          setJobStatus('completed');
          setJobStage('completed');
          setJobProgress(100);
          setJobSpeed(null);
          setJobEta(null);
          resetTrackingFlags();
          setTimeout(() => {
            setJobId(null);
            setJobProgress(0);
            setJobStage('');
            setJobStatus('idle');
          }, 300);
        } finally {
          try {
            offProgress?.();
            offDone?.();
          } catch {}
          subscriptionRef.current = null;
        }
      });

      subscriptionRef.current = {
        close: () => {
          try {
            offProgress?.();
            offDone?.();
          } catch {}
        },
      };

      setJobId(id);
      setJobProgress(0);
      setJobStage('starting');
      setJobStatus('running');

      const response = await startIpcAdvanced({
        id,
        url: analysisData.sourceUrl,
        outDir: 'Video',
        mode: 'video',
        format,
        title: analysisData.videoTitle,
      });

      if (!response?.ok) {
        subscriptionRef.current?.close?.();
        subscriptionRef.current = null;
        setJobId(null);
        setJobProgress(0);
        setJobStage('');
        setJobStatus('idle');
        const code = String(response?.error || 'start_failed');
        const message =
          code === 'ytdlp_missing'
            ? 'yt-dlp not found. Open Settings → System to check binaries.'
            : code === 'ffmpeg_missing'
            ? 'FFmpeg not found. Open Settings → System to check binaries.'
            : 'Failed to start download.';
        toastError(message);
        return;
      }

      onDownloadStart?.();
    },
    [analysisData, closeSubscription, onDownloadStart, resetTrackingFlags, toastError]
  );

  const startBestDownload = useCallback(async () => {
    if (!analysisData?.sourceUrl) return;
    resetTrackingFlags(true);
    setJobError(null);
    setReadyJobId(null);
    setJobSpeed(null);
    setJobEta(null);
    setCompletedPath(null);

    try {
      if (ipcAvailable) {
        await startIpcJob('best');
        return;
      }

      const title = normalizeTitle(analysisData.videoTitle);
      const id = await startBestJob(analysisData.sourceUrl, title);
      closeSubscription();
      setJobId(id);
      setJobProgress(0);
      setJobStage('starting');
      setJobStatus('running');
      jobStartRef.current = Date.now();

      const subscription = await subscribeJobProgress(
        id,
        (progress: ProgressEvent) => {
          if (typeof progress.progress === 'number') setJobProgress(progress.progress);
          if (progress.stage) setJobStage(progress.stage);
          if (progress.speed !== undefined) setJobSpeed(progress.speed || null);
          if (progress.eta !== undefined) setJobEta(progress.eta || null);
        },
  (status, detail) => handleStatusEvent(status as StatusEvent, detail)
      );

      subscriptionRef.current = subscription;
      info('Download started');
      onDownloadStart?.();
    } catch {
      setJobStatus('idle');
      setJobSpeed(null);
      setJobEta(null);

      try {
        const fmt = currentFormat;
        if (!fmt) return;
        let url = fmt.url;
        if (!url && fmt.formatId && analysisData?.sourceUrl) {
          url = (await resolveFormatUrl(analysisData.sourceUrl, fmt.formatId)) || undefined;
        }
        if (url) {
          const extension = String(fmt.format || 'mp4').toLowerCase();
          const filename = buildFilename(normalizeTitle(analysisData.videoTitle), fmt.quality || 'best', extension);
          await proxyDownload({ url, filename });
        }
      } catch {}
    }
  }, [analysisData, closeSubscription, currentFormat, handleStatusEvent, info, onDownloadStart, resetTrackingFlags, startIpcJob]);

  const startPresetDownload = useCallback(
    async (preset: 'mp4' | 'webm') => {
      if (!ipcAvailable) return;
      const format =
        preset === 'mp4'
          ? 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best'
          : 'bestvideo[ext=webm]+bestaudio/best[ext=webm]/best';
      await startIpcJob(format);
      onDownloadStart?.();
    },
    [onDownloadStart, startIpcJob]
  );

  const saveReadyFile = useCallback(async () => {
    if (!readyJobId) {
      toastError('File is no longer available to download.');
      return;
    }
    setIsSaving(true);
    try {
      await downloadJobFile(readyJobId);
      info('Download saved.');
      resetTrackingFlags(true);
      setJobStatus('idle');
      setJobStage('');
      setJobProgress(0);
      setJobSpeed(null);
      setJobEta(null);
    } catch {
      toastError('Could not save the file. Please try again.');
    } finally {
      setIsSaving(false);
    }
  }, [info, readyJobId, resetTrackingFlags, toastError]);

  const dismissReady = useCallback(() => {
    resetTrackingFlags(true);
    setJobStatus('idle');
    setJobStage('');
    setJobProgress(0);
    setJobSpeed(null);
    setJobEta(null);
  }, [resetTrackingFlags]);

  const cancelActiveJob = useCallback(async () => {
    if (!jobId) return;
    try {
      await cancelJob(jobId);
      info('Download canceled.');
    } catch {
      toastError('Failed to cancel download.');
    } finally {
      setJobId(null);
      setReadyJobId(null);
      setJobStatus('canceled');
      setJobStage('canceled');
      setJobProgress(0);
      setJobSpeed(null);
      setJobEta(null);
      setDownloadReady(false);
      resetTrackingFlags();
    }
  }, [info, jobId, resetTrackingFlags, toastError]);

  const clearError = useCallback(() => setJobError(null), []);
  const clearCompletedPath = useCallback(() => setCompletedPath(null), []);

  useEffect(() => {
    if (!jobId || jobStatus !== 'running') return;
    let disposed = false;
    const currentJobId = jobId;
    const interval = setInterval(async () => {
      if (disposed || triedHeadRef.current) return;
      try {
        const elapsed = Date.now() - (jobStartRef.current || Date.now());
        if (elapsed < 2000) return;
        const ready = await isJobFileReady(currentJobId);
        if (ready) {
          triedHeadRef.current = true;
          setReadyJobId(currentJobId);
          setJobId((prev) => (prev === currentJobId ? null : prev));
          setJobStatus('completed');
          setJobStage((prev) => prev || 'completed');
          setJobProgress((prev) => (prev >= 99 ? prev : 100));
          setJobSpeed(null);
          setJobEta(null);
          setDownloadReady(true);
          setJobError(null);
          info('Download ready — click “Save file” to choose location.');
        }
      } catch {}
    }, 1500);
    return () => {
      disposed = true;
      clearInterval(interval);
    };
  }, [info, jobId, jobStatus]);

  useEffect(() => {
    if (!analysisData || !jobId || jobStatus !== 'running') return;
    const started = jobStartRef.current || Date.now();
    const interval = setInterval(async () => {
      if (!jobId) {
        clearInterval(interval);
        return;
      }
      if (downloadReady || directFallbackRef.current) {
        clearInterval(interval);
        return;
      }
      if (Date.now() - started <= 12_000) return;
      if ((jobProgress ?? 0) >= 1) return;
      try {
        directFallbackRef.current = true;
        const fmt = currentFormat;
        if (!fmt) return;
        let url = fmt.url;
        if (!url && fmt.formatId && analysisData.sourceUrl) {
          url = (await resolveFormatUrl(analysisData.sourceUrl, fmt.formatId)) || undefined;
        }
        if (url) {
          info('Server merge slow, falling back to direct download…');
          const extension = String(fmt.format || 'mp4').toLowerCase();
          const filename = buildFilename(normalizeTitle(analysisData.videoTitle), fmt.quality || 'best', extension);
          await proxyDownload({ url, filename });
          try {
            if (jobId) await cancelJob(jobId);
          } catch {}
          setTimeout(() => {
            setJobId(null);
            setReadyJobId(null);
            setJobProgress(0);
            setJobStage('');
            setJobStatus('idle');
            setJobSpeed(null);
            setJobEta(null);
            setDownloadReady(false);
          }, 500);
        } else {
          directFallbackRef.current = false;
        }
      } catch {
        directFallbackRef.current = false;
      }
    }, 1500);
    return () => clearInterval(interval);
  }, [analysisData, currentFormat, downloadReady, info, jobId, jobProgress, jobStatus]);

  useEffect(() => () => {
    try {
      subscriptionRef.current?.close?.();
    } catch {}
  }, []);

  useEffect(() => {
    if (!analysisData) {
      setJobId(null);
      setReadyJobId(null);
      setJobProgress(0);
      setJobStage('');
      setJobSpeed(null);
      setJobEta(null);
      setJobStatus('idle');
      setJobError(null);
      setDownloadReady(false);
      setIsSaving(false);
      setCompletedPath(null);
      triedHeadRef.current = false;
      directFallbackRef.current = false;
      closeSubscription();
    } else {
      setCompletedPath(null);
    }
  }, [analysisData, closeSubscription]);

  return {
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
    dismissReady,
    cancelActiveJob,
    clearError,
    clearCompletedPath,
    resetForSelectionChange,
  };
};
