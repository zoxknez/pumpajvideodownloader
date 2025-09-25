import React, { useCallback, useEffect, useRef, useState } from 'react';
import { History, RefreshCw, Play, Trash2, Clock, FileType, HardDrive, Search, RotateCcw, CheckCircle, AlertCircle, XCircle } from 'lucide-react';
import { useToast } from './ToastProvider';

interface DownloadHistoryItem {
  id: string;
  title: string;
  url: string;
  thumbnail: string;
  type: 'video' | 'audio' | 'playlist';
  format: string;
  quality: string;
  size: string;
  downloadDate: string;
  status: 'completed' | 'failed' | 'in-progress' | 'canceled';
  progress?: number;
  stage?: string;
  speed?: string;
  eta?: string;
}

interface ConvertJobItem {
  id: string;
  fileName: string;
  fromFormat: string;
  toFormat: string;
  status: 'pending' | 'converting' | 'completed' | 'failed';
  progress?: number;
  quality: string;
  size: string;
  startTime: string;
}

export const HistoryConvertTab: React.FC = () => {
  const { success, error: toastError, info } = useToast();
  const [activeSection, setActiveSection] = useState<'history' | 'convert'>('history');
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'video' | 'audio' | 'playlist'>('all');
  const [filterStatus, setFilterStatus] = useState<'all' | 'completed' | 'failed' | 'in-progress' | 'canceled' | 'queued'>('all');

  // Mock download history data
  const [downloadHistory, setDownloadHistory] = useState<DownloadHistoryItem[]>([]);
  const sseRefs = useRef<Map<string, EventSource>>(new Map());

  const api = import.meta.env.VITE_API_BASE || 'http://127.0.0.1:5176';

  const loadHistory = useCallback(() => {
  fetch(`${api}/api/history`, { headers: { Authorization: `Bearer ${localStorage.getItem('app:token') || ''}` } }).then(r => r.json()).then(data => {
      const items: DownloadHistoryItem[] = (data?.items || []).map((i: any) => ({
        id: i.id,
        title: i.title,
        url: i.url,
        thumbnail: i.thumbnail || '',
        type: i.type,
        format: i.format,
        quality: i.quality || '',
        size: i.size || '',
        downloadDate: i.downloadDate,
        status: i.status,
        progress: i.progress,
      }));
      setDownloadHistory(items);
      // manage SSE subscriptions for in-progress items
      const map = sseRefs.current;
      // close SSE for items no longer in-progress
      for (const [id, es] of map.entries()) {
        const stillActive = items.find((it) => it.id === id && it.status === 'in-progress');
        if (!stillActive) {
          try { es.close(); } catch {}
          map.delete(id);
        }
      }
      // open SSE for new in-progress items
      for (const it of items) {
        if (it.status === 'in-progress' && !map.has(it.id)) {
          try {
            const tok = encodeURIComponent(localStorage.getItem('app:token') || '');
            const es = new EventSource(`${api}/api/progress/${it.id}?token=${tok}`);
            es.onmessage = (ev) => {
              try {
                const msg = JSON.parse(ev.data || '{}');
                if (msg && msg.id === it.id) {
                  setDownloadHistory((prev) => prev.map((p) => p.id === it.id ? {
                    ...p,
                    progress: typeof msg.progress === 'number' ? msg.progress : p.progress,
                    stage: msg.stage ?? p.stage,
                    speed: msg.speed ?? p.speed,
                    eta: msg.eta ?? p.eta,
                  } : p));
                }
              } catch {}
            };
            es.addEventListener('end', () => {
              try { es.close(); } catch {}
              map.delete(it.id);
            });
            es.onerror = () => {
              // auto close on error to allow retry next poll
              try { es.close(); } catch {}
              map.delete(it.id);
            };
            map.set(it.id, es);
          } catch {}
        }
      }
    }).catch(() => {});
  }, [api]);

  useEffect(() => {
    loadHistory();
    const id = setInterval(loadHistory, 4000);
    // snapshot the map for cleanup
    const snapshot = sseRefs.current;
    return () => {
      clearInterval(id);
      // cleanup SSE using snapshot
      for (const es of snapshot.values()) {
        try { es.close(); } catch {}
      }
      snapshot.clear();
    };
  }, [loadHistory]);

  const handleDelete = async (id: string) => {
  await fetch(`${api}/api/history/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${localStorage.getItem('app:token') || ''}` } }).catch(() => {});
    loadHistory();
  };

  const handleRetry = async (item: DownloadHistoryItem) => {
    try {
      if (item.type === 'video') {
        await fetch(`${api}/api/job/start/best`, {
          method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('app:token') || ''}` },
          body: JSON.stringify({ url: item.url, title: item.title }),
        });
      } else if (item.type === 'audio') {
        await fetch(`${api}/api/job/start/audio`, {
          method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('app:token') || ''}` },
          body: JSON.stringify({ url: item.url, title: item.title, format: (item.format || 'M4A').toLowerCase() }),
        });
      }
    } catch {}
    setTimeout(loadHistory, 800);
  };

  const handleCancel = async (id: string) => {
  try { await fetch(`${api}/api/job/cancel/${encodeURIComponent(id)}`, { method: 'POST', headers: { Authorization: `Bearer ${localStorage.getItem('app:token') || ''}` } }); } catch {}
    info('Job canceled');
    setTimeout(loadHistory, 800);
  };

  const handleCancelAll = async () => {
    try {
      if (!window.confirm('Cancel all running and queued jobs?')) return;
  const r = await fetch(`${api}/api/jobs/cancel-all`, { method: 'POST', headers: { Authorization: `Bearer ${localStorage.getItem('app:token') || ''}` } });
      if (r.ok) success('All jobs canceled'); else toastError('Cancel all failed');
    } catch { toastError('Cancel all failed'); }
    setTimeout(loadHistory, 800);
  };

  const handleRetryAllFailed = async () => {
    const failed = downloadHistory.filter((i) => i.status === 'failed');
    if (failed.length === 0) return;
    let ok = 0;
    for (const item of failed) {
      try {
        if (item.type === 'video') {
          await fetch(`${api}/api/job/start/best`, {
            method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('app:token') || ''}` },
            body: JSON.stringify({ url: item.url, title: item.title }),
          });
        } else if (item.type === 'audio') {
          await fetch(`${api}/api/job/start/audio`, {
            method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('app:token') || ''}` },
            body: JSON.stringify({ url: item.url, title: item.title, format: (item.format || 'M4A').toLowerCase() }),
          });
        }
        ok++;
      } catch {}
    }
    if (ok) success(`Retried ${ok} failed job(s)`); else toastError('No jobs retried');
    setTimeout(loadHistory, 800);
  };

  // Mock convert jobs data
  const [convertJobs] = useState<ConvertJobItem[]>([
    {
      id: '1',
      fileName: 'Nature_Documentary_4K.mp4',
      fromFormat: 'WEBM',
      toFormat: 'MP4',
      status: 'completed',
      quality: '4K',
      size: '2.8 GB',
      startTime: '2024-01-15 15:00'
    },
    {
      id: '2',
      fileName: 'Music_Mix.flac',
      fromFormat: 'FLAC',
      toFormat: 'MP3',
      status: 'converting',
      progress: 45,
      quality: '320kbps',
      size: '89 MB',
      startTime: '2024-01-15 15:30'
    },
    {
      id: '3',
      fileName: 'Tutorial_Video.mkv',
      fromFormat: 'MKV',
      toFormat: 'MP4',
      status: 'pending',
      quality: '1080p',
      size: '450 MB',
      startTime: '2024-01-15 16:00'
    }
  ]);

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed': return <CheckCircle className="w-5 h-5 text-green-400" />;
      case 'failed': return <XCircle className="w-5 h-5 text-red-400" />;
  case 'canceled': return <XCircle className="w-5 h-5 text-yellow-400" />;
  case 'in-progress': case 'converting': return <RefreshCw className="w-5 h-5 text-blue-400 animate-spin" />;
  case 'queued': return <Clock className="w-5 h-5 text-yellow-400" />;
      case 'pending': return <Clock className="w-5 h-5 text-yellow-400" />;
      default: return <AlertCircle className="w-5 h-5 text-gray-400" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return 'text-green-400 bg-green-500/20 border-green-500/30';
      case 'failed': return 'text-red-400 bg-red-500/20 border-red-500/30';
  case 'canceled': return 'text-yellow-300 bg-yellow-500/20 border-yellow-500/30';
  case 'in-progress': case 'converting': return 'text-blue-400 bg-blue-500/20 border-blue-500/30';
  case 'queued': return 'text-yellow-400 bg-yellow-500/20 border-yellow-500/30';
      case 'pending': return 'text-yellow-400 bg-yellow-500/20 border-yellow-500/30';
      default: return 'text-gray-400 bg-gray-500/20 border-gray-500/30';
    }
  };

  const filteredHistory = downloadHistory.filter(item => {
    const matchesSearch = item.title.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesType = filterType === 'all' || item.type === filterType;
    const matchesStatus = filterStatus === 'all' || item.status === filterStatus;
    return matchesSearch && matchesType && matchesStatus;
  });

  return (
    <div className="max-w-7xl mx-auto">
      {/* Section Header */}
      <div className="flex items-center gap-4 mb-8">
        <div className="p-3 rounded-2xl bg-gradient-to-br from-purple-500 to-pink-600 shadow-lg shadow-purple-500/25">
          <History className="w-8 h-8 text-white" />
        </div>
        <div>
          <h1 className="text-3xl font-bold text-white mb-2">History & Convert</h1>
          <p className="text-purple-200">Manage your downloads and convert media files</p>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="flex gap-2 mb-8 bg-white/5 backdrop-blur-md rounded-2xl p-2 border border-white/10">
        <button
          onClick={() => setActiveSection('history')}
          className={`flex-1 flex items-center justify-center gap-2 px-6 py-3 rounded-xl font-medium transition-all duration-300 ${
            activeSection === 'history'
              ? 'bg-gradient-to-r from-purple-600 to-pink-600 text-white shadow-lg shadow-purple-500/25'
              : 'text-white/60 hover:text-white hover:bg-white/10'
          }`}
        >
          <History className="w-5 h-5" />
          Download History
        </button>
        <button
          onClick={() => setActiveSection('convert')}
          className={`flex-1 flex items-center justify-center gap-2 px-6 py-3 rounded-xl font-medium transition-all duration-300 ${
            activeSection === 'convert'
              ? 'bg-gradient-to-r from-purple-600 to-pink-600 text-white shadow-lg shadow-purple-500/25'
              : 'text-white/60 hover:text-white hover:bg-white/10'
          }`}
        >
          <RefreshCw className="w-5 h-5" />
          Convert Queue
        </button>
      </div>

      {/* Bulk Actions for History */}
      {activeSection === 'history' && (
        <div className="mb-4 flex flex-wrap gap-2">
          <button
            onClick={handleCancelAll}
            className="px-4 py-2 rounded-lg text-sm bg-red-600/20 hover:bg-red-600/30 border border-red-600/40 text-red-200"
          >
            Cancel All
          </button>
          <button
            onClick={handleRetryAllFailed}
            className="px-4 py-2 rounded-lg text-sm bg-green-600/20 hover:bg-green-600/30 border border-green-600/40 text-green-200"
          >
            Retry All Failed
          </button>
        </div>
      )}

  {activeSection === 'history' && (
        <div className="space-y-6">
          {/* Filters and Search */}
          <div className="bg-white/5 backdrop-blur-md rounded-2xl border border-white/10 p-6">
    <div className="flex flex-col lg:flex-row gap-4">
              {/* Search */}
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-white/40" />
                <input
                  type="text"
                  placeholder="Search downloads..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder-white/40 focus:border-purple-500 focus:ring-2 focus:ring-purple-500/25 transition-all duration-300 outline-none"
                />
              </div>

              {/* Type Filter */}
              <select
                value={filterType}
                onChange={(e) => setFilterType(e.target.value as typeof filterType)}
                className="px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white focus:border-purple-500 focus:ring-2 focus:ring-purple-500/25 transition-all duration-300 outline-none"
              >
                <option value="all">All Types</option>
                <option value="video">Video</option>
                <option value="audio">Audio</option>
                <option value="playlist">Playlist</option>
              </select>

              {/* Status Filter */}
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value as typeof filterStatus)}
                className="px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white focus:border-purple-500 focus:ring-2 focus:ring-purple-500/25 transition-all duration-300 outline-none"
              >
                <option value="all">All Status</option>
                <option value="completed">Completed</option>
                <option value="failed">Failed</option>
                <option value="in-progress">In Progress</option>
                <option value="canceled">Canceled</option>
                <option value="queued">Queued</option>
              </select>

              {/* Actions */}
              <div className="flex gap-2">
                <button
                  onClick={() => loadHistory()}
                  className="px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white hover:bg-white/20 transition-all duration-300"
                  title="Refresh"
                >
                  Refresh
                </button>
                <button
                  onClick={handleCancelAll}
                  className="px-4 py-3 bg-yellow-500/20 border border-yellow-500/30 rounded-xl text-yellow-200 hover:bg-yellow-500/30 transition-all duration-300"
                  title="Cancel All"
                >
                  Cancel All
                </button>
                <button
                  onClick={async () => { await fetch(`${api}/api/history`, { method: 'DELETE' }).catch(()=>{}); loadHistory(); }}
                  className="px-4 py-3 bg-red-500/20 border border-red-500/30 rounded-xl text-red-200 hover:bg-red-500/30 transition-all duration-300"
                  title="Clear All"
                >
                  Clear All
                </button>
              </div>
            </div>
          </div>

          {/* History List */}
          <div className="space-y-4">
            {filteredHistory.map((item) => (
              <div key={item.id} className="bg-white/5 backdrop-blur-md rounded-2xl border border-white/10 p-6 hover:shadow-2xl hover:shadow-purple-500/10 transition-all duration-500">
                <div className="flex items-center gap-6">
                  {/* Thumbnail */}
                  <div className="relative">
                    <img
                      src={item.thumbnail}
                      alt={item.title}
                      className="w-24 h-14 object-cover rounded-lg"
                    />
                    <div className="absolute -top-1 -right-1">
                      {getStatusIcon(item.status)}
                    </div>
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <h3 className="text-white font-semibold text-lg mb-2 truncate">{item.title}</h3>
                    <div className="flex items-center gap-4 text-sm text-white/70 mb-2">
                      <span className="flex items-center gap-1">
                        <FileType className="w-4 h-4" />
                        {item.format}
                      </span>
                      <span>{item.quality}</span>
                      <span className="flex items-center gap-1">
                        <HardDrive className="w-4 h-4" />
                        {item.size}
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock className="w-4 h-4" />
                        {item.downloadDate}
                      </span>
                    </div>
                    
                    {/* Progress Bar for In-Progress Downloads */}
        {item.status === 'in-progress' && (
                      <div className="w-full bg-white/10 rounded-full h-2 mb-2">
                        <div 
                          className="bg-gradient-to-r from-blue-500 to-purple-500 h-2 rounded-full transition-all duration-300"
          style={{ width: `${Math.max(0, Math.min(100, item.progress ?? 0))}%` }}
                        />
                        {(item.stage || item.speed || item.eta) && (
                          <div className="text-xs text-white/70 mt-1">
                            {item.stage || 'working'} {item.speed ? `• ${item.speed}` : ''} {item.eta ? `• ETA ${item.eta}` : ''}
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Status and Actions */}
                  <div className="flex items-center gap-4">
                    <div className={`px-3 py-1 rounded-lg border text-sm font-medium ${getStatusColor(item.status)}`}>
                      {item.status.charAt(0).toUpperCase() + item.status.slice(1).replace('-', ' ')}
                    </div>
                    
                    <div className="flex gap-2">
                      {item.status === 'completed' && (
                        <button
                          onClick={async () => {
                            // Try in-app download of the merged file
                            try {
                              const ok = await (async () => {
                                const res = await fetch(`${api}/api/job/file/${encodeURIComponent(item.id)}`, { method: 'GET' });
                                if (!res.ok) return false;
                                const blob = await res.blob();
                                const url = URL.createObjectURL(blob);
                                const a = document.createElement('a');
                                a.href = url;
                                // Attempt to name the file
                                const cd = res.headers.get('content-disposition') || '';
                                const m = cd.match(/filename="?([^";]+)"?/i);
                                a.download = (m ? m[1] : `${item.title}.${(item.format || 'mp4').toLowerCase()}`).replace(/[^\w.-]+/g, '_');
                                document.body.appendChild(a);
                                success('Saving file…');
                                a.click();
                                a.remove();
                                URL.revokeObjectURL(url);
                                return true;
                              })();
                              if (ok) return;
                            } catch {}

                            // Fallback to legacy endpoints through backend but trigger blob download
                            try {
                              if (item.type === 'video') {
                                const u = new URL(`${api}/api/download/best`);
                                u.searchParams.set('url', item.url);
                                u.searchParams.set('title', item.title);
                                const res = await fetch(u.toString());
                                if (res.ok) {
                                  const blob = await res.blob();
                                  const link = document.createElement('a');
                                  link.href = URL.createObjectURL(blob);
                                  link.download = `${item.title}.mp4`.replace(/[^\w.-]+/g, '_');
                                  document.body.appendChild(link);
                                  success('Saving file…');
                                  link.click();
                                  link.remove();
                                } else {
                                  throw new Error('Video legacy download failed');
                                }
                              } else if (item.type === 'audio') {
                                const u = new URL(`${api}/api/download/audio`);
                                u.searchParams.set('url', item.url);
                                u.searchParams.set('title', item.title);
                                const fmt = (item.format || 'M4A').toLowerCase();
                                u.searchParams.set('format', fmt === 'mp3' ? 'mp3' : 'm4a');
                                const res = await fetch(u.toString());
                                if (res.ok) {
                                  const blob = await res.blob();
                                  const link = document.createElement('a');
                                  link.href = URL.createObjectURL(blob);
                                  link.download = `${item.title}.${fmt === 'mp3' ? 'mp3' : 'm4a'}`.replace(/[^\w.-]+/g, '_');
                                  document.body.appendChild(link);
                                  success('Saving file…');
                                  link.click();
                                  link.remove();
                                } else {
                                  throw new Error('Audio legacy download failed');
                                }
                              }
                            } catch { toastError('Download failed. Please try again.'); }
                          }}
                          className="p-2 bg-green-500/20 hover:bg-green-500/30 border border-green-500/30 rounded-lg transition-all duration-300"
                        >
                          <Play className="w-4 h-4 text-green-400" />
                        </button>
                      )}
                      {item.status === 'in-progress' && (
                        <button
                          onClick={() => handleCancel(item.id)}
                          className="p-2 bg-red-500/20 hover:bg-red-500/30 border border-red-500/30 rounded-lg transition-all duration-300"
                        >
                          <Trash2 className="w-4 h-4 text-red-400" />
                        </button>
                      )}
                      {item.status === 'failed' && (
                        <button onClick={() => handleRetry(item)} className="p-2 bg-blue-500/20 hover:bg-blue-500/30 border border-blue-500/30 rounded-lg transition-all duration-300">
                          <RotateCcw className="w-4 h-4 text-blue-400" />
                        </button>
                      )}
                      <button onClick={() => handleDelete(item.id)} className="p-2 bg-red-500/20 hover:bg-red-500/30 border border-red-500/30 rounded-lg transition-all duration-300">
                        <Trash2 className="w-4 h-4 text-red-400" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeSection === 'convert' && (
        <div className="space-y-6">
          {/* Convert Queue Header */}
          <div className="bg-white/5 backdrop-blur-md rounded-2xl border border-white/10 p-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold text-white mb-2">Conversion Queue</h2>
                <p className="text-white/70">Manage your media conversion tasks</p>
              </div>
              <button className="px-6 py-3 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white font-semibold rounded-xl transition-all duration-300 shadow-lg hover:shadow-xl">
                Add New Conversion
              </button>
            </div>
          </div>

          {/* Convert Jobs List */}
          <div className="space-y-4">
            {convertJobs.map((job) => (
              <div key={job.id} className="bg-white/5 backdrop-blur-md rounded-2xl border border-white/10 p-6 hover:shadow-2xl hover:shadow-purple-500/10 transition-all duration-500">
                <div className="flex items-center gap-6">
                  {/* Status Icon */}
                  <div className="flex-shrink-0">
                    {getStatusIcon(job.status)}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <h3 className="text-white font-semibold text-lg mb-2 truncate">{job.fileName}</h3>
                    <div className="flex items-center gap-4 text-sm text-white/70 mb-2">
                      <span className="flex items-center gap-1">
                        <FileType className="w-4 h-4" />
                        {job.fromFormat} → {job.toFormat}
                      </span>
                      <span>{job.quality}</span>
                      <span className="flex items-center gap-1">
                        <HardDrive className="w-4 h-4" />
                        {job.size}
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock className="w-4 h-4" />
                        {job.startTime}
                      </span>
                    </div>
                    
                    {/* Progress Bar for Converting Jobs */}
                    {job.status === 'converting' && job.progress && (
                      <div className="w-full bg-white/10 rounded-full h-2 mb-2">
                        <div 
                          className="bg-gradient-to-r from-green-500 to-blue-500 h-2 rounded-full transition-all duration-300"
                          style={{ width: `${job.progress}%` }}
                        />
                        <div className="text-right text-xs text-white/60 mt-1">{job.progress}%</div>
                      </div>
                    )}
                  </div>

                  {/* Status and Actions */}
                  <div className="flex items-center gap-4">
                    <div className={`px-3 py-1 rounded-lg border text-sm font-medium ${getStatusColor(job.status)}`}>
                      {job.status.charAt(0).toUpperCase() + job.status.slice(1)}
                    </div>
                    
                    <div className="flex gap-2">
                      {job.status === 'pending' && (
                        <button className="p-2 bg-blue-500/20 hover:bg-blue-500/30 border border-blue-500/30 rounded-lg transition-all duration-300">
                          <Play className="w-4 h-4 text-blue-400" />
                        </button>
                      )}
                      <button className="p-2 bg-red-500/20 hover:bg-red-500/30 border border-red-500/30 rounded-lg transition-all duration-300">
                        <Trash2 className="w-4 h-4 text-red-400" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
