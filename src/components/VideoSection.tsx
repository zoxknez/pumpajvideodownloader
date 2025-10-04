import React, { useEffect, useRef, useState } from 'react';
import { DownloadCard } from './DownloadCard';
import { Video, Crown, Zap, Shield, Play } from '../lib/icons';
import { cancelJob, downloadJobFile, isJobFileReady, resolveFormatUrl, proxyDownload, startBestJob, subscribeJobProgress, jobFileUrl, ProxyDownloadError } from '../lib/api';
import { ipcAvailable, startIpcAdvanced, onProgressIpc, onDoneIpc, revealPath, openPath } from '../lib/downloader';
import { openPremiumUpgrade } from '../lib/premium';
import { useToast } from './ToastProvider';
import { usePolicy } from './AuthProvider';

export interface VideoSectionProps {
  analysisData?: {
  sourceUrl?: string;
    videoTitle: string;
    duration: string;
    originalResolution: string;
    maxFrameRate: number;
    videoCodec: string;
    audioCodec: string;
    hasHDR: boolean;
    fileSize: string;
  hasSubtitles?: boolean;
  subtitles?: Array<{ lang: string; ext: string; url: string; auto?: boolean; name?: string }>;
  hasChapters?: boolean;
  chapters?: Array<{ title?: string; start: number; end?: number }>;
  hasThumbnails?: boolean;
    formats: Array<{
      format: string; // "MP4", "WEBM", "MKV"
      quality: string; // "4K Ultra", "1080p FHD"
      resolution: string; // "3840x2160", "1920x1080"
      fileSize: string; // "2.8 GB", "950 MB"
      bitrate?: string; // "8000 kbps", "5000 kbps"
      fps?: number; // 60, 30, 24
      codec?: string; // "H.264", "VP9", "AV1"
  badge?: 'recommended' | 'fast' | 'optimized';
      isHdr?: boolean;
    }>;
  };
  onFormatSelect?: (formatIndex: number, formatData: any) => void;
}

