"use client";
import React from 'react';
import type { Translation, ShowcaseSlideId } from '../AuthProvider';

interface Props {
  copy: Translation['appShowcase'];
  activeId: ShowcaseSlideId;
  onChange: (id: ShowcaseSlideId) => void;
  autoRotate?: boolean;
}

export const Showcase: React.FC<Props> = ({ copy, activeId }) => {
  const active = copy.slides.find(s => s.id === activeId) || copy.slides[0];
  return (
    <div className="flex h-full flex-col gap-3" aria-label="Application features">
      <div className="flex items-center justify-center gap-2">
        <span className="inline-flex items-center gap-2 rounded-xl border border-blue-400/40 bg-gradient-to-r from-blue-500/20 to-purple-500/20 px-3 py-1.5">
          <span className="text-[11px] font-black tracking-wide">{copy.badge}</span>
          <img src="/pumpaj-256.png" alt="Pumpaj" className="h-5 w-5 rounded-md" />
        </span>
      </div>
      <div className="flex justify-center gap-2" role="tablist" aria-label="Feature slides">
        {copy.slides.map(slide => (
          <button
            key={slide.id}
            role="tab"
            aria-selected={slide.id === active.id}
            aria-label={slide.title}
            className={`h-1.5 rounded-full transition-all ${slide.id === active.id ? 'w-10 bg-gradient-to-r from-blue-400 via-purple-400 to-blue-400 shadow-[0_0_10px_rgba(59,130,246,0.8)]' : 'w-1.5 bg-white/20'}`}
            disabled
          />
        ))}
      </div>
      <div className="grid grid-cols-3 gap-2">
        {active.highlights.map(({ icon, label, value }) => (
          <div key={label} className="rounded-xl border border-blue-400/25 bg-gradient-to-br from-blue-600/10 to-purple-600/10 px-3 py-3 text-center" aria-label={label}>
            {icon && <div className="text-lg mb-1 leading-none" aria-hidden>{icon}</div>}
            <div className="text-[10px] uppercase tracking-wide text-blue-200/80 font-semibold">{label}</div>
            <div className="text-sm font-extrabold">{value}</div>
          </div>
        ))}
      </div>
      <div className="grid grid-rows-3 gap-2 flex-1 min-h-0" aria-label="Highlights">
        {active.items.slice(0, 3).map(({ icon, title, description }) => (
          <div key={title} className="rounded-xl border border-purple-400/25 bg-gradient-to-br from-purple-600/10 to-blue-600/10 p-3 flex items-start gap-3">
            {icon && <span className="text-xl leading-none" aria-hidden>{icon}</span>}
            <div className="min-w-0">
              <h3 className="text-xs font-bold">{title}</h3>
              <p className="text-[11px] text-white/80 leading-snug line-clamp-3">{description}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
