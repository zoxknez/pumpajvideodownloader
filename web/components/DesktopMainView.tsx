'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Download, Search, Clipboard, Trash2, Sparkles, Info, Monitor, History as HistoryIcon, Clock, MessageCircle, X } from 'lucide-react';

// Import sections (will create these next)
import { ThumbnailSection } from './downloader/ThumbnailSection';
import { VideoSection } from './downloader/VideoSection';
import { AudioSection } from './downloader/AudioSection';
import { OptionsSection } from './downloader/OptionsSection';
import { AnalysisResults } from './downloader/AnalysisResults';

// Import from existing components
import HistoryView from '@/components/HistoryView';
import QueueView from '@/components/QueueView';
import SettingsView from '@/components/SettingsView';
import dynamic from 'next/dynamic';
const AboutView = dynamic(() => import('@/components/AboutView'), { ssr: false });

// API
import { analyzeUrl } from '@/lib/api-desktop';
import { useAuth } from '@/components/AuthProvider';

type MainTab = 'analyze' | 'downloading' | 'history' | 'settings' | 'about';

export default function DesktopApp() {
  const [url, setUrl] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isAnalyzed, setIsAnalyzed] = useState(false);
  const [analysisJson, setAnalysisJson] = useState<any | null>(null);
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [activeMainTab, setActiveMainTab] = useState<MainTab>('analyze');
  const [apiOnline, setApiOnline] = useState<boolean | null>(null);
  const [showInfoModal, setShowInfoModal] = useState(false);
  const urlInputRef = useRef<HTMLInputElement | null>(null);
  
  const { me } = useAuth();
  const apiBase = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:5176';

  // Restore persisted UI state
  useEffect(() => {
    try {
      const savedUrl = localStorage.getItem('app:url');
      const savedTab = localStorage.getItem('app:activeTab') as MainTab | null;
      if (savedUrl) setUrl(savedUrl);
      if (savedTab && ['analyze','downloading','history','settings','about'].includes(savedTab)) {
        setActiveMainTab(savedTab);
      }
    } catch {}
  }, []);

  // Persist URL and active tab
  useEffect(() => {
    try { localStorage.setItem('app:url', url); } catch {}
  }, [url]);
  useEffect(() => {
    try { localStorage.setItem('app:activeTab', activeMainTab); } catch {}
  }, [activeMainTab]);

  // Backend health poll
  useEffect(() => {
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
  }, [apiBase]);

  // Global keyboard shortcuts: Enter to Analyze, Ctrl+1..5 to switch tabs
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (document.activeElement?.tagName || '').toLowerCase();
      const isInputLike = tag === 'input' || tag === 'textarea' || (document.activeElement as any)?.isContentEditable;
      
      // Ctrl+1..5 to switch tabs
      if (e.ctrlKey && !e.shiftKey && !e.altKey) {
        const key = e.key;
        if (key >= '1' && key <= '5') {
          const map: Record<string, MainTab> = { 
            '1': 'analyze', 
            '2': 'downloading', 
            '3': 'settings', 
            '4': 'history', 
            '5': 'about' 
          };
          const target = map[key];
          if (target) { 
            setActiveMainTab(target); 
            e.preventDefault(); 
            return; 
          }
        }
      }
      
      // Enter to Analyze when on Analyze tab
      if (!e.ctrlKey && !e.altKey && !e.metaKey && e.key === 'Enter') {
        if (activeMainTab === 'analyze' && !isAnalyzing && url.trim()) {
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
  }, [activeMainTab, isAnalyzing, url]);

  const handleAnalyze = useCallback(async () => {
    if (!url.trim()) return;
    
    setErrorMsg('');
    setIsAnalyzing(true);
    try {
      const json = await analyzeUrl(url.trim());
      setAnalysisJson(json);
      setIsAnalyzed(true);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Analiza nije uspela. Proveri URL i server.';
      console.error(msg);
      setErrorMsg(msg);
    } finally {
      setIsAnalyzing(false);
    }
  }, [url]);

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

      {/* Corner glow vignette */}
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

      {/* Subtle dark vignette */}
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
        {/* Offline Notice */}
        {apiOnline === false && (
          <div className="mb-4 px-4 py-2 rounded-lg border border-red-500/30 bg-red-500/10 text-red-300 text-sm">
            Backend server appears offline. Ensure it's running at {apiBase}.
          </div>
        )}

        {/* Main content framed wrapper */}
        <div className="relative">
          {/* Soft inner frame */}
          <div className="pointer-events-none absolute -inset-y-2 sm:-inset-y-3 md:-inset-y-4 lg:-inset-y-6 -inset-x-[2px] sm:-inset-x-[6px] md:-inset-x-[8px] lg:-inset-x-[10px] z-0">
            <div className="absolute inset-0 rounded-[34px] border border-white/10 shadow-[0_10px_40px_rgba(0,0,0,0.30),_inset_0_0_80px_rgba(255,255,255,0.04),_inset_0_0_120px_rgba(0,0,0,0.25)]"></div>
            <div className="absolute -inset-y-[2px] -inset-x-[1px] sm:-inset-x-[2px] md:-inset-x-[3px] lg:-inset-x-[4px] rounded-[36px] bg-gradient-to-r from-blue-500/20 via-fuchsia-500/14 to-cyan-500/20 opacity-15 blur-md"></div>
          </div>

          <div className="relative z-10">
            {/* Shared content width wrapper */}
            <div className="mx-auto max-w-[1200px] 2xl:max-w-[1400px]">
              {/* Header */}
              <div className="text-center mb-6">
                <div className="relative">
                  <div className="absolute inset-0 rounded-2xl blur-xl wave-bg"></div>
                  <div className="relative bg-white/5 backdrop-blur-md rounded-2xl p-3 border border-white/10">
                    {/* Title Row */}
                    <div className="flex items-center justify-center gap-3 mb-3">
                      <img src="/pumpaj-128.png" alt="Pumpaj" className="w-12 h-12 drop-shadow-2xl" />
                      <h1 className="text-2xl md:text-3xl font-bold text-white">
                        Video{' '}
                        <span className="px-2 py-0.5 bg-green-500 text-white text-sm rounded-md">PRO</span>{' '}
                        Downloader
                      </h1>
                    </div>

                    {/* Feature Badges */}
                    <div className="flex items-center justify-center gap-3 flex-wrap">
                      <div className="flex items-center gap-2 px-3 py-1.5 bg-orange-500/10 border border-orange-500/30 rounded-lg">
                        <span className="text-lg">⚡</span>
                        <span className="text-xs font-semibold text-white">100+ PLATFORMS</span>
                      </div>
                      
                      <div className="flex items-center gap-2 px-3 py-1.5 bg-purple-500/10 border border-purple-500/30 rounded-lg">
                        <span className="text-lg">🎵</span>
                        <span className="text-xs font-semibold text-white">8K QUALITY</span>
                      </div>
                      
                      <div className="flex items-center gap-2 px-3 py-1.5 bg-pink-500/10 border border-pink-500/30 rounded-lg">
                        <span className="text-lg">🚀</span>
                        <span className="text-xs font-semibold text-white">UNLIMITED SPEED</span>
                      </div>
                      
                      <div className="flex items-center gap-2 px-3 py-1.5 bg-gradient-to-r from-purple-500/20 to-pink-500/20 border border-purple-400/40 rounded-lg">
                        <span className="text-lg">✨</span>
                        <span className="text-xs font-semibold text-white">FREE PREMIUM</span>
                        <span className="text-lg">✨</span>
                      </div>
                      
                      {/* Donate Badge - Larger */}
                      <div className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-yellow-500/20 to-orange-500/20 border-2 border-yellow-400/50 rounded-lg hover:scale-105 transition-transform cursor-pointer">
                        <span className="text-xl">❤️</span>
                        <span className="text-sm font-bold text-yellow-300">DONATE</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              {/* URL Input Section */}
              <div className="w-full mb-4">
                <div
                  className="relative"
                  onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
                  onDrop={(e) => {
                    try {
                      e.preventDefault(); 
                      e.stopPropagation();
                      const dt = e.dataTransfer; 
                      if (!dt) return;
                      const urlText = dt.getData('text/uri-list') || dt.getData('text/plain') || '';
                      const t = urlText.trim(); 
                      if (!t) return;
                      try { 
                        const u = new URL(t); 
                        if (u.protocol === 'http:' || u.protocol === 'https:') { 
                          setUrl(t); 
                          setIsAnalyzed(false); 
                          setAnalysisJson(null); 
                          setErrorMsg(''); 
                        } 
                      } catch { /* ignore non-URL drops */ }
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
                        onClick={handleAnalyze}
                        disabled={isAnalyzing}
                        className="px-8 py-4 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 text-white font-semibold rounded-xl transition-all duration-300 shadow-lg hover:shadow-xl active:scale-95 min-w-[120px] flex items-center justify-center gap-2"
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

              {/* Main Tab Navigation */}
              <div className="mb-2 w-full">
                <div className="relative">
                  <div className="absolute inset-0 rounded-2xl blur-xl wave-bg"></div>
                  <div className="relative bg-white/5 backdrop-blur-md rounded-t-2xl rounded-b-xl p-2 border border-white/10 border-b-0">
                    <div className="grid grid-cols-5 gap-2 w-full">
                      <button
                        onClick={() => setActiveMainTab('analyze')}
                        className={`flex items-center justify-center gap-2 px-6 py-3 rounded-xl font-medium transition-all duration-300 ${
                          activeMainTab === 'analyze'
                            ? 'bg-gradient-to-r from-blue-600 to-purple-600 text-white shadow-lg shadow-blue-500/25'
                            : 'text-white/60 hover:text-white hover:bg-white/10'
                        }`}
                      >
                        <Search className="w-5 h-5" />
                        Analyze
                      </button>
                      <button
                        onClick={() => setActiveMainTab('downloading')}
                        className={`flex items-center justify-center gap-2 px-6 py-3 rounded-xl font-medium transition-all duration-300 ${
                          activeMainTab === 'downloading'
                            ? 'bg-gradient-to-r from-indigo-600 to-fuchsia-600 text-white shadow-lg shadow-indigo-500/25'
                            : 'text-white/60 hover:text-white hover:bg-white/10'
                        }`}
                      >
                        <Download className="w-5 h-5" />
                        Downloading
                      </button>
                      <button
                        onClick={() => setActiveMainTab('settings')}
                        className={`flex items-center justify-center gap-2 px-6 py-3 rounded-xl font-medium transition-all duration-300 ${
                          activeMainTab === 'settings'
                            ? 'bg-gradient-to-r from-blue-700 to-purple-700 text-white shadow-lg shadow-blue-500/25'
                            : 'text-white/60 hover:text-white hover:bg-white/10'
                        }`}
                      >
                        <Monitor className="w-5 h-5" />
                        Settings
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
                      </button>
                      <button
                        onClick={() => setActiveMainTab('about')}
                        className={`flex items-center justify-center gap-2 px-6 py-3 rounded-xl font-medium transition-all duration-300 ${
                          activeMainTab === 'about'
                            ? 'bg-gradient-to-r from-blue-600 to-cyan-600 text-white shadow-lg shadow-blue-500/25'
                            : 'text-white/60 hover:text-white hover:bg-white/10'
                        }`}
                      >
                        <Info className="w-5 h-5" />
                        About
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Tab Content */}
              <div className="animate-in slide-in-from-bottom-4 duration-700">
                {activeMainTab === 'analyze' && !isAnalyzed && (
                  <div className="relative">
                    <div className="absolute inset-0 rounded-2xl blur-xl wave-bg" />
                    <div className="relative bg-white/5 backdrop-blur-md rounded-b-2xl rounded-t-xl p-6 border border-white/10 border-t-0 min-h-[calc(100vh-360px)]">
                      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-4 gap-6">
                        <ThumbnailSection />
                        <VideoSection onDownloadStart={() => setActiveMainTab('downloading')} />
                        <AudioSection onDownloadStart={() => setActiveMainTab('downloading')} />
                        <OptionsSection />
                      </div>
                    </div>
                  </div>
                )}

                {activeMainTab === 'analyze' && isAnalyzed && analysisJson && (
                  <div className="relative">
                    <div className="absolute inset-0 rounded-2xl blur-xl wave-bg" />
                    <div className="relative bg-white/5 backdrop-blur-md rounded-b-2xl rounded-t-xl p-6 border border-white/10 border-t-0 min-h-[calc(100vh-360px)]">
                      <AnalysisResults 
                        onBack={() => setIsAnalyzed(false)} 
                        analyzedUrl={url} 
                        json={analysisJson}
                        onDownloadStart={() => setActiveMainTab('downloading')}
                      />
                    </div>
                  </div>
                )}

                {activeMainTab === 'history' && (
                  <div className="relative">
                    <div className="absolute inset-0 rounded-2xl blur-xl wave-bg" />
                    <div className="relative bg-white/5 backdrop-blur-md rounded-b-2xl rounded-t-xl p-6 border border-white/10 border-t-0 min-h-[calc(100vh-360px)]">
                      <HistoryView />
                    </div>
                  </div>
                )}

                {activeMainTab === 'downloading' && (
                  <div className="relative">
                    <div className="absolute inset-0 rounded-2xl blur-xl wave-bg" />
                    <div className="relative bg-white/5 backdrop-blur-md rounded-b-2xl rounded-t-xl p-6 border border-white/10 border-t-0 min-h-[calc(100vh-360px)]">
                      <QueueView />
                    </div>
                  </div>
                )}

                {activeMainTab === 'settings' && (
                  <div className="relative">
                    <div className="absolute inset-0 rounded-2xl blur-xl wave-bg" />
                    <div className="relative bg-white/5 backdrop-blur-md rounded-b-2xl rounded-t-xl p-6 border border-white/10 border-t-0 min-h-[calc(100vh-360px)]">
                      <SettingsView />
                    </div>
                  </div>
                )}

                {activeMainTab === 'about' && (
                  <div className="relative">
                    <div className="absolute inset-0 rounded-2xl blur-xl wave-bg" />
                    <div className="relative bg-white/5 backdrop-blur-md rounded-b-2xl rounded-t-xl p-6 border border-white/10 border-t-0 min-h-[calc(100vh-360px)]">
                      <AboutView />
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Pumpaj Message Modal (English) */}
      {showInfoModal && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
          onClick={() => setShowInfoModal(false)}
        >
          <style dangerouslySetInnerHTML={{
            __html: `
              @keyframes redPulse {
                0%, 100% {
                  background-color: rgba(147, 51, 234, 0.3);
                  border-color: rgba(168, 85, 247, 0.5);
                  box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
                }
                50% {
                  background-color: rgba(220, 38, 38, 0.4);
                  border-color: rgba(248, 113, 113, 0.7);
                  box-shadow: 0 25px 50px -12px rgba(220, 38, 38, 0.4), 0 0 30px rgba(248, 113, 113, 0.6);
                }
              }
            `
          }} />
          <div 
            className="relative max-w-2xl w-full max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="absolute inset-0 rounded-2xl blur-xl opacity-50" style={{ background: 'linear-gradient(135deg, rgba(147, 51, 234, 0.3), rgba(220, 38, 38, 0.3))' }}></div>
            <div className="relative bg-gradient-to-br from-slate-900/98 via-purple-900/98 to-slate-900/98 backdrop-blur-md rounded-2xl p-8 border-2 shadow-2xl" style={{ animation: 'redPulse 3s ease-in-out infinite' }}>
              <button
                onClick={() => setShowInfoModal(false)}
                className="absolute top-4 right-4 p-2 hover:bg-white/10 rounded-full transition-colors text-slate-300 hover:text-white"
              >
                <X className="w-6 h-6" />
              </button>
              
              <div className="text-center mb-6">
                <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full mb-4" style={{ animation: 'redPulse 3s ease-in-out infinite' }}>
                  <MessageCircle className="w-5 h-5" />
                  <span className="text-sm font-bold uppercase tracking-wider">PUMPAJ Message</span>
                </div>
                <h2 className="text-4xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-purple-300 to-red-300">
                  A movement amplifying the truth
                </h2>
              </div>

              <div className="space-y-6 text-slate-200">
                {/* What is PUMPAJ? */}
                <div>
                  <h3 className="text-xl font-bold text-purple-300 mb-3">What is PUMPAJ?</h3>
                  <p className="text-base leading-relaxed mb-2">
                    PUMPAJ means: amplify the truth and the tempo. Don't stop. Keep the pace and stay persistent.
                  </p>
                  <p className="text-base leading-relaxed">
                    It's our short call for perseverance and a better future.
                  </p>
                </div>

                {/* Why do we protest? */}
                <div>
                  <h3 className="text-xl font-bold text-red-300 mb-3">Why do we protest?</h3>
                  <div className="space-y-2 text-sm">
                    <p className="font-semibold text-red-200">
                      Novi Sad, Nov 1, 2024 – the collapse of the railway station canopy, where 16 people were killed.
                    </p>
                    <p>We demand the full truth and the prosecution of those responsible for this crime.</p>
                    <p>Corruption and lawlessness – rigged contracts, disastrous workmanship, and abuses at every step.</p>
                    <p>We demand a state governed by the rule of law, not by crime.</p>
                  </div>
                </div>

                {/* Our call */}
                <div className="border-l-4 border-purple-400/50 pl-4 py-3 bg-purple-500/10 rounded-r">
                  <h3 className="text-xl font-bold text-purple-300 mb-2">Our call</h3>
                  <p className="text-lg font-semibold text-purple-100">
                    PUMPAJ = justice, accountability, and equality for all.
                  </p>
                </div>
              </div>

              <button
                onClick={() => setShowInfoModal(false)}
                className="mt-8 w-full px-6 py-3 bg-gradient-to-r from-purple-600 to-red-600 hover:from-purple-700 hover:to-red-700 rounded-xl text-white font-bold transition-all duration-300 shadow-lg"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
