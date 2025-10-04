import type { Request, Response, NextFunction } from 'express';

export type TokenBucketOptions = {
  rate?: number; // tokens per minute
  burst?: number;
};

type BucketState = {
  tokens: number;
  ts: number;
};

const buckets = new Map<string, BucketState>();

export function tokenBucket(options: TokenBucketOptions = {}) {
  const rate = Number.isFinite(options.rate) && options.rate! > 0 ? Number(options.rate) : 60;
  const burst = Number.isFinite(options.burst) && options.burst! > 0 ? Number(options.burst) : Math.max(rate, 90);

  return (req: Request & { user?: { id: string } }, res: Response, next: NextFunction) => {
    const key = req.user?.id || req.ip || 'anon';
    const now = Date.now();
    const state = buckets.get(key) || { tokens: burst, ts: now };
    const elapsedSeconds = (now - state.ts) / 1000;
    state.tokens = Math.min(burst, state.tokens + elapsedSeconds * (rate / 60));
    state.ts = now;
    if (state.tokens < 1) {
      buckets.set(key, state);
      return res.status(429).json({ code: 'TOO_MANY_REQUESTS' });
    }
    state.tokens -= 1;
    buckets.set(key, state);
    return next();
  };
}

export function resetTokenBuckets() {
  buckets.clear();
}
