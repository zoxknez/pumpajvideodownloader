import { http, HttpResponse } from 'msw';

const BIN = new Uint8Array(1024 * 1024); // 1MB dummy

export const handlers = [
  // 1) SSE progress
  http.get('*/api/progress/:id', ({ params }: { params: Record<string, string> }) => {
    const { id } = params;
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        const send = (chunk: string) => controller.enqueue(encoder.encode(chunk));
        // retry hint + initial ping
        send('retry: 5000\n\n');
        send('event: ping\ndata: {"ok":true}\n\n');
        // progress
        send(`data: ${JSON.stringify({ id, progress: 42, stage: 'downloading' })}\n\n`);
        // end after a tick
        setTimeout(() => {
          send(`event: end\ndata: ${JSON.stringify({ id, status: 'completed' })}\n\n`);
          controller.close();
        }, 10);
      },
    });

    return new HttpResponse(stream as any, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-store',
      },
    });
  }),

  // 2) Job file: HEAD + GET (Range aware)
  http.head('*/api/job/file/:id', () =>
    new HttpResponse(null, {
      status: 200,
      headers: { 'Content-Length': String(BIN.byteLength), ETag: '"etag-demo"' },
    })
  ),
  http.get('*/api/job/file/:id', ({ request }: { request: Request }) => {
    const range = request.headers.get('range');
    if (range) {
      const m = range.match(/bytes=(\d+)-(\d+)?/);
      if (m) {
        const start = parseInt(m[1], 10);
        const end = m[2] ? parseInt(m[2], 10) : BIN.byteLength - 1;
        if (!(start >= 0 && end >= start && end < BIN.byteLength)) {
          return new HttpResponse(null, {
            status: 416,
            headers: { 'Content-Range': `bytes */${BIN.byteLength}` },
          });
        }
        const slice = BIN.slice(start, end + 1);
        return new HttpResponse(slice as any, {
          status: 206,
          headers: {
            'Content-Type': 'video/mp4',
            'Accept-Ranges': 'bytes',
            'Content-Range': `bytes ${start}-${end}/${BIN.byteLength}`,
            'Content-Length': String(slice.byteLength),
            'Content-Disposition': 'attachment; filename="video.mp4"',
            ETag: '"etag-demo"',
          },
        });
      }
    }
    return new HttpResponse(BIN as any, {
      headers: {
        'Content-Type': 'video/mp4',
        'Accept-Ranges': 'bytes',
        'Content-Length': String(BIN.byteLength),
        'Content-Disposition': 'attachment; filename="video.mp4"',
        ETag: '"etag-demo"',
      },
    });
  }),

  // 3) Proxy over-limit → 502 + JSON + Proxy-Status
  http.get('*/api/proxy-download', () =>
    HttpResponse.json(
      { code: 'UPSTREAM_SIZE_LIMIT', message: 'stream exceeded local limit' },
      {
        status: 502,
        headers: { 'Proxy-Status': 'pumpaj; error="upstream_size_limit"', 'Cache-Control': 'no-store' },
      }
    )
  ),

  // 4) Proxy 429 (retryable)
  http.get('*/api/proxy-download-429', () =>
    HttpResponse.json(
      { code: 'UPSTREAM_RATELIMIT', message: 'try later' },
      { status: 429, headers: { 'Retry-After': '30', 'Proxy-Status': 'pumpaj; error="ratelimited"' } }
    )
  ),
];
