import { useCallback, useState, useRef } from 'react';
import { startBestJob, subscribeJobProgress, getAuthenticatedUrl } from '@/lib/api-desktop';
import type { VideoAnalysisData } from '../types';

type ToastFns = {
  info: (message: string) => void;
  error: (message: string) => void;
};

type DownloadStatus = 'idle' | 'starting' | 'processing' | 'completed' | 'failed';

type UseSimpleDownloadParams = {
  analysisData?: VideoAnalysisData;
  toast: ToastFns;
};

export const useSimpleDownload = ({ analysisData, toast }: UseSimpleDownloadParams) => {
  const [status, setStatus] = useState<DownloadStatus>('idle');
  const [progress, setProgress] = useState<number>(0);
  const [stage, setStage] = useState<string>('');
  const [speed, setSpeed] = useState<string | null>(null);
  const [eta, setEta] = useState<string | null>(null);
  const subscriptionRef = useRef<{ close?: () => void } | null>(null);

  const startDownload = useCallback(async () => {
    if (!analysisData?.sourceUrl) {
      toast.error('No video URL available');
      return;
    }

    setStatus('starting');
    setProgress(0);
    setStage('Starting...');
    setSpeed(null);
    setEta(null);

    try {
      const title = analysisData.videoTitle || 'video';
      const jobId = await startBestJob(analysisData.sourceUrl, title);

      setStatus('processing');
      toast.info('Processing video... Will open in new tab when ready.');

      const subscription = await subscribeJobProgress(
        jobId,
        (progressData) => {
          if (typeof progressData.progress === 'number') {
            setProgress(progressData.progress);
          }
          if (progressData.stage) {
            setStage(progressData.stage);
          }
          if (progressData.speed !== undefined) {
            setSpeed(progressData.speed || null);
          }
          if (progressData.eta !== undefined) {
            setEta(progressData.eta || null);
          }
        },
        async (status, detail) => {
          if (status === 'completed') {
            setStatus('completed');
            setProgress(100);
            setStage('Opening...');
            
            // Auto-open in new tab
            try {
              const url = await getAuthenticatedUrl(`/api/job/file/${jobId}`);
              window.open(url, '_blank');
              toast.info('Video opened in new tab! You can watch or right-click "Save as..."');
            } catch (err) {
              console.error('Failed to open video', err);
              toast.error('Video ready but failed to open. Check downloads.');
            }

            // Reset after 2 seconds
            setTimeout(() => {
              setStatus('idle');
              setProgress(0);
              setStage('');
              setSpeed(null);
              setEta(null);
            }, 2000);
          } else if (status === 'failed') {
            setStatus('failed');
            setStage('Failed');
            toast.error(detail?.error || 'Download failed');
            
            setTimeout(() => {
              setStatus('idle');
              setProgress(0);
              setStage('');
              setSpeed(null);
              setEta(null);
            }, 3000);
          }
        }
      );

      subscriptionRef.current = subscription;
    } catch (err) {
      console.error('Download start failed', err);
      setStatus('failed');
      toast.error('Failed to start download');
      
      setTimeout(() => {
        setStatus('idle');
        setProgress(0);
        setStage('');
      }, 3000);
    }
  }, [analysisData, toast]);

  const reset = useCallback(() => {
    try {
      subscriptionRef.current?.close?.();
    } catch {}
    subscriptionRef.current = null;
    setStatus('idle');
    setProgress(0);
    setStage('');
    setSpeed(null);
    setEta(null);
  }, []);

  return {
    status,
    progress,
    stage,
    speed,
    eta,
    isActive: status !== 'idle',
    startDownload,
    reset,
  };
};
