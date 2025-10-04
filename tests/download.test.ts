import { afterEach, describe, expect, it, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '../src/tests/setupTests';
import * as api from '../src/lib/api';

vi.mock('../src/telemetry/sentry', () => ({
  captureProxyError: vi.fn(),
}));

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('downloadJobFile', () => {
  it('throws for 416 responses', async () => {
    server.use(
      http.get('*/api/job/file/:id', () =>
        new HttpResponse(null, {
          status: 416,
          headers: { 'Content-Range': 'bytes */1048576', 'X-Request-Id': 'req-416' },
        })
      ),
    );

    const saveSpy = vi.spyOn(api, 'saveResponseAsFile').mockResolvedValue(undefined as any);

    await expect(api.downloadJobFile('job-x')).rejects.toThrow(/416/);
    expect(saveSpy).not.toHaveBeenCalled();
  });

  it('throws descriptive error for upstream size limit', async () => {
    server.use(
      http.get('*/api/job/file/:id', () =>
        HttpResponse.json(
          { code: 'UPSTREAM_SIZE_LIMIT' },
          {
            status: 502,
            headers: {
              'Content-Type': 'application/json',
              'Proxy-Status': 'pumpaj; error="upstream_size_limit"',
              'X-Request-Id': 'req-502',
            },
          },
        ),
      ),
    );

    const saveSpy = vi.spyOn(api, 'saveResponseAsFile').mockResolvedValue(undefined as any);

    await expect(api.downloadJobFile('job-x')).rejects.toThrow(/Upstream size limit/i);
    expect(saveSpy).not.toHaveBeenCalled();
  });
});