import React from 'react';
import type { LucideIcon } from 'lucide-react';

interface DownloadCardProps {
  title: string;
  icon: LucideIcon;
  children: React.ReactNode;
  className?: string;
  variant?: 'elevated' | 'flat';
}

export const DownloadCard: React.FC<DownloadCardProps> = ({
  title,
  icon: Icon,
  children,
  className = '',
  variant = 'elevated'
}) => {
  const base = variant === 'flat'
    ? 'group rounded-2xl bg-white/5 backdrop-blur-md border border-white/10 hover:border-blue-400/40 hover:bg-white/7'
    : 'group rounded-2xl bg-gradient-to-br from-slate-800/50 to-slate-900/50 backdrop-blur-xl border border-slate-700/50 hover:border-blue-500/50 hover:shadow-2xl hover:shadow-blue-500/10';
  return (
    <div className={`relative overflow-hidden transition-all duration-500 ease-out ${base} ${className} animate-pop`}>
      {/* Top accent bar */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r from-blue-500/50 via-purple-500/50 to-pink-500/50 opacity-70 group-hover:opacity-100 transition-opacity" />

      {variant === 'elevated' && (
        <div className="absolute inset-0 bg-gradient-to-br from-blue-600/5 to-purple-600/5 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
      )}

      {/* Corner glows */}
      <div className="pointer-events-none absolute -left-6 -top-6 h-24 w-24 rounded-full bg-blue-500/10 blur-2xl" />
      <div className="pointer-events-none absolute -right-6 -bottom-6 h-24 w-24 rounded-full bg-purple-500/10 blur-2xl" />

      <div className="relative p-6 h-full flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-center mb-4">
          <div className="relative rounded-full p-[1px] bg-gradient-to-r from-white/20 via-white/10 to-white/20 group-hover:from-blue-400/40 group-hover:via-purple-400/30 group-hover:to-pink-400/40 transition-colors">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-900/40 backdrop-blur-md">
              <div className="relative">
                <span className="absolute inset-0 rounded-full bg-gradient-to-br from-blue-500/60 to-purple-600/60 blur-md opacity-50" />
                <div className="relative p-2 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 ring-1 ring-white/10">
                  <Icon className="w-4 h-4 text-white" />
                </div>
              </div>
              <h3 className="text-sm md:text-base font-semibold text-slate-200 group-hover:text-white transition-colors">
                {title}
              </h3>
            </div>
          </div>
        </div>
        
        <div className="flex-1">
          {children}
        </div>
      </div>
    </div>
  );
};
