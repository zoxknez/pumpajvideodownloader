export {
  API_BASE,
  apiFetch,
  authHeaders,
  clearSignCache,
  getSigned,
  jobFileUrl,
  withTimeout,
} from './client';
export type { SignedScope } from './client';

export {
  analyzeUrl,
  formatDuration,
  mapToAudioAnalysis,
  mapToThumbnails,
  mapToVideoAnalysis,
} from './analysis';
export type { AnalyzeResponse } from './analysis';

export {
  downloadJobFile,
  parseFilename,
  proxyDownload,
  resolveFormatUrl,
  ProxyDownloadError,
} from './downloads';
export type { DownloadProgress } from './downloads';

export {
  cancelJob,
  isJobFileReady,
  startAudioJob,
  startBestJob,
  subscribeJobProgress,
} from './jobs';
export type { JobCompletionDetail, JobProgressUpdate } from './jobs';

export { getJobsSettings, updateJobsSettings } from './settings';
