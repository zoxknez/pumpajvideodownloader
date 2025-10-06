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
  // YouTube anti-bot bypass - use innertube API and disable signature verification
  (args as any).extractorArgs = 'youtube:player_client=android,web;player_skip=webpage,configs';
  return args;
}
