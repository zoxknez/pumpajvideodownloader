'use client';

import { useState, useCallback } from 'react';
import { Search, Loader } from 'lucide-react';
import { analyzeUrl, mapToVideoAnalysis, mapToAudioAnalysis, mapToThumbnails } from '@/lib/api-desktop';
import { AnalysisResults } from './downloader/AnalysisResults';

const panel = 'rounded-2xl border border-white/10 bg-white/[0.06] backdrop-blur-xl shadow-[0_12px_40px_rgba(2,6,23,0.35)]';

export default function DesktopApp() {
  const [url, setUrl] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analyzedData, setAnalyzedData] = useState<any | null>(null);
  const [error, setError] = useState('');

  const handleAnalyze = useCallback(async () => {
    const trimmed = url.trim();
    if (!trimmed) return;
    
    setIsAnalyzing(true);
    setError('');
    setAnalyzedData(null);
    
    try {
      const result = await analyzeUrl(trimmed);
      const videoData = mapToVideoAnalysis(result);
      const audioData = mapToAudioAnalysis(result);
      const thumbData = mapToThumbnails(result);
      
      setAnalyzedData({ video: videoData, audio: audioData, thumbnails: thumbData, raw: result });
    } catch (err: any) {
      setError(err?.message || 'Analysis failed');
    } finally {
      setIsAnalyzing(false);
    }
  }, [url]);

  const handleBack = useCallback(() => {
    setAnalyzedData(null);
    setError('');
  }, []);

  return (
    <div className="min-h-screen p-6 space-y-6 text-white">
      {!analyzedData && (
        <>
          {/* Header */}
          <div className={`${panel} p-6`}>
            <div className="flex items-center gap-4">
              <img src="/pumpaj-192.png?v=3" alt="Pumpaj" className="h-16 w-16 rounded-xl" />
              <div>
                <h1 className="text-3xl font-black tracking-tight">
                  Pumpaj <span className="text-white/90">Media Downloader</span>
                </h1>
                <p className="text-sm text-white/60">Desktop-style Analysis Interface</p>
              </div>
            </div>
          </div>

          {/* Input Section */}
          <div className={`${panel} p-6`}>
            <div className="flex items-center gap-3">
              <div className="flex-1 relative">
                <input
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !isAnalyzing && url.trim()) handleAnalyze();
                  }}
                  placeholder="Paste video URL here..."
                  className="w-full rounded-xl border border-white/12 bg-white/[0.05] px-5 py-4 text-white placeholder-white/60 outline-none focus:border-blue-400/60 focus:ring-2 focus:ring-blue-500/20"
                />
              </div>
              <button
                onClick={handleAnalyze}
                disabled={isAnalyzing || !url.trim()}
                className={`rounded-xl px-8 py-4 font-semibold text-white transition flex items-center gap-2 ${
                  isAnalyzing || !url.trim()
                    ? 'bg-slate-600 cursor-not-allowed'
                    : 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500'
                }`}
              >
                {isAnalyzing ? (
                  <>
                    <Loader className="w-5 h-5 animate-spin" />
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
            
            {error && (
              <div className="mt-4 p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-red-300">
                {error}
              </div>
            )}
          </div>
        </>
      )}

      {/* Analysis Results */}
      {analyzedData && (
        <AnalysisResults
          onBack={handleBack}
          analyzedUrl={url}
          json={analyzedData.raw}
        />
      )}
    </div>
  );
}