export const VideoSection: React.FC<VideoSectionProps> = ({ analysisData, onFormatSelect }) => {
  // Phase 2 state (used only when analysisData exists)
  const [selectedFormat, setSelectedFormat] = useState(0);
  // no scroll containers; simple auto-height lists
  const [jobId, setJobId] = useState<string | null>(null);
  const [jobProgress, setJobProgress] = useState<number>(0);
  const [jobStage, setJobStage] = useState<string>('');
  // start button removed — no isStarting or live speed/ETA tracking
  const triedRef = useRef(false);
  const jobStartRef = useRef<number>(0);
  const directFallbackRef = useRef(false);
  const subRef = useRef<{ close: () => void } | null>(null);
  const { info, error: toastError } = useToast();
  const policy = usePolicy();
  const [completedPath, setCompletedPath] = useState<string | null>(null);


  // If we have analysis data, prepare Phase 2 rich UI without early return
  const videoView = analysisData ? (() => {
  const rawFormats = analysisData!.formats?.map((fmt: any) => ({
      url: (fmt as any).url,
      formatId: (fmt as any).formatId,
      format: fmt.format,
      quality: fmt.quality,
      size: fmt.fileSize,
      resolution: fmt.resolution,
      bitrate: fmt.bitrate,
      fps: fmt.fps,
      codec: fmt.codec,
      isHdr: fmt.isHdr,
      icon:
        fmt.badge === 'PREMIUM'
          ? Crown
          : fmt.badge === 'RECOMMENDED'
          ? Zap
          : fmt.badge === 'FAST'
          ? Shield
          : Play,
      badge: fmt.badge ? fmt.badge.toUpperCase() : undefined,
      color:
        fmt.badge === 'PREMIUM'
          ? 'from-yellow-500 to-orange-500'
          : fmt.badge === 'RECOMMENDED'
          ? 'from-green-500 to-emerald-500'
          : fmt.badge === 'FAST'
          ? 'from-blue-500 to-cyan-500'
          : 'from-purple-500 to-pink-500',
    }));

  // Helper: get numeric height from resolution/quality
  const parseHeight = (res?: string, quality?: string): number => {
      if (res && /x(\d+)/i.test(res)) {
        const m = res.match(/x(\d+)/i);
        if (m) return parseInt(m[1], 10);
      }
      if (quality && /(\d{3,4})p/i.test(quality)) {
        const m = quality.match(/(\d{3,4})p/i);
        if (m) return parseInt(m[1], 10);
      }
      return 0;
    };
  // Decide the best candidate inside the same height group
  const badgeScore = (b?: string) => (b === 'RECOMMENDED' ? 200 : b === 'FAST' ? 100 : 0);
  const formatScore = (f?: string) => (f === 'MP4' ? 5 : f === 'WEBM' ? 3 : 2);
  const codecScore = (c?: string) => (c?.toUpperCase().includes('H.264') ? 5 : c?.toUpperCase().includes('AV1') ? 4 : c?.toUpperCase().includes('VP9') ? 3 : 1);
  const qualityScore = (f: any) => badgeScore(f.badge) + (f.isHdr ? 20 : 0) + (f.fps || 0) + formatScore(f.format) + codecScore(f.codec);

  const uniqueFormats = (() => {
      const map = new Map<number, any>();
      (rawFormats || []).forEach((f) => {
        const h = parseHeight(f.resolution, f.quality);
        const curr = map.get(h);
        if (!curr) {
          map.set(h, f);
        } else {
          if (qualityScore(f) > qualityScore(curr)) map.set(h, f);
        }
      });
      // Sort by height descending (e.g., 2160, 1440, 1080, ...)
      return Array.from(map.entries())
        .sort((a, b) => b[0] - a[0])
        .map(([, f]) => f);
    })();

  // Cap to at most 4 tiers based on max available height
  const finalFormats = (() => {
    const byHeight = new Map<number, any>();
    const heights: number[] = [];
    (uniqueFormats || []).forEach((f) => {
      const h = parseHeight(f.resolution, f.quality);
      if (!byHeight.has(h)) {
        byHeight.set(h, f);
        heights.push(h);
      }
    });
    if (!heights.length) return [] as any[];
    heights.sort((a, b) => b - a);
    const maxH = heights[0];
    let desired: number[] = [];
    if (maxH >= 2160) desired = [480, 720, 1080, 2160];
    else if (maxH >= 1440) desired = [480, 720, 1080, 1440];
    else if (maxH >= 1080) desired = [360, 480, 720, 1080];
    else if (maxH >= 720) desired = [240, 360, 480, 720];
    else desired = heights.slice(0, 4).reverse(); // lowest to highest available if under 720

    const pickClosestAtOrBelow = (target: number) => {
      let bestH = -1;
      for (const h of heights) {
        if (h <= target && h > bestH) bestH = h;
      }
      if (bestH === -1) {
        // if none <= target, pick the smallest available
        bestH = heights[heights.length - 1];
      }
      return byHeight.get(bestH);
    };

    const out: any[] = [];
    const used = new Set<number>();
    desired.forEach((d) => {
      const chosen = pickClosestAtOrBelow(d);
      if (!chosen) return;
      const h = parseHeight(chosen.resolution, chosen.quality);
      if (used.has(h)) return;
      used.add(h);
      out.push(chosen);
    });
    // Ensure max 4 and sort by height descending for display
    return out
      .slice(0, 4)
      .sort((a, b) => parseHeight(b.resolution, b.quality) - parseHeight(a.resolution, a.quality));
  })();

  const handleFormatSelect = (index: number) => {
      setSelectedFormat(index);
      onFormatSelect?.(index, finalFormats?.[index]);
    };

  const handleStartDownload = async () => {
    if (!analysisData?.sourceUrl) return;
    const currentFormat = finalFormats?.[selectedFormat];
    if (currentFormat) {
      const curHeight = parseHeight(currentFormat.resolution, currentFormat.quality);
      if (policy.maxHeight > 0 && curHeight > policy.maxHeight) {
        toastError(
          `FREE plan podržava do ${policy.maxHeight}p. Odaberi nižu rezoluciju ili nadogradi nalog.`,
          'Premium feature',
          { actionLabel: 'Upgrade', onAction: () => openPremiumUpgrade('video-start-limit') }
        );
        const fallbackIndex = finalFormats.findIndex((fmt: any) => parseHeight(fmt.resolution, fmt.quality) <= policy.maxHeight);
        if (fallbackIndex >= 0) setSelectedFormat(fallbackIndex);
        return;
      }
    }
    try {
      // If running in Electron IPC mode, use yt-dlp directly via IPC and skip HTTP jobs
      if (ipcAvailable) {
        const id = crypto.randomUUID();
        try { subRef.current?.close?.(); } catch {}
        const offP = onProgressIpc((p) => {
          if (p?.id !== id) return;
          const j = p?.progress || {};
          const loaded = Number(j.downloaded_bytes || 0);
          const total = Number(j.total_bytes || j.total_bytes_estimate || 0);
          const pct = total > 0 ? Math.min(100, Math.round((loaded / total) * 100)) : (j.progress ? Math.round(Number(j.progress) * 100) : undefined);
          if (typeof pct === 'number' && Number.isFinite(pct)) setJobProgress(pct);
          setJobStage(j.status || 'downloading');
        });
  const offD = onDoneIpc((p) => { if (p?.id === id) { try { setCompletedPath(p?.filepath || null); } catch {}; setTimeout(() => { setJobId(null); setJobProgress(0); setJobStage(''); }, 300); try { offP?.(); offD?.(); } catch {} } });
        subRef.current = { close: () => { try { offP?.(); offD?.(); } catch {} } } as any;
        setJobId(id);
        setJobProgress(0);
        setJobStage('starting');
  const resp = await startIpcAdvanced({ id, url: analysisData.sourceUrl, outDir: 'Video', mode: 'video', format: 'best', title: analysisData.videoTitle });
        if (!resp?.ok) {
          try { subRef.current?.close?.(); } catch {}
          setJobId(null); setJobProgress(0); setJobStage('');
          const code = String(resp?.error || 'start_failed');
          const msg = code === 'ytdlp_missing' ? 'yt-dlp not found. Open Settings → System to check binaries.' : code === 'ffmpeg_missing' ? 'FFmpeg not found. Open Settings → System to check binaries.' : 'Failed to start download.';
          toastError(msg);
        }
        return;
      }
      // Start server-merged best job (server picks muxed best); UI still shows selected format for context
      const title = analysisData.videoTitle || 'video';
      const id = await startBestJob(analysisData.sourceUrl, title);
      setJobId(id);
      setJobProgress(0);
      setJobStage('starting');
      jobStartRef.current = Date.now();
      try { subRef.current?.close(); } catch {}
      subRef.current = subscribeJobProgress(
        id,
        (p) => {
          if (typeof p.progress === 'number') setJobProgress(p.progress);
          if (p.stage) setJobStage(p.stage);
        },
        async (status) => {
          if (status === 'completed') {
            try {
              await downloadJobFile(id);
            } catch (err: any) {
              if (err instanceof ProxyDownloadError) {
                const meta: string[] = [];
                if (err.proxyStatus) meta.push(`Proxy-Status: ${err.proxyStatus}`);
                if (err.requestId) meta.push(`Request ID: ${err.requestId}`);
                const hint = meta.length ? `Prijavi ovaj kod: ${meta.join(' | ')}` : '';
                toastError(hint ? `${err.message} ${hint}` : err.message);
              } else if (err?.name !== 'AbortError') {
                toastError('Download failed. Please try again.');
              }
              // As a last resort, open the file URL directly to trigger browser download
              try { window.location.href = jobFileUrl(id); } catch {}
            }
          }
          setTimeout(() => { setJobId(null); setJobProgress(0); setJobStage(''); }, 600);
        }
      );
      info('Download started');
  } catch {
      // Fallback to direct format download when job start fails
      try {
        const fmt: any = (analysisData.formats || [])[selectedFormat] || (analysisData.formats || [])[0];
        let url: string | undefined = fmt?.url;
        if (!url && fmt?.formatId && analysisData.sourceUrl) {
          url = await resolveFormatUrl(analysisData.sourceUrl, fmt.formatId) || undefined;
        }
        if (url) {
          const ext = String(fmt?.format || 'mp4').toLowerCase();
          const safeTitle = (analysisData.videoTitle || 'video').replace(/[^\w.-]+/g, '_') || 'video';
          const fname = `${safeTitle}_${fmt?.quality || 'best'}.${ext}`;
          await proxyDownload({ url, filename: fname });
        }
      } catch (err: any) {
        if (err?.name === 'AbortError') return;
        const msg = err instanceof ProxyDownloadError ? err.message : 'Download failed. Please try again.';
        toastError(msg);
      }
    }
  };

  const handleStartPreset = async (formatPreset: 'mp4' | 'webm') => {
    if (!analysisData?.sourceUrl) return;
    try {
      if (ipcAvailable) {
        const id = crypto.randomUUID();
        try { subRef.current?.close?.(); } catch {}
        const offP = onProgressIpc((p) => {
          if (p?.id !== id) return;
          const j = p?.progress || {};
          const loaded = Number(j.downloaded_bytes || 0);
          const total = Number(j.total_bytes || j.total_bytes_estimate || 0);
          const pct = total > 0 ? Math.min(100, Math.round((loaded / total) * 100)) : (j.progress ? Math.round(Number(j.progress) * 100) : undefined);
          if (typeof pct === 'number' && Number.isFinite(pct)) setJobProgress(pct);
          setJobStage(j.status || 'downloading');
        });
        const offD = onDoneIpc((p) => { if (p?.id === id) { try { setCompletedPath(p?.filepath || null); } catch {}; setTimeout(() => { setJobId(null); setJobProgress(0); setJobStage(''); }, 300); try { offP?.(); offD?.(); } catch {} } });
        subRef.current = { close: () => { try { offP?.(); offD?.(); } catch {} } } as any;
        setJobId(id);
        setJobProgress(0);
        setJobStage('starting');
        const ytFormat = formatPreset === 'mp4' ? 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best' : 'bestvideo[ext=webm]+bestaudio/best[ext=webm]/best';
        const resp = await startIpcAdvanced({ id, url: analysisData.sourceUrl, outDir: 'Video', mode: 'video', format: ytFormat, title: analysisData.videoTitle });
        if (!resp?.ok) {
          try { subRef.current?.close?.(); } catch {}
          setJobId(null); setJobProgress(0); setJobStage('');
        }
      }
    } catch {}
  };

  // removed prominent stats (quality/fps/codec) in compact layout

  // Quality list — no top resolution buttons

    return (
      <DownloadCard title="Video Formats" icon={Video} variant="flat">
        <div className="space-y-4">
          <div className="flex items-center justify-between text-xs text-white/60">
            <span>Plan: <span className="font-medium text-white/80">{policy.plan}</span></span>
            <span>Maks rez: <span className="text-white/80">{policy.maxHeight ? `${policy.maxHeight}p` : 'bez limita'}</span></span>
          </div>
          {/* Enhanced styling below */}

          {/* Compact: remove large info & stats; keep clean list below */}

  {/* Formats (non-scroll, limited to 4 representative options) */}
          <div className="relative">
    <div className="grid grid-cols-1 gap-2">
    {finalFormats?.map((format, index) => {
              const IconComponent = format.icon;
              const limitExceeded = (() => {
                const heightMatch = /x(\d+)/i.exec(format.resolution || '');
                const qualityMatch = /(\d{3,4})p/i.exec(format.quality || '');
                const height = heightMatch ? parseInt(heightMatch[1], 10) : qualityMatch ? parseInt(qualityMatch[1], 10) : 0;
                return policy.maxHeight > 0 && height > policy.maxHeight;
              })();
              return (
        <div
      key={format.formatId || format.url || `${format.format}-${format.quality}-${format.resolution}-${format.fps || ''}-${format.codec || ''}`}
                  className={`relative min-h-[84px] p-3 rounded-2xl border backdrop-blur-md transition-all duration-300 cursor-pointer
                    ${selectedFormat === index
                      ? 'bg-gradient-to-br from-blue-500/15 to-purple-500/10 border-blue-500/50 shadow-[0_10px_30px_-10px_rgba(59,130,246,0.6)]'
                      : 'bg-white/[0.06] border-white/10 hover:bg-white/[0.09] hover:border-white/20 hover:shadow-[0_10px_30px_-12px_rgba(0,0,0,0.5)]'}
                    ${limitExceeded ? 'opacity-80 ring-1 ring-yellow-500/40 cursor-not-allowed' : ''}
                  `}
                  onClick={() => {
                    if (limitExceeded) {
                      toastError(
                        `FREE plan podržava do ${policy.maxHeight}p. Nadogradnja otključava ${format.quality}.`,
                        'Premium feature',
                        { actionLabel: 'Upgrade', onAction: () => openPremiumUpgrade('video-quality-select') }
                      );
                      return;
                    }
                    handleFormatSelect(index);
                  }}
                >
                  {/* Inline badges instead of floating absolute */}

                  <div className="flex items-center justify-between pr-16">
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-xl bg-gradient-to-br ${format.color} shadow-lg shadow-black/20 ring-1 ring-white/10`}>
                        <IconComponent className="w-4 h-4 text-white drop-shadow-sm" />
                      </div>
                      <div>
                        <div className="text-[14px] font-semibold text-slate-100 flex items-center gap-2 flex-wrap">
                          {format.format} - {format.quality}
                          {format.fps && format.fps > 30 && (
                            <span className="text-[11px] text-green-300 font-bold">{format.fps}fps</span>
                          )}
                          {format.isHdr && (
                            <span className="px-1.5 py-0.5 text-[10px] font-bold rounded-full bg-gradient-to-r from-orange-500 to-red-500 text-white">HDR</span>
                          )}
                          {format.badge && (
                            <span className={`px-1.5 py-0.5 text-[10px] font-bold rounded-full bg-gradient-to-r ${format.color} text-white`}>
                              {format.badge}
                            </span>
                          )}
                        </div>
                        <div className="text-[12px] text-slate-300">
                          {format.resolution} • {format.size} • {format.bitrate || 'Auto bitrate'}
                        </div>
                        {format.codec && <div className="text-[11px] text-slate-300/80">Codec: {format.codec}</div>}
                        {limitExceeded && (
                          <div className="text-[11px] text-yellow-200/90">FREE plan preuzima do {policy.maxHeight}p (veća rezolucija biće automatski ograničena).</div>
                        )}
                      </div>
                    </div>
                    <div className="w-4 h-4 rounded-full border-2 border-slate-400/80 flex items-center justify-center">
                      {selectedFormat === index && <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse"></div>}
                    </div>
                  </div>
                </div>
              );
            })}
            </div>
          </div>

          {/* Tracks/Info removed — moved to Advance options */}

          {/* Download Best (server merge) */}
          {!jobId && (
            <div className="w-full pt-1">
              <button
                onClick={handleStartDownload}
                className="w-full px-4 py-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-purple-600 text-white font-medium border border-white/10 hover:scale-[1.01] hover:shadow-lg hover:shadow-blue-500/20 transition"
              >
                Download
              </button>
              <div className="grid grid-cols-2 gap-2 mt-2">
                <button onClick={() => handleStartPreset('mp4')} className="px-3 py-2 rounded-lg bg-white/10 hover:bg-white/20 border border-white/10 text-white text-xs">Best MP4</button>
                <button onClick={() => handleStartPreset('webm')} className="px-3 py-2 rounded-lg bg-white/10 hover:bg-white/20 border border-white/10 text-white text-xs">Best WEBM</button>
              </div>
            </div>
          )}
          <div className="w-full mb-2">
            {jobId ? (
              <div className="w-full p-3 rounded-lg border border-emerald-500/40 bg-emerald-500/10">
                  <div className="flex items-center justify-between mb-2 text-emerald-200 text-sm">
                    <span>{jobStage ? jobStage : 'working'}…</span>
                    <span>{Math.round(jobProgress)}%</span>
                  </div>
                <div className="w-full h-3 rounded bg-white/10 overflow-hidden">
                  <div className="h-3 bg-gradient-to-r from-emerald-500 to-green-500" style={{ width: `${jobProgress}%` }} />
                </div>
                {/* Cancel button removed */}
              </div>
            ) : null}
          </div>

          {/* Direct per-format download removed per request */}

          {/* Format Info removed per request */}

          {completedPath && (
            <div className="mt-2 p-3 rounded-lg border border-white/15 bg-white/5 flex items-center gap-2">
              <div className="text-white/80 text-sm flex-1 truncate">Saved: <span className="text-white/90">{completedPath}</span></div>
              <button onClick={() => { if (completedPath) revealPath(completedPath); }} className="px-3 py-1.5 text-xs rounded-lg bg-white/10 hover:bg-white/20 border border-white/20 text-white">Show in folder</button>
              <button onClick={() => { if (completedPath) openPath(completedPath); }} className="px-3 py-1.5 text-xs rounded-lg bg-white/10 hover:bg-white/20 border border-white/20 text-white">Open file</button>
              <button onClick={() => setCompletedPath(null)} className="px-2 py-1.5 text-xs rounded-lg bg-white/5 border border-white/10 text-white/70">Hide</button>
            </div>
          )}
        </div>
      </DownloadCard>
    );
  })() : null;

  // Fallback: while a job is active and stuck on working, poll the job file readiness via HEAD
  useEffect(() => {
    if (!jobId) return;
    let disposed = false;
    const id = jobId;
    const interval = setInterval(async () => {
      if (disposed || !id) return;
      if (triedRef.current) return;
      try {
        // Check readiness frequently after a short grace period
        const elapsed = Date.now() - (jobStartRef.current || Date.now());
        if (elapsed < 2000) return;
        const ready = await isJobFileReady(id);
        if (ready) {
          triedRef.current = true;
          void downloadJobFile(id).then(() => { /* optional toast is already shown in progress path */ }).catch(() => {});
        }
      } catch {}
    }, 1500);
    return () => { disposed = true; clearInterval(interval); };
  }, [jobId, jobStage, jobProgress]);

  // Fallback 2: if after ~30s there's still no visible progress, try direct format download via proxy and cancel the job
  useEffect(() => {
    if (!analysisData || !jobId) return;
    const data: any = analysisData;
    const started = jobStartRef.current || Date.now();
    const tick = setInterval(async () => {
      if (!jobId) { clearInterval(tick); return; }
      if (directFallbackRef.current) { clearInterval(tick); return; }
      const elapsed = Date.now() - started;
      if (elapsed > 30000 && (jobProgress ?? 0) < 1) {
        try {
          directFallbackRef.current = true;
          const fmt = (data.formats || [])[selectedFormat] || (data.formats || [])[0];
          let url: string | undefined = (fmt as any)?.url;
          if (!url && (fmt as any)?.formatId && data.sourceUrl) {
            url = await resolveFormatUrl(data.sourceUrl, (fmt as any).formatId) || undefined;
          }
          if (url) {
            info('Server merge slow, falling back to direct download…');
            const ext = String((fmt as any)?.format || 'mp4').toLowerCase();
            const safeTitle = (data.videoTitle || 'video').replace(/[^\w.-]+/g, '_') || 'video';
            const fname = `${safeTitle}_${(fmt as any)?.quality || 'best'}.${ext}`;
            await proxyDownload({ url, filename: fname });
            try { if (jobId) await cancelJob(jobId); } catch {}
            setTimeout(() => { setJobId(null); setJobProgress(0); setJobStage(''); }, 500);
          } else {
            directFallbackRef.current = false; // keep trying later
          }
        } catch (err: any) {
          directFallbackRef.current = false;
          if (err?.name === 'AbortError') return;
          const msg = err instanceof ProxyDownloadError ? err.message : 'Direct download fallback failed.';
          toastError(msg);
        }
      }
    }, 1500);
    return () => clearInterval(tick);
  }, [analysisData, jobId, selectedFormat, jobProgress, info, toastError]);

  // Render Phase 2 if present, otherwise Phase 1 default UI (no analysis yet)
  // Cleanup progress subscription on unmount
  useEffect(() => () => { try { subRef.current?.close(); } catch {} }, []);
  if (videoView) return videoView;
  return (
    <DownloadCard title="Video Downloads" icon={Video} variant="flat">
      <div className="space-y-4">
        {/* Hero Banner */}
        <div className="relative overflow-hidden rounded-xl bg-white/5 p-6 border border-white/10">
          <div className="absolute top-2 right-2">
            <Zap className="w-5 h-5 text-yellow-400 animate-pulse" />
          </div>
          <div className="text-center">
            <Play className="w-8 h-8 text-emerald-300 mx-auto mb-2 attention-icon icon-glow glow-emerald" />
            <h3 className="text-lg font-bold text-white mb-2">Quality Options</h3>
            <p className="text-sm text-emerald-200">Download videos in any format & quality</p>
          </div>
        </div>

        {/* Highlights */}
        <div className="grid grid-cols-2 gap-2">
          <div className="text-center p-3 rounded-lg bg-white/5 border border-white/10">
            <div className="text-xl font-extrabold text-emerald-300">4K</div>
            <div className="text-[11px] text-emerald-200">Ultra HD</div>
          </div>
          <div className="text-center p-3 rounded-lg bg-white/5 border border-white/10">
            <div className="text-sm font-bold text-cyan-200">All Formats</div>
            <div className="text-[11px] text-cyan-200/80">MP4 • WEBM • MKV</div>
          </div>
        </div>

        {/* Feature List (3 items) */}
        <div className="p-3 rounded-lg bg-white/5 border border-white/10">
          <div className="space-y-2 text-xs text-slate-300">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-green-500"></div>
              <span>Up to 8K resolution support</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-blue-500"></div>
              <span>60fps smooth playback</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-purple-500"></div>
              <span>HDR & Dolby Vision ready</span>
            </div>
          </div>
        </div>

        {/* CTA */}
  <div className="text-center p-4 rounded-lg bg-white/5 border border-white/10">
          <p className="text-xs text-slate-400 mb-2">Video download ready</p>
          <div className="text-sm font-medium text-green-300">Analyze URL to see options</div>
        </div>
      </div>
    </DownloadCard>
  );
};