export type SSEHandler = (msg: any) => void;

export async function sseSubscribe(path: string, headers: Record<string,string>, onMessage: SSEHandler, onEnd?: (data?: any)=>void) {
  const res = await fetch(path, { headers, method: 'GET' });
  if (!res.ok || !res.body) throw new Error('SSE failed ' + res.status);
  const reader = res.body.getReader();
  const decoder = new TextDecoder();

  let buffer = '';
  while (true) {
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
      if (event === 'end') { try { onEnd?.(JSON.parse(dataLine)); } catch { onEnd?.(); } break; }
      try { onMessage(JSON.parse(dataLine)); } catch {}
    }
  }
}
