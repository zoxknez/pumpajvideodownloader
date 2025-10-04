import { performance } from 'node:perf_hooks';

export type HistogramBuckets = {
  readonly bounds: number[];
  counts: number[];
  sum: number;
  count: number;
};

export type ProxyMetrics = {
  inflight: number;
  requests: number;
  success: number;
  bytesTotal: number;
  duration: HistogramBuckets;
  size: HistogramBuckets;
  errors: Map<string, number>;
};

export type MetricsRegistry = {
  proxy: ProxyMetrics;
};

function createHistogram(bounds: number[]): HistogramBuckets {
  return {
    bounds: bounds.slice().sort((a, b) => a - b),
    counts: new Array(bounds.length + 1).fill(0),
    sum: 0,
    count: 0,
  };
}

function observeHistogram(hist: HistogramBuckets, value: number) {
  if (!Number.isFinite(value) || value < 0) return;
  hist.sum += value;
  hist.count += 1;
  for (let i = 0; i < hist.bounds.length; i += 1) {
    if (value <= hist.bounds[i]) {
      hist.counts[i] += 1;
      return;
    }
  }
  hist.counts[hist.counts.length - 1] += 1;
}

export function createMetricsRegistry(): MetricsRegistry {
  const MB = 1024 * 1024;
  return {
    proxy: {
      inflight: 0,
      requests: 0,
      success: 0,
      bytesTotal: 0,
      duration: createHistogram([0.5, 1, 2.5, 5, 10, 30, 60]),
      size: createHistogram([0.5 * MB, 1 * MB, 5 * MB, 10 * MB, 50 * MB, 200 * MB, 500 * MB]),
      errors: new Map(),
    },
  };
}

export type ProxyObservation = {
  ok: boolean;
  bytes?: number;
  errorCode?: string;
};

export function startProxyObservation(metrics: ProxyMetrics) {
  metrics.inflight += 1;
  const start = performance.now();
  let finished = false;
  return (obs: ProxyObservation) => {
    if (finished) return;
    finished = true;
    const duration = (performance.now() - start) / 1000;
    metrics.inflight = Math.max(0, metrics.inflight - 1);
    metrics.requests += 1;
    observeHistogram(metrics.duration, duration);
    if (obs.ok) {
      const bytes = Math.max(0, Number(obs.bytes ?? 0));
      metrics.success += 1;
      metrics.bytesTotal += bytes;
      observeHistogram(metrics.size, bytes);
    } else {
      const code = String(obs.errorCode || 'UNKNOWN');
      metrics.errors.set(code, (metrics.errors.get(code) ?? 0) + 1);
    }
  };
}

export function resetMetrics(registry: MetricsRegistry) {
  registry.proxy.inflight = 0;
  registry.proxy.requests = 0;
  registry.proxy.success = 0;
  registry.proxy.bytesTotal = 0;
  registry.proxy.errors.clear();
  resetHistogram(registry.proxy.duration);
  resetHistogram(registry.proxy.size);
}

function resetHistogram(hist: HistogramBuckets) {
  hist.sum = 0;
  hist.count = 0;
  hist.counts.fill(0);
}

export function histogramLines(name: string, hist: HistogramBuckets): string[] {
  const lines: string[] = [];
  let cumulative = 0;
  for (let i = 0; i < hist.bounds.length; i += 1) {
    cumulative += hist.counts[i];
    lines.push(`${name}_bucket{le="${hist.bounds[i]}"} ${cumulative}`);
  }
  cumulative += hist.counts[hist.counts.length - 1];
  lines.push(`${name}_bucket{le="+Inf"} ${cumulative}`);
  lines.push(`${name}_sum ${hist.sum}`);
  lines.push(`${name}_count ${hist.count}`);
  return lines;
}
