export type SSEHandler = (msg: any) => void;

export async function sseSubscribe(
  path: string,
  headers: Record<string, string>,
  onMessage: SSEHandler,
  onEnd?: (data?: any) => void
): Promise<{ close: () => void }> {
  const controller = new AbortController();
  const res = await fetch(path, { headers, method: 'GET', signal: controller.signal });
  if (!res.ok || !res.body) throw new Error('SSE failed ' + res.status);
  const reader = res.body.getReader();
  const decoder = new TextDecoder();

  let buffer = '';
  let active = true;
  let finished = false;

  const cleanup = () => {
    if (!active) return;
    active = false;
    try { controller.abort(); } catch {}
    try { reader.cancel(); } catch {}
  };

  const finish = (data?: any) => {
    if (finished) return;
    finished = true;
    try { onEnd?.(data); } catch {}
  };

  (async () => {
    try {
      while (active) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let idx: number;
        while ((idx = buffer.indexOf('\n\n')) >= 0) {
          const chunk = buffer.slice(0, idx).trim();
          buffer = buffer.slice(idx + 2);
          if (!chunk) continue;
          const lines = chunk.split('\n');
          let event = 'message';
          let dataLine = '';
          for (const line of lines) {
            if (line.startsWith('event:')) event = line.slice(6).trim();
            if (line.startsWith('data:')) dataLine += line.slice(5).trim();
          }
          if (event === 'end') {
            let payload: any;
            try { payload = JSON.parse(dataLine); } catch {}
            finish(payload);
            cleanup();
            return;
          }
          try { onMessage(JSON.parse(dataLine)); } catch {}
        }
      }
    } catch {
      // swallow network errors; caller handles via stage state
    } finally {
      cleanup();
      finish();
    }
  })();

  return { close: cleanup };
}
