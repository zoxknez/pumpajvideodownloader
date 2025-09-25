import { useState, useEffect, useCallback, useRef } from 'react';
import { ThumbnailSection } from './components/ThumbnailSection';
import { VideoSection } from './components/VideoSection';
import { AudioSection } from './components/AudioSection';
import { OptionsSection } from './components/OptionsSection';
import { HistoryTab } from './components/HistoryTab.tsx';
import { BatchTab } from './components/BatchTab';
import { SettingsTab } from './components/SettingsTab';
import { AnalysisResults } from './components/AnalysisResults';
import { analyzeUrl, getJobsSettings, authHeaders } from './lib/api';
import { getDefaultDirHandle } from './lib/fsStore';
import { Download, Search, Clipboard, Trash2, Sparkles, Settings, Monitor, History as HistoryIcon, Clock } from 'lucide-react';
import pumpajLogo from './assets/pumpaj-logo.svg';
import { QueueTab } from './components/QueueTab';

type MainTab = 'download' | 'queue' | 'history' | 'batch' | 'settings';

function App() {
  const [url, setUrl] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isAnalyzed, setIsAnalyzed] = useState(false);
  const [analysisJson, setAnalysisJson] = useState<any | null>(null);
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [activeMainTab, setActiveMainTab] = useState<MainTab>('download');
  const [apiOnline, setApiOnline] = useState<boolean | null>(null);
  const [jobsMetrics, setJobsMetrics] = useState<{ running: number; queued: number; maxConcurrent?: number; aggregatePercent?: number } | null>(null);
  const [serverNet, setServerNet] = useState<{ proxy: boolean; limitKib: number } | null>(null);
  const [defaultDir, setDefaultDir] = useState<string>('');
  const [binStatus, setBinStatus] = useState<{ ytdlp: boolean; ffmpeg: boolean; ffprobe: boolean } | null>(null);
  const handleAnalyzeRef = useRef<() => void>(() => {});
  const urlInputRef = useRef<HTMLInputElement | null>(null);
  const [ipcPaused, setIpcPaused] = useState<boolean>(false);
  const apiBase = import.meta.env.VITE_API_BASE || 'http://127.0.0.1:5176';
  // Detect Electron IPC mode (desktop build exposes window.api in preload)
  const isIpc = typeof window !== 'undefined' && Boolean((window as any).api?.analyze || (window as any).api?.start);

  // Restore persisted UI state
  useEffect(() => {
    try {
      const savedUrl = localStorage.getItem('app:url');
  const savedTab = localStorage.getItem('app:activeTab') as MainTab | null;
      if (savedUrl) setUrl(savedUrl);
  if (savedTab && ['download','queue','history','batch','settings'].includes(savedTab)) setActiveMainTab(savedTab);
    } catch {}
  }, []);

  // Desktop: listen to tray navigation events (preload relays navigate:tab)
  useEffect(() => {
    if (!isIpc) return;
    let off: any;
    try { off = (window as any).api?._onNavigateTab?.(); } catch {}
    return () => { try { off?.(); } catch {} };
  }, [isIpc]);

  // Desktop: reflect pauseNewJobs from settings
  useEffect(() => {
    if (!isIpc) return;
    let off: any;
    (async () => {
      try { const r = await (window as any).api?.getSettings?.(); if (r?.ok && r?.data) setIpcPaused(!!r.data.pauseNewJobs); } catch {}
      try { off = (window as any).api?.onSettingsChanged?.((s: any) => { try { setIpcPaused(!!s?.pauseNewJobs); } catch {} }); } catch {}
    })();
    return () => { try { off?.(); } catch {} };
  }, [isIpc]);

  // Persist URL and active tab
  useEffect(() => {
    try { localStorage.setItem('app:url', url); } catch {}
  }, [url]);
  useEffect(() => {
    try { localStorage.setItem('app:activeTab', activeMainTab); } catch {}
  }, [activeMainTab]);

  // Desktop: auto-fill URL when clipboard watcher emits a URL
  useEffect(() => {
    if (!isIpc) return;
    let off: any;
    try {
      off = (window as any).api?.onClipboardUrl?.((p: any) => {
        const urlStr = String(p?.url || '').trim();
        if (!urlStr) return;
        setUrl(urlStr);
        setIsAnalyzed(false);
        setAnalysisJson(null);
        setErrorMsg('');
      });
    } catch {}
    return () => { try { off?.(); } catch {} };
  }, [isIpc]);

  // Desktop: auto-analyze trigger if enabled in main (autoAnalyzeClipboard)
  useEffect(() => {
    if (!isIpc) return;
    let off: any;
    try {
      off = (window as any).api?.onAnalyzeTrigger?.((p: any) => {
        const urlStr = String(p?.url || '').trim();
        if (!urlStr) return;
        setUrl(urlStr);
        setIsAnalyzed(false);
        setAnalysisJson(null);
        setErrorMsg('');
    // kick analyze via ref to avoid order issues
    setTimeout(() => { try { handleAnalyzeRef.current?.(); } catch {} }, 50);
      });
    } catch {}
    return () => { try { off?.(); } catch {} };
  }, [isIpc]);

  // allow children to request navigation
  useEffect(() => {
    const onNav = (e: Event) => {
      const d = (e as CustomEvent).detail as any;
  if (d && (d === 'download' || d === 'queue' || d === 'history' || d === 'batch' || d === 'settings')) {
        setActiveMainTab(d);
      }
    };
    window.addEventListener('navigate-main-tab', onNav as any);
    return () => window.removeEventListener('navigate-main-tab', onNav as any);
  }, []);

  // backend health poll (skip in IPC mode)
  useEffect(() => {
    if (isIpc) { setApiOnline(null); return; }
    let disposed = false;
    const ping = async () => {
      try {
        const res = await fetch(`${apiBase}/health`, { cache: 'no-store' });
        if (!disposed) setApiOnline(res.ok);
      } catch {
        if (!disposed) setApiOnline(false);
      }
    };
    ping();
    const id = setInterval(ping, 10000);
    return () => { disposed = true; clearInterval(id); };
  }, [apiBase, isIpc]);

  // desktop (IPC): check packaged binaries availability for user feedback
  useEffect(() => {
    if (!isIpc) { setBinStatus(null); return; }
    let disposed = false;
    (async () => {
      try {
        const r = await (window as any).api?.checkBinaries?.();
        if (!disposed && r?.ok && r?.data) setBinStatus({ ytdlp: !!r.data.ytdlp, ffmpeg: !!r.data.ffmpeg, ffprobe: !!r.data.ffprobe });
      } catch { /* ignore */ }
    })();
    return () => { disposed = true; };
  }, [isIpc]);

  // jobs metrics poll for queue badge (skip in IPC mode)
  useEffect(() => {
    if (isIpc) return;
    let disposed = false;
    const poll = async () => {
      try {
        const r = await fetch(`${apiBase}/api/jobs/metrics`, { cache: 'no-store', headers: authHeaders() });
        if (r.ok) {
          const j = await r.json();
          if (!disposed) setJobsMetrics({ running: Number(j.running||0), queued: Number(j.queued||0), maxConcurrent: Number(j.maxConcurrent||undefined) });
        }
      } catch {}
    };
    const id = setInterval(poll, 4000);
    return () => { disposed = true; clearInterval(id); };
  }, [apiBase, isIpc]);

  // IPC: jobs metrics poll for queue badge (desktop mode)
  useEffect(() => {
    if (!isIpc) return;
    let disposed = false;
    const poll = async () => {
      try {
        const r = await (window as any).api?.jobsMetrics?.();
        if (!disposed && r?.ok) setJobsMetrics({ running: Number(r.running || 0), queued: Number(r.queued || 0), maxConcurrent: Number(r.maxConcurrent || undefined), aggregatePercent: typeof r.aggregatePercent === 'number' ? r.aggregatePercent : undefined });
      } catch {}
    };
    poll();
    const id = setInterval(poll, 4000);
    return () => { disposed = true; clearInterval(id); };
  }, [isIpc]);

  // server network settings (proxy/limit) badge (skip in IPC mode)
  useEffect(() => {
    if (isIpc) return;
    let disposed = false;
    const load = async () => {
      try {
        const s = await getJobsSettings();
        if (!disposed) setServerNet({ proxy: Boolean((s as any).proxyUrl), limitKib: Number((s as any).limitRateKbps || 0) });
      } catch {}
    };
    load();
    const id = setInterval(load, 30000);
    return () => { disposed = true; clearInterval(id); };
  }, [isIpc]);

  // Load default download folder name and subscribe to changes
  useEffect(() => {
    let disposed = false;
    (async () => {
      try { const h = await getDefaultDirHandle(); if (!disposed) setDefaultDir((h as any)?.name || ''); } catch {}
    })();
    const onChange = (e: any) => { if (!disposed) setDefaultDir(String(e?.detail?.name || '')); };
    window.addEventListener('default-dir-changed', onChange as any);
    return () => { disposed = true; window.removeEventListener('default-dir-changed', onChange as any); };
  }, []);

  const handleAnalyze = useCallback(async () => {
    if (!url.trim()) return;
    
    setErrorMsg('');
    setIsAnalyzing(true);
    try {
      const json = await analyzeUrl(url.trim());
      setAnalysisJson(json);
      setIsAnalyzed(true);
    } catch (e) {
  const msg = e instanceof Error ? e.message : (isIpc ? 'Analiza nije uspela. Proveri URL i pokušaj ponovo.' : 'Analiza nije uspela. Proveri URL i server (http://localhost:5176)');
      console.error(msg);
      setErrorMsg(msg);
    } finally {
      setIsAnalyzing(false);
    }
  }, [url, isIpc]);

  // Keep ref in sync with latest handler (must appear after handleAnalyze definition)
  useEffect(() => {
    handleAnalyzeRef.current = handleAnalyze;
  }, [handleAnalyze]);
  // Global keyboard shortcuts: Enter to Analyze (on Download), Ctrl+1..5 to switch tabs
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Don't interfere with typing in other fields except the URL input
      const tag = (document.activeElement?.tagName || '').toLowerCase();
      const isInputLike = tag === 'input' || tag === 'textarea' || (document.activeElement as any)?.isContentEditable;
      // Ctrl+1..5 to switch tabs
      if (e.ctrlKey && !e.shiftKey && !e.altKey) {
        const key = e.key;
        if (key >= '1' && key <= '5') {
          const map: Record<string, MainTab> = { '1': 'download', '2': 'queue', '3': 'batch', '4': 'history', '5': 'settings' };
          const target = map[key];
          if (target) { setActiveMainTab(target); e.preventDefault(); return; }
        }
      }
      // Enter to Analyze when on Download tab
      if (!e.ctrlKey && !e.altKey && !e.metaKey && e.key === 'Enter') {
        if (activeMainTab === 'download' && !isAnalyzing && url.trim()) {
          // If focus is within the document body or the URL input, let it trigger analyze
          if (!isInputLike || (tag === 'input')) {
            e.preventDefault();
            handleAnalyze();
          }
        }
      }
      // Ctrl+L to focus URL input
      if (e.ctrlKey && !e.shiftKey && !e.altKey && (e.key === 'l' || e.key === 'L')) {
        e.preventDefault();
        try { urlInputRef.current?.focus(); } catch {}
        return;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [activeMainTab, isAnalyzing, url, handleAnalyze]);

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      setUrl(text);
    } catch {
      console.error('Failed to read clipboard');
    }
  };

  const handleClear = () => {
  setUrl('');
    setIsAnalyzed(false);
  setAnalysisJson(null);
  setErrorMsg('');
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-purple-900 
                    relative overflow-hidden">
      {/* Animated background elements */}
      <div className="absolute inset-0 opacity-20">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-blue-500/20 rounded-full 
                        blur-3xl animate-pulse"></div>
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-purple-500/20 rounded-full 
                        blur-3xl animate-pulse delay-1000"></div>
      </div>

      {/* Corner glow vignette (no hard top line) */}
      <div className="pointer-events-none absolute inset-0 z-[5]">
        <div
          className="absolute -inset-8 md:-inset-12 opacity-30 mix-blend-screen"
          style={{
            backgroundImage: [
              'radial-gradient(40% 60% at 0% 0%, rgba(59,130,246,0.20), transparent 60%)',
              'radial-gradient(40% 60% at 100% 0%, rgba(236,72,153,0.18), transparent 60%)',
              'radial-gradient(40% 60% at 0% 100%, rgba(20,184,166,0.18), transparent 60%)',
              'radial-gradient(40% 60% at 100% 100%, rgba(99,102,241,0.20), transparent 60%)',
            ].join(', '),
          }}
        />
      </div>
      {/* Subtle dark vignette to slightly dim edges */}
      <div className="pointer-events-none absolute inset-0 z-[4]">
        <div
          className="absolute inset-0 opacity-30"
          style={{
            backgroundImage: [
              'radial-gradient(120% 80% at 50% -10%, rgba(0,0,0,0.0), rgba(0,0,0,0.25) 65%)',
              'radial-gradient(120% 80% at 50% 110%, rgba(0,0,0,0.0), rgba(0,0,0,0.25) 65%)',
            ].join(', '),
          }}
        />
      </div>

  <div className="relative z-10 container mx-auto px-4 md:px-6 py-8">
  {/* Offline Notice (hidden in IPC mode) */}
  {!isIpc && apiOnline === false && (
          <div className="mb-4 px-4 py-2 rounded-lg border border-red-500/30 bg-red-500/10 text-red-300 text-sm">
            Backend server appears offline. Ensure it’s running at {apiBase}.
          </div>
        )}
        {/* Desktop binaries notice */}
        {isIpc && binStatus && (!binStatus.ytdlp || !binStatus.ffmpeg) && (
          <div className="mb-4 px-4 py-2 rounded-lg border border-yellow-500/30 bg-yellow-500/10 text-yellow-200 text-sm">
            Missing binaries detected: {!binStatus.ytdlp ? 'yt-dlp ' : ''}{!binStatus.ffmpeg ? (!binStatus.ytdlp ? 'and ffmpeg' : 'ffmpeg') : ''}. Open Settings → System to review.
          </div>
        )}
        {/* Main content framed wrapper */}
        <div className="relative">
          {/* Soft inner frame (rounded, subtle gradient + hairline) with slimmer left/right edges */}
          <div className="pointer-events-none absolute -inset-y-2 sm:-inset-y-3 md:-inset-y-4 lg:-inset-y-6 -inset-x-[2px] sm:-inset-x-[6px] md:-inset-x-[8px] lg:-inset-x-[10px] z-0">
            <div className="absolute inset-0 rounded-[34px] border border-white/10 shadow-[0_10px_40px_rgba(0,0,0,0.30),_inset_0_0_80px_rgba(255,255,255,0.04),_inset_0_0_120px_rgba(0,0,0,0.25)]"></div>
            <div className="absolute -inset-y-[2px] -inset-x-[1px] sm:-inset-x-[2px] md:-inset-x-[3px] lg:-inset-x-[4px] rounded-[36px] bg-gradient-to-r from-blue-500/20 via-fuchsia-500/14 to-cyan-500/20 opacity-15 blur-md"></div>
          </div>

          <div className="relative z-10">
          {/* Header */}
          <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-3 mb-4">
            <div className="p-3 rounded-2xl bg-gradient-to-br from-blue-500 to-purple-600 shadow-lg shadow-blue-500/25">
              <img src={pumpajLogo} alt="Pumpaj logo" className="w-12 h-12 object-contain" />
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-4xl font-bold bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">Pumpaj Media Downloader</h1>
              <Sparkles className="w-6 h-6 text-yellow-400 attention-icon icon-glow glow-amber" />
              <a
                href="https://x.com/KoronVirus"
                target="_blank"
                rel="noopener noreferrer"
                className="text-base px-3.5 py-2 rounded-full border border-purple-500/40 bg-purple-500/15 text-purple-100 font-semibold hover:bg-purple-500/25 transition-colors"
                title="Autor: o0o0o0o"
              >
                autor · o0o0o0o
              </a>
              {isIpc ? (
                <span className="ml-2 text-sm px-3 py-1.5 rounded-full border text-emerald-300 border-emerald-500/30 bg-emerald-500/10">
                  Desktop: IPC mode
                </span>
              ) : (
                <span className={`ml-2 text-sm px-3 py-1.5 rounded-full border ${apiOnline ? 'text-green-300 border-green-500/30 bg-green-500/10' : apiOnline === false ? 'text-red-300 border-red-500/30 bg-red-500/10' : 'text-slate-300 border-slate-600 bg-slate-700/40'}`}>
                  Server: {apiOnline === null ? '...' : apiOnline ? 'Online' : 'Offline'}
                </span>
              )}
              {isIpc && (
                <>
                <button
                  onClick={async () => { try { await (window as any).api?.openDownloads?.(); } catch {} }}
                  className="ml-2 text-sm px-3 py-1.5 rounded-full border text-blue-300 border-blue-500/30 bg-blue-500/10 hover:bg-blue-500/20"
                >
                  Open Downloads
                </button>
                <button
                  onClick={async () => { try { const r = await (window as any).api?.getSettings?.(); if (r?.ok) { const next = !r.data.pauseNewJobs; await (window as any).api?.setSettings?.({ pauseNewJobs: next }); setIpcPaused(next); } } catch {} }}
                  className={`text-sm px-3 py-1.5 rounded-full border ${ipcPaused ? 'text-yellow-300 border-yellow-500/30 bg-yellow-500/10 hover:bg-yellow-500/20' : 'text-emerald-300 border-emerald-500/30 bg-emerald-500/10 hover:bg-emerald-500/20'} ml-2`}
                >
                  {ipcPaused ? 'Resume new jobs' : 'Pause new jobs'}
                </button>
        {jobsMetrics && (
                  <span className="text-sm px-3 py-1.5 rounded-full border text-blue-300 border-blue-500/30 bg-blue-500/10">
          Queue: {jobsMetrics.running} running / max {jobsMetrics.maxConcurrent ?? '—'}, {jobsMetrics.queued} queued{typeof jobsMetrics.aggregatePercent === 'number' ? ` • ${Math.max(0, Math.min(100, jobsMetrics.aggregatePercent))}%` : ''}
                  </span>
                )}
                </>
              )}
              {!isIpc && jobsMetrics && (
                <span className="text-sm px-3 py-1.5 rounded-full border text-blue-300 border-blue-500/30 bg-blue-500/10">
                  Queue: {jobsMetrics.running} running / max {jobsMetrics.maxConcurrent ?? '—'}, {jobsMetrics.queued} queued
                </span>
              )}
              {!isIpc && serverNet && (
                <span className="text-sm px-3 py-1.5 rounded-full border text-cyan-300 border-cyan-500/30 bg-cyan-500/10">
                  Net: proxy {serverNet.proxy ? 'on' : 'off'} • limit {serverNet.limitKib > 0 ? `${serverNet.limitKib} KiB/s` : 'unlimited'}
                </span>
              )}
              {defaultDir && (
                <span className="text-sm px-3 py-1.5 rounded-full border text-emerald-300 border-emerald-500/30 bg-emerald-500/10">
                  Downloads: {defaultDir}
                </span>
              )}
            </div>
          </div>
          {/* Tagline removed per request */}
          </div>

          {/* Aggregate progress (desktop) */}
          {isIpc && jobsMetrics && jobsMetrics.running > 0 && (
            <div className="mx-auto max-w-[900px] mt-2">
              <div className="flex items-center gap-3">
                <div className="flex-1 h-2 rounded-full bg-white/10 overflow-hidden">
                  {typeof jobsMetrics.aggregatePercent === 'number' ? (
                    <div
                      className="h-full bg-gradient-to-r from-blue-500 to-purple-500 transition-[width] duration-500"
                      style={{ width: `${Math.max(0, Math.min(100, jobsMetrics.aggregatePercent))}%` }}
                    />
                  ) : (
                    <div className="h-full w-1/2 bg-gradient-to-r from-blue-500 to-purple-500 animate-pulse" />
                  )}
                </div>
                <div className="text-xs text-white/80 min-w-[44px] text-right">
                  {typeof jobsMetrics.aggregatePercent === 'number' ? `${Math.max(0, Math.min(100, jobsMetrics.aggregatePercent))}%` : '…'}
                </div>
                <button
                  onClick={async () => { try { await (window as any).api?.jobsCancelAll?.(); } catch {} }}
                  className="text-xs px-2 py-1 rounded-md border text-red-300 border-red-500/30 bg-red-500/10 hover:bg-red-500/20"
                  title="Cancel all running jobs"
                >
                  Cancel all
                </button>
              </div>
            </div>
          )}

  {/* Shared content width wrapper: URL bar + Tab menu + Tab content */}
  <div className="mx-auto max-w-[1200px] 2xl:max-w-[1400px]">
  {/* URL Input Section (full width within container) */}
  <div className="w-full mb-4">
          <div
            className="relative"
            onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
            onDrop={(e) => {
              try {
                e.preventDefault(); e.stopPropagation();
                const dt = e.dataTransfer; if (!dt) return;
                const urlText = dt.getData('text/uri-list') || dt.getData('text/plain') || '';
                const t = urlText.trim(); if (!t) return;
                try { const u = new URL(t); if (u.protocol === 'http:' || u.protocol === 'https:') { setUrl(t); setIsAnalyzed(false); setAnalysisJson(null); setErrorMsg(''); } }
                catch { /* ignore non-URL drops */ }
              } catch {}
            }}
          >
            <div className="absolute inset-0 rounded-2xl blur-xl wave-bg"></div>
            <div className="relative bg-white/5 backdrop-blur-md rounded-2xl p-6 border border-white/10">
              <div className="flex gap-3">
                <div className="flex-1 relative">
                  <input
                    type="text"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    placeholder="Paste video/playlist URL here..."
                    className="w-full px-4 py-4 bg-white/5 border border-white/10 rounded-xl text-slate-200 placeholder-slate-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/25 transition-all duration-300 outline-none"
                    ref={urlInputRef}
                  />
                  {url && (
                    <button
                      onClick={handleClear}
                      className="absolute right-3 top-1/2 transform -translate-y-1/2 p-1 hover:bg-white/10 rounded-full transition-colors duration-200"
                    >
                      <Trash2 className="w-4 h-4 text-slate-400" />
                    </button>
                  )}
                </div>
                <button
                  onClick={handlePaste}
                  className="px-6 py-4 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl transition-all duration-300 text-slate-200 hover:shadow-lg active:scale-95"
                >
                  <Clipboard className="w-5 h-5" />
                </button>
                <button
                  onClick={async () => { try { await (window as any).api?.setSettings?.({ pauseNewJobs: !ipcPaused }); } catch {} }}
                  className={`ml-2 text-xs px-2 py-1 rounded-full border ${ipcPaused ? 'text-yellow-300 border-yellow-500/30 bg-yellow-500/10 hover:bg-yellow-500/20' : 'text-emerald-300 border-emerald-500/30 bg-emerald-500/10 hover:bg-emerald-500/20'}`}
                  title="Toggle pause new jobs"
                >
                  {ipcPaused ? 'Resume new jobs' : 'Pause new jobs'}
                </button>
                <button
                  onClick={handleAnalyze}
                  disabled={!url.trim() || isAnalyzing}
                  className="px-8 py-4 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 disabled:from-slate-600 disabled:to-slate-600 text-white font-semibold rounded-xl transition-all duration-300 shadow-lg hover:shadow-xl disabled:cursor-not-allowed active:scale-95 min-w-[120px] flex items-center justify-center gap-2"
                >
                  {isAnalyzing ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                      Analyzing...
                    </>
                  ) : (
                    <>
                      <Search className="w-5 h-5" />
                      Analyze
                    </>
                  )}
                </button>
              </div>
              {errorMsg && (
                <div className="mt-3 px-3 py-2 rounded-lg border border-red-500/30 bg-red-500/10 text-red-300 text-sm">
                  {errorMsg}
                </div>
              )}
            </div>
          </div>
  </div>

  {/* Main Tab Navigation (aligned with URL panel) */}
  <div className="mb-2 w-full">{/* reduced gap for near-merged seam */}
          <div className="relative">
            <div className="absolute inset-0 rounded-2xl blur-xl wave-bg"></div>
            <div className="relative bg-white/5 backdrop-blur-md rounded-t-2xl rounded-b-xl p-2 border border-white/10 border-b-0">
              <div className="grid grid-cols-5 gap-2 w-full">
              <button
                onClick={() => setActiveMainTab('download')}
                className={`flex items-center justify-center gap-2 px-6 py-3 rounded-xl font-medium transition-all duration-300 ${
                  activeMainTab === 'download'
                    ? 'bg-gradient-to-r from-blue-600 to-purple-600 text-white shadow-lg shadow-blue-500/25'
                    : 'text-white/60 hover:text-white hover:bg-white/10'
                }`}
              >
                <Monitor className="w-5 h-5" />
                Download
              </button>
              <button
                onClick={() => setActiveMainTab('queue')}
                className={`flex items-center justify-center gap-2 px-6 py-3 rounded-xl font-medium transition-all duration-300 ${
                  activeMainTab === 'queue'
                    ? 'bg-gradient-to-r from-indigo-600 to-fuchsia-600 text-white shadow-lg shadow-indigo-500/25'
                    : 'text-white/60 hover:text-white hover:bg-white/10'
                }`}
              >
                <Clock className="w-5 h-5" />
                Queue
                {jobsMetrics && jobsMetrics.queued > 0 && (
                  <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded-full border border-fuchsia-500/40 bg-fuchsia-500/15 text-fuchsia-200">
                    {jobsMetrics.queued}
                  </span>
                )}
              </button>
              <button
                onClick={() => setActiveMainTab('batch')}
                className={`flex items-center justify-center gap-2 px-6 py-3 rounded-xl font-medium transition-all duration-300 ${
                  activeMainTab === 'batch'
                    ? 'bg-gradient-to-r from-blue-700 to-purple-700 text-white shadow-lg shadow-blue-500/25'
                    : 'text-white/60 hover:text-white hover:bg-white/10'
                }`}
              >
                <Download className="w-5 h-5" />
                Batch
              </button>
              <button
                onClick={() => setActiveMainTab('history')}
                className={`flex items-center justify-center gap-2 px-6 py-3 rounded-xl font-medium transition-all duration-300 ${
                  activeMainTab === 'history'
                    ? 'bg-gradient-to-r from-indigo-600 to-fuchsia-600 text-white shadow-lg shadow-indigo-500/25'
                    : 'text-white/60 hover:text-white hover:bg-white/10'
                }`}
              >
                <HistoryIcon className="w-5 h-5" />
                History
                {jobsMetrics && (jobsMetrics.running > 0 || jobsMetrics.queued > 0) && (
                  <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded-full border border-fuchsia-500/40 bg-fuchsia-500/15 text-fuchsia-200">
                    {jobsMetrics.running} / {jobsMetrics.queued}
                  </span>
                )}
              </button>
              
              <button
                onClick={() => setActiveMainTab('settings')}
                className={`flex items-center justify-center gap-2 px-6 py-3 rounded-xl font-medium transition-all duration-300 ${
                  activeMainTab === 'settings'
                    ? 'bg-gradient-to-r from-blue-600 to-cyan-600 text-white shadow-lg shadow-blue-500/25'
                    : 'text-white/60 hover:text-white hover:bg-white/10'
                }`}
              >
                <Settings className="w-5 h-5" />
                Settings
              </button>
              </div>
            </div>
          </div>
  </div>

        {/* Tab Content */}
    <div className="animate-in slide-in-from-bottom-4 duration-700">
          {activeMainTab === 'download' && !isAnalyzed && (
            <div className="relative">
              <div className="absolute inset-0 rounded-2xl blur-xl wave-bg" />
  <div className="relative bg-white/5 backdrop-blur-md rounded-b-2xl rounded-t-xl p-6 border border-white/10 border-t-0 min-h-[calc(100vh-360px)]">
                <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-4 gap-6">
                  <ThumbnailSection />
                  <VideoSection />
                  <AudioSection />
                  <OptionsSection />
                </div>
              </div>
            </div>
          )}

          {activeMainTab === 'download' && isAnalyzed && analysisJson && (
            <div className="relative">
              <div className="absolute inset-0 rounded-2xl blur-xl wave-bg" />
              <div className="relative bg-white/5 backdrop-blur-md rounded-b-2xl rounded-t-xl p-6 border border-white/10 border-t-0 min-h-[calc(100vh-360px)]">
                <AnalysisResults onBack={() => setIsAnalyzed(false)} analyzedUrl={url} json={analysisJson} />
              </div>
            </div>
          )}

      {activeMainTab === 'history' && (
            <div className="relative">
              <div className="absolute inset-0 rounded-2xl blur-xl wave-bg" />
  <div className="relative bg-white/5 backdrop-blur-md rounded-b-2xl rounded-t-xl p-6 border border-white/10 border-t-0 min-h-[calc(100vh-360px)]">
                <HistoryTab />
              </div>
            </div>
          )}

      {activeMainTab === 'queue' && (
            <div className="relative">
              <div className="absolute inset-0 rounded-2xl blur-xl wave-bg" />
  <div className="relative bg-white/5 backdrop-blur-md rounded-b-2xl rounded-t-xl p-6 border border-white/10 border-t-0 min-h-[calc(100vh-360px)]">
                <QueueTab />
              </div>
            </div>
          )}

          

      {activeMainTab === 'batch' && (
            <div className="relative">
              <div className="absolute inset-0 rounded-2xl blur-xl wave-bg" />
  <div className="relative bg-white/5 backdrop-blur-md rounded-b-2xl rounded-t-xl p-6 border border-white/10 border-t-0 min-h-[calc(100vh-360px)]">
                <BatchTab />
              </div>
            </div>
          )}

      {activeMainTab === 'settings' && (
            <div className="relative">
              <div className="absolute inset-0 rounded-2xl blur-xl wave-bg" />
  <div className="relative bg-white/5 backdrop-blur-md rounded-b-2xl rounded-t-xl p-6 border border-white/10 border-t-0 min-h-[calc(100vh-360px)]">
                <SettingsTab />
              </div>
            </div>
          )}
        </div>
  </div>
      </div>
    </div>
  </div>
</div>
  );
}

export default App;