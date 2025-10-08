import React from 'react';
import { Crown, Play, Shield, Zap } from 'lucide-react';
import type { VideoFormatOption, VideoFormatVisuals, FormatBadge } from './types';

type VideoFormatListProps = {
  formats: VideoFormatOption[];
  selectedSourceIndex: number;
  onSelect: (displayIndex: number) => void;
};

const BADGE_VISUALS: Record<FormatBadge, VideoFormatVisuals> = {
  recommended: { icon: Zap, gradient: 'from-green-500 to-emerald-500' },
  fast: { icon: Shield, gradient: 'from-blue-500 to-cyan-500' },
  optimized: { icon: Crown, gradient: 'from-yellow-500 to-orange-500' },
};

const DEFAULT_VISUAL: VideoFormatVisuals = {
  icon: Play,
  gradient: 'from-purple-500 to-pink-500',
};

const resolveVisuals = (badge?: FormatBadge): VideoFormatVisuals => {
  if (!badge) return DEFAULT_VISUAL;
  return BADGE_VISUALS[badge] ?? DEFAULT_VISUAL;
};

export const VideoFormatList: React.FC<VideoFormatListProps> = ({ formats, selectedSourceIndex, onSelect }) => {
  if (!formats.length) {
    return (
      <div className="rounded-xl border border-white/10 bg-white/5 p-4 text-sm text-slate-300">
        No available formats. Try analyzing the URL again.
      </div>
    );
  }

  return (
    <div className="relative">
      <div className="grid grid-cols-1 gap-2">
        {formats.map((format, index) => {
          const { icon: Icon, gradient } = resolveVisuals(format.badge);
          const isSelected = format.sourceIndex === selectedSourceIndex;

          return (
            <button
              type="button"
              key={format.id}
              onClick={() => onSelect(index)}
              className={`relative min-h-[84px] w-full cursor-pointer rounded-2xl border p-3 text-left transition-all duration-300 backdrop-blur-md
                ${isSelected
                  ? 'bg-gradient-to-br from-blue-500/15 to-purple-500/10 border-blue-500/50 shadow-[0_10px_30px_-10px_rgba(59,130,246,0.6)]'
                  : 'bg-white/[0.06] border-white/10 hover:bg-white/[0.09] hover:border-white/20 hover:shadow-[0_10px_30px_-12px_rgba(0,0,0,0.5)]'}`}
            >
              <div className="flex items-center justify-between pr-16">
                <div className="flex items-center gap-3">
                  <div className={`rounded-xl bg-gradient-to-br ${gradient} p-2 shadow-lg shadow-black/20 ring-1 ring-white/10`}>
                    <Icon className="h-4 w-4 text-white drop-shadow-sm" />
                  </div>
                  <div>
                    <div className="flex flex-wrap items-center gap-2 text-[14px] font-semibold text-slate-100">
                      {format.format} - {format.quality}
                      {format.fps && format.fps > 30 ? (
                        <span className="text-[11px] font-bold text-green-300">{format.fps}fps</span>
                      ) : null}
                      {format.isHdr ? (
                        <span className="rounded-full bg-gradient-to-r from-orange-500 to-red-500 px-1.5 py-0.5 text-[10px] font-bold text-white">HDR</span>
                      ) : null}
                      {format.badgeLabel ? (
                        <span className={`rounded-full bg-gradient-to-r ${gradient} px-1.5 py-0.5 text-[10px] font-bold text-white`}>
                          {format.badgeLabel}
                        </span>
                      ) : null}
                    </div>
                    <div className="text-[12px] text-slate-300">
                      {format.resolution} • {format.fileSize} • {format.bitrate || 'Auto bitrate'}
                    </div>
                    {format.codec ? (
                      <div className="text-[11px] text-slate-300/80">Codec: {format.codec}</div>
                    ) : null}
                  </div>
                </div>
                <div className="flex h-4 w-4 items-center justify-center rounded-full border-2 border-slate-400/80">
                  {isSelected ? <div className="h-2 w-2 rounded-full bg-blue-500 animate-pulse" /> : null}
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};
