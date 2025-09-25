export function connectSse(url: string, onMessage: (ev: MessageEvent) => void) {
  let backoff = 1000;
  let es: EventSource | null = null;
  const start = () => {
    es = new EventSource(url);
  es.onopen = () => { backoff = 1000; };
    es.onmessage = onMessage;
    es.onerror = () => {
      if (es) { es.close(); }
      setTimeout(start, backoff);
      backoff = Math.min(backoff * 2, 30000);
      return undefined;
    };
  };
  start();
  return () => { if (es) es.close(); };
}
