import type { Job, JobSystemState as JobSystemStateBase } from '../core/jobHelpers.js';

export type WaitingItem = {
  job: Job;
  run: () => void;
};

export type HistoryFunctions = {
  appendHistory: (item: any) => { id: string };
  updateHistory: (id: string, updates: any) => void;
  updateHistoryThrottled: (id: string, progress: number) => void;
  clearHistoryThrottle: (id: string) => void;
  readHistory: () => any[];
};

export type SseFunctions = {
  emitProgress: (id: string, payload: any) => void;
};

export type JobSystemState = JobSystemStateBase & {
  jobs: Map<string, Job>;
  waiting: WaitingItem[];
};
