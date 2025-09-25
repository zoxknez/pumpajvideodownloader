import React, { useEffect, useRef, useState } from 'react';
import { DownloadCard } from './DownloadCard';
import { Volume2, Music, Headphones, Radio, Disc } from 'lucide-react';
import { downloadJobFile, isJobFileReady, startAudioJob, subscribeJobProgress } from '../lib/api';
import { ipcAvailable, startIpcAdvanced, onProgressIpc, onDoneIpc, revealPath, openPath } from '../lib/downloader';
import { useToast } from './ToastProvider';

export interface AudioSectionProps {
  analysisData?: {
    sourceUrl?: string;
    duration: string;
    audioFormats: Array<{
      format: string;
      url?: string;
      formatId?: string;
      bitrate: string;
      size: string;
  quality: 'studio' | 'standard' | 'compact';
    }>;
    metadata?: {
      title: string;
      artist?: string;
      album?: string;
    };
  };
}

export const AudioSection: React.FC<AudioSectionProps> = ({ analysisData }) => {
  const { error: toastError } = useToast();
  const [selectedAudio, setSelectedAudio] = useState(0);
  // no scroll containers; clean list
  const [jobId, setJobId] = useState<string | null>(null);
  const [jobProgress, setJobProgress] = useState<number>(0);
  const [jobStage, setJobStage] = useState<string>('');
  // start button removed — no isStarting or live speed/ETA tracking
  const triedRef = useRef(false);
  const jobStartRef = useRef<number>(0);
  const subRef = useRef<{ close: () => void } | null>(null);
  const [completedPath, setCompletedPath] = useState<string | null>(null);

  const audioView = analysisData ? (() => {
    const rawAudio = analysisData!.audioFormats?.map((format: any) => ({
      url: (format as any).url,
      formatId: (format as any).formatId,
      format: format.format,
      bitrate: format.bitrate,
      size: format.size,
      icon:
        format.format === 'FLAC' ? Disc : format.bitrate === '320 kbps' ? Headphones : format.bitrate === '256 kbps' ? Music : Radio,
      badge:
        format.quality === 'studio' ? 'STUDIO'
        : format.quality === 'standard' ? 'STANDARD'
        : 'COMPACT',
      color:
        format.quality === 'studio'
          ? 'from-yellow-500 to-orange-500'
          : format.quality === 'standard'
          ? 'from-blue-500 to-cyan-500'
          : 'from-green-500 to-emerald-500',
      description:
        format.quality === 'studio' ? 'Perfect quality'
        : format.quality === 'standard' ? 'Good quality'
        : 'Small size',
      quality: format.quality as 'studio' | 'standard' | 'compact',
    }));

    // Normalize bitrate to number kbps for ranking
    const parseKbps = (b?: string) => {
      if (!b) return 0;
      const m = b.match(/(\d+)\s*kbps/i);
      return m ? parseInt(m[1], 10) : 0;
    };
  const qRank: Record<string, number> = { studio: 3, standard: 2, compact: 1 };
    const score = (a: any) => (qRank[a.quality] || 0) * 10000 + parseKbps(a.bitrate);

    // Deduplicate by quality tier, pick best by bitrate per tier
    const byTier = new Map<string, any>();
    (rawAudio || []).forEach((a) => {
      const curr = byTier.get(a.quality);
      if (!curr || score(a) > score(curr)) byTier.set(a.quality, a);
    });
    // Target up to 4 tiers in preferred order
  const desiredTiers: Array<'studio' | 'standard' | 'compact'> = ['studio', 'standard', 'compact'];
    const chosen = desiredTiers.map((t) => byTier.get(t)).filter(Boolean) as any[];
    const audioFormats = chosen.slice(0, 4);

  const handleStartAudio = async () => {
    if (!analysisData?.sourceUrl || !analysisData?.metadata?.title) return;
    try {
      if (ipcAvailable) {
        const id = crypto.randomUUID();
  const fmt = (analysisData.audioFormats || [])[selectedAudio] || (analysisData.audioFormats || [])[0];
  const ext = String(fmt?.format || 'm4a').toLowerCase();
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
  const audioFormat = (ext.includes('mp3') ? 'mp3' : ext.includes('m4a') || ext.includes('aac') ? 'm4a' : ext.includes('opus') ? 'opus' : 'm4a') as any;
  const resp = await startIpcAdvanced({ id, url: analysisData.sourceUrl, outDir: 'Audio', mode: 'audio', audioFormat, title: analysisData.metadata.title });
        if (!resp?.ok) {
          try { subRef.current?.close?.(); } catch {}
          setJobId(null); setJobProgress(0); setJobStage('');
          const code = String(resp?.error || 'start_failed');
          const msg = code === 'ytdlp_missing' ? 'yt-dlp not found. Open Settings → System to check binaries.' : code === 'ffmpeg_missing' ? 'FFmpeg not found. Open Settings → System to check binaries.' : 'Failed to start download.';
          toastError(msg);
        }
        return;
      }
      const fmt = (analysisData.audioFormats || [])[selectedAudio] || (analysisData.audioFormats || [])[0];
      const ext = String(fmt?.format || 'm4a').toLowerCase();
      const id = await startAudioJob(analysisData.sourceUrl, analysisData.metadata.title, (ext === 'mp3' ? 'mp3' : 'm4a') as any);
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
            try { await downloadJobFile(id); } catch {}
          }
          setTimeout(() => { setJobId(null); setJobProgress(0); setJobStage(''); }, 600);
        }
      );
    } catch {}
  };

  return (
      <DownloadCard title="Audio Extraction" icon={Volume2} variant="flat">
        <div className="space-y-4">
          {/* Audio preview and metadata removed as requested */}

  <div className="relative">
    <div className="grid grid-cols-1 gap-2">
    {audioFormats?.map((audio, index) => {
              const IconComponent = audio.icon;
              return (
        <div
      key={audio.formatId || audio.url || `${audio.format}-${audio.bitrate}`}
                  className={`
          relative rounded-lg p-3 border transition-all duration-300 cursor-pointer min-h-[78px]
                    transform hover:scale-[1.02] hover:shadow-lg
                    ${selectedAudio === index
                      ? 'border-purple-500 bg-purple-500/10 shadow-lg shadow-purple-500/25'
                      : 'border-white/10 bg-white/5 hover:border-white/20 hover:bg-white/10'}
                  `}
                  onClick={() => setSelectedAudio(index)}
                >
                  {/* Inline badge */}

                  <div className="flex items-center justify-between pr-16">
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-lg bg-gradient-to-br ${audio.color} shadow-lg`}>
                        <IconComponent className="w-4 h-4 text-white" />
                      </div>
                      <div>
                        <div className="text-[14px] font-semibold text-slate-100 flex items-center gap-2 flex-wrap">
                          {audio.format} - {audio.bitrate}
                          <span className={`px-1.5 py-0.5 text-[10px] font-bold rounded-full bg-gradient-to-r ${audio.color} text-white`}>{audio.badge}</span>
                        </div>
                        <div className="text-[12px] text-slate-300">{audio.description} • {audio.size}</div>
                      </div>
                    </div>
                    <div className="w-4 h-4 rounded-full border-2 border-slate-400/80 flex items-center justify-center">
                      {selectedAudio === index && <div className="w-2 h-2 rounded-full bg-purple-500 animate-pulse"></div>}
                    </div>
                  </div>
                </div>
              );
            })}
            </div>
          </div>

          {!jobId && (
            <div className="w-full pt-1">
              <button
                onClick={handleStartAudio}
                className="w-full px-4 py-2.5 rounded-xl bg-gradient-to-r from-purple-600 to-pink-600 text-white font-medium border border-white/10 hover:scale-[1.01] hover:shadow-lg hover:shadow-pink-500/20 transition"
              >
                Download
              </button>
            </div>
          )}
          <div className="w-full">
            {jobId ? (
              <div className="w-full p-3 rounded-lg border border-purple-500/40 bg-purple-500/10">
                <div className="flex items-center justify-between mb-2 text-purple-200 text-sm">
                  <span>{jobStage ? jobStage : 'working'}…</span>
                  <span>{Math.round(jobProgress)}%</span>
                </div>
                <div className="w-full h-2 rounded bg-white/10 overflow-hidden">
                  <div className="h-2 bg-gradient-to-r from-purple-500 to-pink-500" style={{ width: `${jobProgress}%` }} />
                </div>
                {/* Cancel button removed */}
              </div>
            ) : null}
          </div>
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

  // Fallback polling while working: probe job file readiness especially in late stage or after grace period
  useEffect(() => {
    if (!jobId) return;
    let disposed = false;
    const id = jobId;
    const tick = async () => {
      if (disposed || !id) return;
      if (triedRef.current) return;
      const elapsed = Date.now() - (jobStartRef.current || Date.now());
      const lateStage = (jobStage || '').toLowerCase().includes('merge') || (jobStage || '').toLowerCase().includes('post') || jobProgress >= 90 || elapsed > 8000;
      if (!lateStage) return;
      try {
        const ready = await isJobFileReady(id);
        if (ready) {
          triedRef.current = true;
          void downloadJobFile(id).catch(() => {});
        }
      } catch {}
    };
    const interval = setInterval(tick, 1500);
    return () => { disposed = true; clearInterval(interval); };
  }, [jobId, jobStage, jobProgress]);

  // Render Phase 2 if present, otherwise Phase 1 default
  // Cleanup subscription
  React.useEffect(() => () => { try { subRef.current?.close(); } catch {} }, []);
  if (audioView) return audioView;
  return (
    <DownloadCard title="Audio Extraction" icon={Volume2} variant="flat">
      <div className="space-y-4">
        {/* Hero Banner */}
        <div className="relative overflow-hidden rounded-xl bg-white/5 p-6 border border-white/10">
          <div className="absolute top-2 right-2">
            <Disc className="w-5 h-5 text-yellow-400 animate-spin" style={{ animationDuration: '3s' }} />
          </div>
          <div className="text-center">
            <div className="relative w-10 h-10 mx-auto mb-2">
              <span className="absolute inset-0 rounded-full bg-purple-400/30 animate-ping" />
              <Headphones className="absolute inset-0 m-auto w-8 h-8 text-purple-300 attention-icon icon-glow glow-purple" />
            </div>
            <h3 className="text-lg font-bold text-white mb-2">Studio Quality</h3>
            <p className="text-sm text-purple-200">Extract audio in lossless quality</p>
          </div>
        </div>

        {/* Top highlight tiles to better use space */}
        <div className="grid grid-cols-2 gap-2">
          <div className="text-center p-3 rounded-lg bg-white/5 border border-white/10">
            <div className="text-xl font-extrabold text-purple-300">Lossless</div>
            <div className="text-[11px] text-purple-200">FLAC • ALAC</div>
          </div>
          <div className="text-center p-3 rounded-lg bg-white/5 border border-white/10">
            <div className="text-sm font-bold text-pink-200">All Formats</div>
            <div className="text-[11px] text-pink-200/80">MP3 • AAC • OPUS</div>
          </div>
        </div>

  {/* Features (3 items) */}
        <div className="p-3 rounded-lg bg-white/5 border border-white/10">
          <div className="space-y-2 text-xs text-slate-300">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-purple-500"></div>
              <span>Studio-grade audio extraction</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-pink-500"></div>
              <span>Multiple format support</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-yellow-500"></div>
              <span>Metadata preservation</span>
            </div>
          </div>
        </div>

        {/* CTA */}
  <div className="text-center p-4 rounded-lg bg-white/5 border border-white/10">
          <p className="text-xs text-slate-400 mb-2">Audio extraction ready</p>
          <div className="text-sm font-medium text-purple-300">Start with URL analysis</div>
        </div>
      </div>
    </DownloadCard>
  );
};