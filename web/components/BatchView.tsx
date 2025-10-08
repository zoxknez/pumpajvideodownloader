'use client';
import React from 'react';

export default function BatchView() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <div className="rounded-2xl border border-sky-200 bg-white/80 backdrop-blur p-6 shadow-sm">
        <h2 className="text-2xl font-bold text-slate-900 mb-4">⚠️ Batch downloads are disabled</h2>
        <p className="text-slate-600">
          The web app focuses on single downloads and queue management. Batch submissions remain available in the desktop
          app plan, while we simplify the browser experience.
        </p>
      </div>
    </div>
  );
}
