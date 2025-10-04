import React, { useMemo } from 'react';
import { Crown, Sparkles, Lock } from '../lib/icons';
import { usePolicy } from './AuthProvider';

export const PolicyBadge: React.FC<{ className?: string }> = ({ className }) => {
  const policy = usePolicy();
  const isPremium = policy.plan === 'PREMIUM';

  const limits = useMemo(() => (
    [
      { label: 'Video', value: `${policy.maxHeight}p` },
      { label: 'Audio', value: `${policy.maxAudioKbps} kbps` },
      { label: 'Batch', value: `${policy.batchMax}` },
      { label: 'Paralelno', value: `${policy.concurrentJobs}` },
    ]
  ), [policy]);

  const locked = useMemo(() => {
    const items: string[] = [];
    if (!policy.allowSubtitles) items.push('titlovi');
    if (!policy.allowChapters) items.push('poglavlja');
    if (!policy.allowMetadata) items.push('meta podaci');
    return items;
  }, [policy]);

  return (
    <div
      className={`relative flex flex-col gap-2 rounded-xl border px-3 py-2 text-left shadow-sm backdrop-blur-md transition-colors
        ${isPremium
          ? 'border-emerald-400/40 bg-emerald-500/10 text-emerald-100'
          : 'border-amber-400/40 bg-amber-500/10 text-amber-100'}
        ${className || ''}`}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide">
          {isPremium ? <Crown className="w-4 h-4" /> : <Lock className="w-4 h-4" />}
          <span>{policy.plan}</span>
        </div>
        {isPremium ? (
          <span className="flex items-center gap-1 text-[11px] text-emerald-200">
            <Sparkles className="w-3 h-3" /> Full access
          </span>
        ) : (
          <span className="text-[11px] text-amber-200/90">Premium otključava više</span>
        )}
      </div>
      <div className="grid grid-cols-2 gap-2 text-[11px]">
        {limits.map((limit) => (
          <div key={limit.label} className="rounded-lg border border-white/10 bg-black/10 px-2 py-1 text-white/90">
            <div className="text-[10px] uppercase tracking-wide text-white/60">{limit.label}</div>
            <div className="text-sm font-semibold text-white">{limit.value}</div>
          </div>
        ))}
      </div>
      {!isPremium && locked.length > 0 && (
        <div className="text-[11px] text-white/80">
          Nije dostupno: {locked.join(', ')}
        </div>
      )}
    </div>
  );
};
