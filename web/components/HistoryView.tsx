'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { History, Trash2, RefreshCw, Download, ExternalLink, CheckCircle, XCircle, Clock, Search, HardDrive } from 'lucide-react';
import { useToast } from './ToastProvider';
import { getJSON, deleteJSON, downloadJobFile } from '@/lib/api';

interface HistoryItem {
  id: string;
  url: string;
  title?: string;
  type: 'video' | 'audio' | 'playlist' | 'thumbnail' | 'batch' | 'clip';
  format?: string;
  quality?: string;
  status: 'completed' | 'failed';
  error?: string;
  createdAt: string;
  completedAt?: string;
  size?: string;
  sizeBytes?: number;
  canDownload?: boolean;
}

export default function HistoryView() {
  const { success, error: toastError } = useToast();
  const [items, setItems] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'video' | 'audio' | 'playlist'>('all');
  const [filterStatus, setFilterStatus] = useState<'all' | 'completed' | 'failed'>('all');
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const loadHistory = useCallback(async () => {
    try {
      const response = await getJSON('/api/history') as any;
      if (response && Array.isArray(response.items)) {
        setItems(response.items);
      }
    } catch (err) {
      console.error('Failed to load history:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  const clearHistory = async () => {
    if (!confirm('Are you sure you want to clear all history?')) return;
    
    try {
      await deleteJSON('/api/history');
      success('History cleared');
      setItems([]);
    } catch (err) {
      toastError('Failed to clear history');
    }
  };

  const removeItem = async (itemId: string) => {
    try {
      await deleteJSON(`/api/history/${encodeURIComponent(itemId)}`);
      setItems(prev => prev.filter((item) => item.id !== itemId));
      success('Item removed');
    } catch (err) {
      toastError('Failed to remove item');
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

  const inferExtension = (item: HistoryItem) => {
    const format = item.format?.toLowerCase() || '';
    if (/mp4|mkv|webm|mov/.test(format)) return format.match(/mp4|mkv|webm|mov/)?.[0] ?? 'mp4';
    if (/m4a|mp3|aac|flac|wav|opus|ogg|oga|alac/.test(format)) {
      return format.match(/m4a|mp3|aac|flac|wav|opus|ogg|oga|alac/)?.[0] ?? 'mp3';
    }
    return 'bin';
  };

  const handleDownload = async (item: HistoryItem) => {
    if (!item.canDownload) {
      toastError('File is no longer available on the server.');
      return;
    }
    setDownloadingId(item.id);
    try {
      const base = sanitizeBaseName(item.title || item.url);
      const ext = inferExtension(item);
      await downloadJobFile(item.id, `${base}.${ext}`);
      success('Download saved to your device.');
    } catch (err) {
      console.error('History download failed', err);
      toastError('Could not save the file. It may have expired.');
    } finally {
      setDownloadingId((prev) => (prev === item.id ? null : prev));
    }
  };

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  const filteredItems = items.filter(item => {
    const matchesSearch = !searchTerm || 
      item.title?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.url.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesType = filterType === 'all' || item.type === filterType;
    const matchesStatus = filterStatus === 'all' || item.status === filterStatus;
    
    return matchesSearch && matchesType && matchesStatus;
  });

  const getStatusIcon = (status: string) => {
    return status === 'completed' 
      ? <CheckCircle className="w-5 h-5 text-green-400" />
      : <XCircle className="w-5 h-5 text-red-400" />;
  };

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'video': return 'bg-blue-500/20 border-blue-400/30 text-blue-300';
      case 'audio': return 'bg-purple-500/20 border-purple-400/30 text-purple-300';
      case 'batch': return 'bg-amber-500/20 border-amber-400/30 text-amber-200';
      case 'playlist': return 'bg-green-500/20 border-green-400/30 text-green-300';
      default: return 'bg-white/10 border-white/20 text-white';
    }
  };

  const formatTimestamp = (item: HistoryItem) => {
    const date = item.completedAt || item.createdAt;
    try {
      return new Date(date).toLocaleString();
    } catch {
      return item.completedAt || item.createdAt;
    }
  };

  const formatSize = (item: HistoryItem) => {
    if (item.size) return item.size;
    const bytes = item.sizeBytes;
    if (!bytes || !Number.isFinite(bytes)) return undefined;
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let value = bytes;
    let idx = 0;
    while (value >= 1024 && idx < units.length - 1) {
      value /= 1024;
      idx += 1;
    }
    const precision = idx >= 2 ? 1 : 0;
    return `${value.toFixed(precision)} ${units[idx]}`;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-400"></div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <History className="w-6 h-6 text-purple-400" />
          <h2 className="text-2xl font-bold text-white">Download History</h2>
          <span className="px-3 py-1 rounded-full bg-purple-500/20 border border-purple-400/30 text-sm font-semibold text-purple-200">
            {filteredItems.length} {filteredItems.length === 1 ? 'item' : 'items'}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={loadHistory}
            className="flex items-center gap-2 px-4 py-2 bg-white/5 hover:bg-white/10 rounded-xl border border-white/10 transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            <span className="text-sm font-medium">Refresh</span>
          </button>
          {items.length > 0 && (
            <button
              onClick={clearHistory}
              className="flex items-center gap-2 px-4 py-2 bg-red-500/20 hover:bg-red-500/30 rounded-xl border border-red-400/30 transition-colors text-red-300"
            >
              <Trash2 className="w-4 h-4" />
              <span className="text-sm font-medium">Clear All</span>
            </button>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col md:flex-row gap-3">
        {/* Search */}
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search by title or URL..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-white/5 border border-white/10 rounded-xl focus:border-blue-400/50 focus:ring-2 focus:ring-blue-400/20 outline-none text-white placeholder-slate-400 transition-all"
          />
        </div>

        {/* Type Filter */}
        <select
          value={filterType}
          onChange={(e) => setFilterType(e.target.value as any)}
          className="px-4 py-2 bg-white/5 border border-white/10 rounded-xl focus:border-blue-400/50 outline-none text-white transition-all"
        >
          <option value="all">All Types</option>
          <option value="video">Video</option>
          <option value="audio">Audio</option>
          <option value="playlist">Playlist</option>
        </select>

        {/* Status Filter */}
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value as any)}
          className="px-4 py-2 bg-white/5 border border-white/10 rounded-xl focus:border-blue-400/50 outline-none text-white transition-all"
        >
          <option value="all">All Status</option>
          <option value="completed">Completed</option>
          <option value="failed">Failed</option>
        </select>
      </div>

      {/* History List */}
      {filteredItems.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-64 text-center">
          <History className="w-16 h-16 text-slate-600 mb-4" />
          <h3 className="text-xl font-semibold text-white mb-2">
            {searchTerm || filterType !== 'all' || filterStatus !== 'all' 
              ? 'No items match your filters' 
              : 'No download history yet'}
          </h3>
          <p className="text-slate-400">
            {searchTerm || filterType !== 'all' || filterStatus !== 'all'
              ? 'Try adjusting your search or filters'
              : 'Completed downloads will appear here'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredItems.map((item) => (
            <div
              key={item.id}
              className="relative rounded-xl border border-white/10 bg-white/5 p-4 hover:bg-white/10 transition-all"
            >
              <div className="flex items-start gap-4">
                {/* Status Icon */}
                <div className="flex-shrink-0 mt-1">
                  {getStatusIcon(item.status)}
                </div>

                {/* Item Info */}
                <div className="flex-1 min-w-0">
                  <h3 className="text-base font-semibold text-white mb-1 truncate">
                    {item.title || item.url}
                  </h3>
                  
                  <div className="flex flex-wrap gap-2 text-xs text-slate-400 mb-2">
                    <span className={`px-2 py-0.5 rounded border ${getTypeColor(item.type)}`}>
                      {item.type}
                    </span>
                    {item.format && (
                      <span className="px-2 py-0.5 rounded bg-white/5 border border-white/10">
                        {item.format}
                      </span>
                    )}
                    {item.quality && (
                      <span className="px-2 py-0.5 rounded bg-white/5 border border-white/10">
                        {item.quality}
                      </span>
                    )}
                    {formatSize(item) && (
                      <span className="px-2 py-0.5 rounded bg-white/5 border border-white/10 flex items-center gap-1">
                        <HardDrive className="w-3 h-3" />
                        {formatSize(item)}
                      </span>
                    )}
                    <span className="px-2 py-0.5 rounded bg-white/5 border border-white/10 flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {formatTimestamp(item)}
                    </span>
                  </div>

                  {/* Error Message */}
                  {item.status === 'failed' && item.error && (
                    <div className="flex items-start gap-2 p-2 rounded bg-red-500/10 border border-red-400/20 text-xs text-red-300">
                      <XCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                      <span>{item.error}</span>
                    </div>
                  )}

                  {/* URL */}
                  <a
                    href={item.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-blue-400 hover:text-blue-300 transition-colors flex items-center gap-1 mt-2"
                  >
                    <ExternalLink className="w-3 h-3" />
                    <span className="truncate">{item.url}</span>
                  </a>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleDownload(item)}
                      disabled={!item.canDownload || downloadingId === item.id}
                      className={`p-2 rounded-lg transition-colors ${
                        item.canDownload
                          ? 'hover:bg-blue-500/20'
                          : 'opacity-60 cursor-not-allowed bg-white/10'
                      }`}
                      title={item.canDownload ? 'Save file again' : 'Download expired'}
                    >
                      <Download className={`w-4 h-4 ${item.canDownload ? 'text-blue-400' : 'text-slate-500'}`} />
                    </button>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(item.url);
                        success('URL copied! Paste in Download tab to start again.');
                      }}
                      className="p-2 hover:bg-white/10 rounded-lg transition-colors"
                      title="Copy source URL"
                    >
                      <ExternalLink className="w-4 h-4 text-blue-200" />
                    </button>
                  </div>
                  <button
                    onClick={() => removeItem(item.id)}
                    className="p-2 hover:bg-white/10 rounded-lg transition-colors"
                    title="Remove"
                  >
                    <Trash2 className="w-4 h-4 text-red-400" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
