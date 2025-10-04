export type Plan = 'FREE' | 'PREMIUM';

export interface Policy {
  plan: Plan;
  maxHeight: number;
  maxAudioKbps: number;
  playlistMax: number;
  batchMax: number;
  concurrentJobs: number;
  allowSubtitles: boolean;
  allowChapters: boolean;
  allowMetadata: boolean;
  speedLimitKbps?: number;
}

export const POLICIES: Record<Plan, Policy> = {
  FREE: {
    plan: 'FREE', maxHeight: 720, maxAudioKbps: 128,
    playlistMax: 10, batchMax: 2, concurrentJobs: 1,
    allowSubtitles: false, allowChapters: false, allowMetadata: false,
  },
  PREMIUM: {
    plan: 'PREMIUM', maxHeight: 4320, maxAudioKbps: 320,
    playlistMax: 300, batchMax: 10, concurrentJobs: 4,
    allowSubtitles: true, allowChapters: true, allowMetadata: true,
  },
};
