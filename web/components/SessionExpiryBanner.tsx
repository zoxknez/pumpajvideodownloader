"use client";
import { useEffect, useState } from 'react';
import { getSupabase } from '@/lib/supabaseClient';
import { apiUrl } from '@/lib/api';

// Polls a lightweight authed endpoint to detect 401 and show re-login prompt.
export function SessionExpiryBanner() {
  const [expired, setExpired] = useState(false);
  const [lastOk, setLastOk] = useState<number | null>(null);

  useEffect(() => {
    let disposed = false;
    async function tick() {
      if (disposed) return;
      const supabase = getSupabase();
      if (!supabase) return; // no auth configured
      try {
        const { data } = await supabase.auth.getSession();
        const token = data.session?.access_token;
        if (!token) {
          setExpired(true);
          return;
        }
        const r = await fetch(apiUrl('/api/jobs/metrics'), { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' });
        if (r.status === 401) {
          setExpired(true);
        } else if (r.ok) {
          setExpired(false);
          setLastOk(Date.now());
        }
      } catch {
        // network errors ignored; do not flip to expired immediately
      }
    }
    tick();
    const id = setInterval(tick, 15000);
    return () => { disposed = true; clearInterval(id); };
  }, []);

  if (!expired) return null;

  return (
    <div className="fixed bottom-4 left-1/2 z-[1100] w-[95%] max-w-2xl -translate-x-1/2 rounded-xl border border-rose-400/40 bg-gradient-to-br from-rose-600 to-red-600 p-4 text-sm text-white shadow-2xl">
      <div className="font-semibold mb-1">Sesija je istekla</div>
      <p className="text-xs opacity-90 mb-3">Vaša Supabase autentikacija je istekla ili je opozvana. Potrebno je ponovo da se prijavite kako biste nastavili sa preuzimanjima.</p>
      <div className="flex flex-wrap gap-2">
        <a href="/login" className="rounded-full bg-white/15 hover:bg-white/25 px-4 py-1.5 text-xs font-medium">Ponovna prijava</a>
        <button onClick={() => location.reload()} className="rounded-full bg-white/10 hover:bg-white/20 px-4 py-1.5 text-xs font-medium">Osveži</button>
        {lastOk && <span className="ml-auto text-[11px] opacity-70">Poslednja OK authed provera: {new Date(lastOk).toLocaleTimeString()}</span>}
      </div>
    </div>
  );
}
