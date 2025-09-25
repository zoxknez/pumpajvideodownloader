export function combineSignals(...signals: (AbortSignal | undefined)[]) {
  const active = signals.filter(Boolean) as AbortSignal[];
  if (active.length === 0) {
    const ac = new AbortController();
    return ac.signal;
  }
  // If any already aborted, reuse it
  for (const s of active) if (s.aborted) return s;
  const ctrl = new AbortController();
  const onAbort = () => ctrl.abort('aborted');
  for (const s of active) s.addEventListener('abort', onAbort, { once: true });
  return ctrl.signal;
}
