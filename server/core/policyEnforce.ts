import type { Policy } from '../types/policy.js';

export function assertBatchWithinPolicy(urls: string[], policy: Policy) {
  if (urls.length > policy.batchMax) {
    const e: any = new Error('BATCH_LIMIT_EXCEEDED');
    e.code = 'BATCH_LIMIT_EXCEEDED';
    throw e;
  }
}

export function ytDlpArgsFromPolicy(policy: Policy) {
  const args: Record<string, any> = {};
  if (policy.playlistMax && Number.isFinite(policy.playlistMax)) {
    (args as any).playlistEnd = policy.playlistMax;
  }
  return args;
}
