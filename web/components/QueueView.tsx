'use client';

import React, { useEffect, useState, useCallback, useRef } from 'react';
import { Clock, Trash2, RefreshCw, Loader2, AlertCircle, CheckCircle, XCircle, Download } from 'lucide-react';
import { useToast } from './ToastProvider';
import { getJSON, postJSON, downloadJobFile } from '@/lib/api';
import { subscribeJobProgress } from '@/lib/api-desktop';

interface QueueJob {
  id: string;
  userId: string;
  type: 'download' | 'audio' | 'playlist' | 'batch';
  url: string;
  title?: string;
  format?: string;
  quality?: string;
  status: 'waiting' | 'running' | 'completed' | 'failed';
  progress?: number;
  stage?: string;
  speed?: string;
  eta?: string;
  error?: string;
  createdAt: string;
}

export default function QueueView() {
  const { success, error: toastError } = useToast();
  const [jobs, setJobs] = useState<QueueJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [readyJobs, setReadyJobs] = useState<Record<string, boolean>>({});
  const [savedJobs, setSavedJobs] = useState<Record<string, boolean>>({});
  const [savingJobId, setSavingJobId] = useState<string | null>(null);
  const subsRef = useRef(new Map<string, { close: () => void }>());
  const loadQueueRef = useRef<() => Promise<void> | void>(() => {});

  const stageLabel = useCallback((stage?: string) => {
    if (!stage) return 'processing';
    return stage.replace(/_/g, ' ');
  }, []);

  const connectSSE = useCallback(async (jobId: string) => {
    if (!jobId || subsRef.current.has(jobId)) return;
    try {
      const subscription = await subscribeJobProgress(
        jobId,
        (update) => {
          setJobs((prev) => prev.map((job) => {
            if (job.id !== jobId) return job;
            return {
              ...job,
              stage: update.stage || job.stage,
              progress: update.progress ?? job.progress,
              speed: update.speed ?? job.speed,
              eta: update.eta ?? job.eta,
            };
          }));
        },
        (status, detail) => {
          const closer = subsRef.current.get(jobId);
          closer?.close?.();
          subsRef.current.delete(jobId);

          setJobs((prev) => prev.map((job) => {
            if (job.id !== jobId) return job;
            const next: QueueJob = {
              ...job,
              status: status as QueueJob['status'],
              progress: status === 'completed' ? 100 : job.progress,
              stage: detail?.reason ? stageLabel(detail.reason) : job.stage,
            };
            if (status === 'failed' && detail?.error) {
              next.error = detail.error;
            }
            return next;
          }));

          if (status === 'completed') {
            setReadyJobs((prev) => ({ ...prev, [jobId]: true }));
            setSavedJobs((prev) => {
              const copy = { ...prev };
              delete copy[jobId];
              return copy;
            });
            success('Preuzimanje je spremno za čuvanje.');
          } else {
            setReadyJobs((prev) => {
              const copy = { ...prev };
              delete copy[jobId];
              return copy;
            });
            if (status === 'failed') {
              toastError(detail?.error || 'Preuzimanje nije uspelo.');
            }
          }

          loadQueueRef.current?.();
        }
      );
      subsRef.current.set(jobId, subscription);
    } catch (err) {
      console.error('Neuspelo povezivanje na SSE za posao', err);
    }
  }, [stageLabel, success, toastError]);

  const loadQueue = useCallback(async () => {
    try {
      const response = await getJSON('/api/job/list') as any;
      if (response && Array.isArray(response.jobs)) {
        setJobs(response.jobs);

        setReadyJobs((prev) => {
          const next = { ...prev };
          const activeCompleted = new Set<string>();
          response.jobs.forEach((job: QueueJob) => {
            if (job.status === 'completed') {
              activeCompleted.add(job.id);
              if (!next[job.id]) next[job.id] = true;
            }
          });
          Object.keys(next).forEach((id) => {
            if (!activeCompleted.has(id)) delete next[id];
          });
          return next;
        });

        response.jobs.forEach((job: QueueJob) => {
          if (job.status === 'running') {
            void connectSSE(job.id);
          } else {
            const sub = subsRef.current.get(job.id);
            if (sub) {
              sub.close();
              subsRef.current.delete(job.id);
            }
          }
        });
      }
    } catch (err) {
      console.error('Failed to load queue:', err);
    } finally {
      setLoading(false);
    }
  }, [connectSSE]);

  const cancelJob = async (jobId: string) => {
    try {
      await postJSON('/api/job/cancel', { jobId });
      const sub = subsRef.current.get(jobId);
      sub?.close();
      subsRef.current.delete(jobId);
      setReadyJobs((prev) => {
        const copy = { ...prev };
        delete copy[jobId];
        return copy;
      });
      setSavedJobs((prev) => {
        const copy = { ...prev };
        delete copy[jobId];
        return copy;
      });
      if (savingJobId === jobId) setSavingJobId(null);
      success('Preuzimanje je otkazano.');
      loadQueue();
    } catch (err) {
      toastError('Failed to cancel job');
    }
  };

  const retryJob = async (jobId: string) => {
    try {
      await postJSON('/api/job/retry', { jobId });
      setReadyJobs((prev) => {
        const copy = { ...prev };
        delete copy[jobId];
        return copy;
      });
      setSavedJobs((prev) => {
        const copy = { ...prev };
        delete copy[jobId];
        return copy;
      });
      if (savingJobId === jobId) setSavingJobId(null);
      success('Ponovno pokretanje poslova u toku.');
      loadQueue();
    } catch (err) {
      toastError('Failed to retry job');
    }
  };

  const sanitizeBaseName = (input?: string) => {
    if (!input) return 'download';
    return input
      .replace(/[\u0000-\u001f<>:"/\\|?*]+/g, '_')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 80) || 'download';
  };

  const inferExtension = (job: QueueJob) => {
    const format = job.format?.toLowerCase() || '';
    if (/(mp4|mkv|webm|mov)/.test(format)) return format.match(/mp4|mkv|webm|mov/)?.[0] ?? 'mp4';
    if (/(m4a|mp3|aac|flac|wav)/.test(format)) return format.match(/m4a|mp3|aac|flac|wav/)?.[0] ?? 'mp3';
    return 'bin';
  };

  const handleSave = async (job: QueueJob) => {
    if (!readyJobs[job.id]) {
      toastError('Datoteka još nije spremna za preuzimanje.');
      return;
    }
    setSavingJobId(job.id);
    try {
      const base = sanitizeBaseName(job.title || job.url);
      const ext = inferExtension(job);
      await downloadJobFile(job.id, `${base}.${ext}`);
      setReadyJobs((prev) => {
        const copy = { ...prev };
        delete copy[job.id];
        return copy;
      });
      setSavedJobs((prev) => ({ ...prev, [job.id]: true }));
      success('Datoteka je sačuvana.');
    } catch (err) {
      console.error('Saving job failed', err);
      toastError('Nije uspelo čuvanje datoteke. Pokušaj ponovo.');
    } finally {
      setSavingJobId((prev) => (prev === job.id ? null : prev));
    }
  };

  const handleDismissReady = (jobId: string) => {
    setReadyJobs((prev) => {
      const copy = { ...prev };
      delete copy[jobId];
      return copy;
    });
  };

  useEffect(() => {
    loadQueueRef.current = loadQueue;
  }, [loadQueue]);

  useEffect(() => {
    void loadQueue();
    const interval = setInterval(() => { void loadQueue(); }, 5000);

    return () => {
      clearInterval(interval);
      subsRef.current.forEach((sub) => {
        try { sub.close(); } catch {}
      });
      subsRef.current.clear();
    };
  }, [loadQueue]);

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'running': return <Loader2 className="w-5 h-5 text-blue-400 animate-spin" />;
      case 'completed': return <CheckCircle className="w-5 h-5 text-green-400" />;
      case 'failed': return <XCircle className="w-5 h-5 text-red-400" />;
      case 'waiting': return <Clock className="w-5 h-5 text-yellow-400" />;
      default: return <Clock className="w-5 h-5 text-slate-400" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'running': return 'border-blue-400/30 bg-blue-500/10';
      case 'completed': return 'border-green-400/30 bg-green-500/10';
      case 'failed': return 'border-red-400/30 bg-red-500/10';
      case 'waiting': return 'border-yellow-400/30 bg-yellow-500/10';
      default: return 'border-white/10 bg-white/5';
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 text-blue-400 animate-spin" />
      </div>
    );
  }

  if (jobs.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-center">
        <Clock className="w-16 h-16 text-slate-600 mb-4" />
        <h3 className="text-xl font-semibold text-white mb-2">Queue is Empty</h3>
        <p className="text-slate-400">Download jobs will appear here when you start a download</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Clock className="w-6 h-6 text-blue-400" />
          <h2 className="text-2xl font-bold text-white">Download Queue</h2>
          <span className="px-3 py-1 rounded-full bg-blue-500/20 border border-blue-400/30 text-sm font-semibold text-blue-200">
            {jobs.length} {jobs.length === 1 ? 'job' : 'jobs'}
          </span>
        </div>
        <button
          onClick={loadQueue}
          className="flex items-center gap-2 px-4 py-2 bg-white/5 hover:bg-white/10 rounded-xl border border-white/10 transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
          <span className="text-sm font-medium">Refresh</span>
        </button>
      </div>

      {/* Jobs List */}
      <div className="space-y-3">
        {jobs.map((job) => (
          <div
            key={job.id}
            className={`relative rounded-xl border p-4 transition-all ${getStatusColor(job.status)}`}
          >
            <div className="flex items-start gap-4">
              {/* Status Icon */}
              <div className="flex-shrink-0 mt-1">
                {getStatusIcon(job.status)}
              </div>

              {/* Job Info */}
              <div className="flex-1 min-w-0">
                <h3 className="text-base font-semibold text-white mb-1 truncate">
                  {job.title || job.url}
                </h3>
                <div className="flex flex-wrap gap-2 text-xs text-slate-400 mb-2">
                  <span className="px-2 py-0.5 rounded bg-white/5 border border-white/10">
                    {job.type}
                  </span>
                  {job.format && (
                    <span className="px-2 py-0.5 rounded bg-white/5 border border-white/10">
                      {job.format}
                    </span>
                  )}
                  {job.quality && (
                    <span className="px-2 py-0.5 rounded bg-white/5 border border-white/10">
                      {job.quality}
                    </span>
                  )}
                </div>

                {/* Progress Bar for Running Jobs */}
                {job.status === 'running' && job.progress !== undefined && (
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-xs text-slate-400">
                      <span className="capitalize">{stageLabel(job.stage)}…</span>
                      <span>{Math.round(job.progress)}%</span>
                    </div>
                    <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-blue-500 to-cyan-500 transition-all duration-300"
                        style={{ width: `${job.progress}%` }}
                      />
                    </div>
                    {(job.speed || job.eta) && (
                      <div className="flex items-center gap-3 text-xs text-slate-500">
                        {job.speed && <span>Speed: {job.speed}</span>}
                        {job.eta && <span>ETA: {job.eta}</span>}
                      </div>
                    )}
                  </div>
                )}

                {/* Error Message */}
                {job.status === 'failed' && job.error && (
                  <div className="flex items-start gap-2 p-2 rounded bg-red-500/10 border border-red-400/20 text-xs text-red-300">
                    <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                    <span>{job.error}</span>
                  </div>
                )}

                {/* Completed Message */}
                {job.status === 'completed' && (() => {
                  const isReady = readyJobs[job.id];
                  const isSaved = savedJobs[job.id];
                  return (
                    <div className="space-y-2 text-xs">
                      <div className="flex items-center gap-2 text-emerald-300">
                        <CheckCircle className="w-4 h-4" />
                        <span>Preuzimanje je završeno na serveru.</span>
                      </div>
                      {isReady && !isSaved && (
                        <div className="flex flex-wrap gap-2">
                          <button
                            onClick={() => handleSave(job)}
                            disabled={savingJobId === job.id}
                            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-emerald-500/20 border border-emerald-400/40 text-emerald-50 hover:bg-emerald-500/30 disabled:opacity-60 disabled:cursor-not-allowed transition"
                          >
                            <Download className="w-3.5 h-3.5" />
                            <span>{savingJobId === job.id ? 'Čuvanje…' : 'Sačuvaj datoteku'}</span>
                          </button>
                          <button
                            onClick={() => handleDismissReady(job.id)}
                            className="px-3 py-1.5 rounded-lg border border-emerald-400/30 text-emerald-200 hover:bg-emerald-400/10 transition"
                          >
                            Podseti me kasnije
                          </button>
                        </div>
                      )}
                      {isSaved && (
                        <div className="text-emerald-200/80">Datoteka je već sačuvana.</div>
                      )}
                    </div>
                  );
                })()}
              </div>

              {/* Actions */}
              <div className="flex items-center gap-2">
                {job.status === 'failed' && (
                  <button
                    onClick={() => retryJob(job.id)}
                    className="p-2 hover:bg-white/10 rounded-lg transition-colors"
                    title="Retry"
                  >
                    <RefreshCw className="w-4 h-4 text-slate-300" />
                  </button>
                )}
                {(job.status === 'waiting' || job.status === 'running') && (
                  <button
                    onClick={() => cancelJob(job.id)}
                    className="p-2 hover:bg-white/10 rounded-lg transition-colors"
                    title="Cancel"
                  >
                    <Trash2 className="w-4 h-4 text-red-400" />
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
