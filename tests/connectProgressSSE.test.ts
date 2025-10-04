import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { connectProgressSSE } from '../src/lib/api';

class FakeEventSource {
  static instances: FakeEventSource[] = [];
  static lastInstance: FakeEventSource | null = null;
  url: string;
  withCredentials: boolean;
  onopen: ((ev: any) => void) | null = null;
  onerror: ((ev: any) => void) | null = null;
  onmessage: ((ev: any) => void) | null = null;
  readyState = 0;
  private listeners: Record<string, Array<(ev: any) => void>> = {};

  constructor(url: string, opts?: { withCredentials?: boolean }) {
    this.url = url;
    this.withCredentials = !!opts?.withCredentials;
    FakeEventSource.instances.push(this);
    FakeEventSource.lastInstance = this;
    setTimeout(() => {
      this.onopen?.({ type: 'open' });
      this.emit('ping', { data: '{"ok":true}' });
    }, 0);
  }

  addEventListener(type: string, cb: (ev: any) => void) {
    (this.listeners[type] ||= []).push(cb);
  }

  emit(type: string, ev: any) {
    if (type === 'message') {
      this.onmessage?.(ev);
    } else if (type === 'error') {
      this.onerror?.(ev);
    }
    for (const cb of this.listeners[type] || []) {
      cb.call(this, ev);
    }
  }

  close() {
    this.readyState = 2;
  }

  static reset() {
    FakeEventSource.instances = [];
    FakeEventSource.lastInstance = null;
  }
}

describe('connectProgressSSE', () => {
  let originalEventSource: any;

  beforeEach(() => {
    originalEventSource = (globalThis as any).EventSource;
    (globalThis as any).EventSource = FakeEventSource as any;
    FakeEventSource.reset();
    vi.useRealTimers();
  });

  afterEach(() => {
    (globalThis as any).EventSource = originalEventSource;
    FakeEventSource.reset();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('emits progress and end events', async () => {
    const data: any[] = [];
    const ends: string[] = [];
    const sub = connectProgressSSE({
      id: 'job-1',
      onData: (payload) => data.push(payload),
      onEnd: (status) => ends.push(status),
    });

    const es = FakeEventSource.lastInstance!;
    es.emit('message', { data: JSON.stringify({ id: 'job-1', progress: 42, stage: 'downloading' }) });
    es.emit('end', { data: JSON.stringify({ id: 'job-1', status: 'completed' }) });

    await new Promise((resolve) => setTimeout(resolve, 0));
    sub.close();

    expect(data.at(-1)).toMatchObject({ progress: 42, stage: 'downloading' });
    expect(ends.at(-1)).toBe('completed');
  });

  it('reconnects after error using retry hints', async () => {
    vi.useFakeTimers();

    const errors: Array<{ retryIn?: number }> = [];
    connectProgressSSE({
      id: 'job-2',
      onError: (info) => errors.push(info),
    });

    const es = FakeEventSource.lastInstance!;
    es.emit('retry', { data: '2500' });
    es.emit('error', { type: 'error' });

    expect(errors).toHaveLength(1);
    expect(errors[0]?.retryIn).toBe(3);

    expect(FakeEventSource.instances).toHaveLength(1);
    vi.advanceTimersByTime(2500);
    expect(FakeEventSource.instances).toHaveLength(2);
  });
});