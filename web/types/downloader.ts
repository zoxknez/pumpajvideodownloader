export type FormatBadge = 'recommended' | 'fast' | 'optimized';

export type VideoSubtitle = {
  lang: string;
  ext: string;
  url: string;
  auto?: boolean;
  name?: string;
};

export type VideoChapter = {
  title?: string;
  start: number;
  end?: number;
};

export type VideoFormatDetails = {
  format: string;
  quality: string;
  resolution: string;
  fileSize: string;
  bitrate?: string;
  fps?: number;
  codec?: string;
  badge?: FormatBadge;
  isHdr?: boolean;
  formatId?: string;
  url?: string;
};

export type VideoAnalysisData = {
  sourceUrl?: string;
  videoTitle: string;
  duration: string;
  originalResolution: string;
  maxFrameRate: number;
  videoCodec: string;
  audioCodec: string;
  hasHDR: boolean;
  fileSize: string;
  hasSubtitles?: boolean;
  subtitles?: Array<VideoSubtitle>;
  hasChapters?: boolean;
  chapters?: Array<VideoChapter>;
  hasThumbnails?: boolean;
  formats: Array<VideoFormatDetails>;
};
