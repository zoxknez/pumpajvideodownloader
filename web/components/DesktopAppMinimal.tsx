'use client';

import { useState, useCallback } from 'react';
import { Search, Loader } from 'lucide-react';
import { analyzeUrl, mapToVideoAnalysis, mapToAudioAnalysis, mapToThumbnails } from '@/lib/api-desktop';

const panel = 'rounded-2xl border border-white/10 bg-white/[0.06] backdrop-blur-xl shadow-[0_12px_40px_rgba(2,6,23,0.35)]';

export default function DesktopAppMinimal() {
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

  return (
    <div className="min-h-screen p-6 space-y-6 text-white">
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

      {/* Results */}
      {analyzedData && (
        <div className={`${panel} p-6`}>
          <h2 className="text-2xl font-bold mb-4">Analysis Complete ✅</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Video Card */}
            <div className="bg-white/5 rounded-xl p-4 border border-white/10">
              <h3 className="text-lg font-bold mb-2 text-blue-300">🎬 Video</h3>
              <div className="text-sm space-y-1 text-white/80">
                <p><strong>Title:</strong> {analyzedData.video.videoTitle}</p>
                <p><strong>Duration:</strong> {analyzedData.video.duration}</p>
                <p><strong>Formats:</strong> {analyzedData.video.formats.length}</p>
                <p><strong>Max Resolution:</strong> {analyzedData.video.originalResolution}</p>
                <p><strong>HDR:</strong> {analyzedData.video.hasHDR ? 'Yes' : 'No'}</p>
              </div>
            </div>

            {/* Audio Card */}
            <div className="bg-white/5 rounded-xl p-4 border border-white/10">
              <h3 className="text-lg font-bold mb-2 text-purple-300">🎧 Audio</h3>
              <div className="text-sm space-y-1 text-white/80">
                <p><strong>Duration:</strong> {analyzedData.audio.duration}</p>
                <p><strong>Formats:</strong> {analyzedData.audio.audioFormats.length}</p>
                <p><strong>Artist:</strong> {analyzedData.audio.metadata.artist || 'Unknown'}</p>
              </div>
            </div>

            {/* Thumbnails Card */}
            <div className="bg-white/5 rounded-xl p-4 border border-white/10">
              <h3 className="text-lg font-bold mb-2 text-yellow-300">🖼️ Thumbnails</h3>
              <div className="text-sm space-y-1 text-white/80">
                <p><strong>Available:</strong> {analyzedData.thumbnails.thumbnails.length}</p>
                <p><strong>Resolution:</strong> {analyzedData.thumbnails.originalResolution}</p>
                <p><strong>Multiple:</strong> {analyzedData.thumbnails.hasMultipleThumbnails ? 'Yes' : 'No'}</p>
              </div>
            </div>
          </div>

          {/* Formats Preview */}
          {analyzedData.video.formats.length > 0 && (
            <div className="mt-6">
              <h3 className="text-xl font-bold mb-3">Available Video Formats</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {analyzedData.video.formats.slice(0, 6).map((fmt: any, i: number) => (
                  <div key={i} className="bg-white/5 rounded-lg p-3 border border-white/10">
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-semibold text-white">{fmt.quality}</span>
                      {fmt.badge && (
                        <span className="px-2 py-0.5 text-xs rounded-full bg-blue-500/20 text-blue-300">
                          {fmt.badge.toUpperCase()}
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-white/60 space-y-0.5">
                      <p>{fmt.format} • {fmt.resolution}</p>
                      <p>{fmt.fileSize}</p>
                      {fmt.fps && <p>{fmt.fps} FPS</p>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
