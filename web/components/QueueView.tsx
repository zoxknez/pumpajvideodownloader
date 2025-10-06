'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { Clock, Trash2, RefreshCw, Loader2, AlertCircle, CheckCircle, XCircle } from 'lucide-react';
import { useToast } from './ToastProvider';
import { getJSON, postJSON } from '@/lib/api';

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

interface SSEEvent {
  type: string;
  stage?: string;
  progress?: number;
  speed?: string;
  eta?: string;
  error?: string;
  filename?: string;
}

export default function QueueView() {
  const { success, error: toastError } = useToast();
  const [jobs, setJobs] = useState<QueueJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [sseConnections] = useState<Map<string, EventSource>>(new Map());

  const loadQueue = useCallback(async () => {
    try {
      const response = await getJSON('/api/job/list') as any;
      if (response && Array.isArray(response.jobs)) {
        setJobs(response.jobs);
        
        // Connect SSE for running jobs
        response.jobs.forEach((job: QueueJob) => {
          if (job.status === 'running' && !sseConnections.has(job.id)) {
            connectSSE(job.id);
          }
        });
      }
    } catch (err) {
      console.error('Failed to load queue:', err);
    } finally {
      setLoading(false);
    }
  }, [sseConnections]);

  const connectSSE = useCallback((jobId: string) => {
    const apiBase = process.env.NEXT_PUBLIC_API_BASE || '';
    const token = localStorage.getItem('auth:token');
    const url = `${apiBase}/api/progress/${jobId}${token ? `?token=${token}` : ''}`;
    
    const sse = new EventSource(url);
    
    sse.onmessage = (event) => {
      try {
        const data: SSEEvent = JSON.parse(event.data);
        
        setJobs(prev => prev.map(job => {
          if (job.id === jobId) {
            return {
              ...job,
              stage: data.stage || job.stage,
              progress: data.progress ?? job.progress,
              speed: data.speed || job.speed,
              eta: data.eta || job.eta,
              status: data.type === 'complete' ? 'completed' : data.type === 'error' ? 'failed' : job.status,
              error: data.error
            };
          }
          return job;
        }));

        if (data.type === 'complete' || data.type === 'error') {
          sse.close();
          sseConnections.delete(jobId);
          loadQueue();
        }
      } catch (err) {
        // SSE parse error (silently handled)
      }
    };

    sse.onerror = () => {
      sse.close();
      sseConnections.delete(jobId);
    };

    // Handle 'end' event to prevent memory leaks
    sse.addEventListener('end', () => {
      sse.close();
      sseConnections.delete(jobId);
    });

    sseConnections.set(jobId, sse);
  }, [loadQueue, sseConnections]);

  const cancelJob = async (jobId: string) => {
    try {
      await postJSON('/api/job/cancel', { jobId });
      success('Job canceled');
      loadQueue();
    } catch (err) {
      toastError('Failed to cancel job');
    }
  };

  const retryJob = async (jobId: string) => {
    try {
      await postJSON('/api/job/retry', { jobId });
      success('Job restarted');
      loadQueue();
    } catch (err) {
      toastError('Failed to retry job');
    }
  };

  useEffect(() => {
    loadQueue();
    const interval = setInterval(loadQueue, 5000);
    
    return () => {
      clearInterval(interval);
      sseConnections.forEach(sse => sse.close());
    };
  }, [loadQueue, sseConnections]);

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
                      <span>{job.stage || 'Processing...'}</span>
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
                {job.status === 'completed' && (
                  <div className="flex items-center gap-2 text-xs text-green-300">
                    <CheckCircle className="w-4 h-4" />
                    <span>Download completed successfully</span>
                  </div>
                )}
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
