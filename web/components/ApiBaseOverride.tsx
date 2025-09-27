"use client";
import { useEffect, useState } from 'react';
import { API_BASE } from '@/lib/api';

export function ApiBaseOverride() {
  const [value, setValue] = useState('');
  const [pingStatus, setPingStatus] = useState<'idle' | 'ok' | 'fail' | 'checking'>('idle');
  const [effective, setEffective] = useState(API_BASE);

  useEffect(() => {
    setEffective(API_BASE);
  }, []);

  const apply = () => {
    try {
      if (!value.trim()) {
        localStorage.removeItem('pumpaj:apiBaseOverride');
        window.location.reload();
        return;
      }
      localStorage.setItem('pumpaj:apiBaseOverride', value.trim().replace(/\/$/, ''));
      window.location.reload();
    } catch {}
  };

  const test = async () => {
    setPingStatus('checking');
    try {
      const res = await fetch((value.trim() || API_BASE) + '/health', { cache: 'no-store' });
      setPingStatus(res.ok ? 'ok' : 'fail');
    } catch {
      setPingStatus('fail');
    }
  };

  return (
    <div className="mt-4 rounded-xl border border-white/10 bg-white/5 p-4 text-xs text-slate-200 space-y-3">
      <div className="flex flex-wrap items-center gap-2 justify-between">
        <span className="font-semibold">API Base Override</span>
        <span className="text-[11px] text-slate-400">Efektivno: {effective || '(relative /api)'} </span>
      </div>
      <div className="flex flex-col gap-2">
        <input
          placeholder="https://pumpaj-web-production.up.railway.app"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="w-full rounded-md bg-slate-900/60 border border-white/10 px-2 py-1 text-[12px] focus:outline-none focus:ring-1 focus:ring-purple-500"
        />
        <div className="flex items-center gap-2">
          <button onClick={apply} className="px-3 py-1.5 rounded-md bg-gradient-to-r from-purple-600 to-rose-600 text-white text-[12px] font-medium hover:from-purple-500 hover:to-rose-500">Primeni</button>
          <button onClick={test} className="px-3 py-1.5 rounded-md bg-slate-700/60 text-white text-[12px] hover:bg-slate-600/60">Ping</button>
          {pingStatus !== 'idle' && (
            <span className={
              pingStatus === 'checking' ? 'text-slate-300 animate-pulse' :
              pingStatus === 'ok' ? 'text-emerald-400' : 'text-rose-400'
            }>
              {pingStatus === 'checking' ? 'provera…' : pingStatus === 'ok' ? 'OK' : 'FAIL'}
            </span>
          )}
          <button onClick={() => { setValue(''); localStorage.removeItem('pumpaj:apiBaseOverride'); window.location.reload(); }} className="ml-auto px-3 py-1.5 rounded-md border border-white/15 text-white/80 text-[12px] hover:bg-white/10">Reset</button>
        </div>
        <p className="text-[11px] text-slate-400 leading-snug">
          Ovo polje omogućava runtime promenu backend API adrese bez redeploy-a (čuva se u localStorage). Ostavi prazno i klikni Primeni za povratak na podrazumevano ponašanje.
        </p>
      </div>
    </div>
  );
}