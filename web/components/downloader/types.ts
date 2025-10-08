import type { LucideIcon } from 'lucide-react';
import type {
  FormatBadge,
  VideoAnalysisData,
  VideoChapter,
  VideoFormatDetails,
  VideoSubtitle,
} from '@/types/downloader';

export type {
  FormatBadge,
  VideoAnalysisData,
  VideoChapter,
  VideoFormatDetails,
  VideoSubtitle,
} from '@/types/downloader';

export type VideoFormatOption = {
  id: string;
  sourceIndex: number;
  format: string;
  quality: string;
  resolution: string;
  fileSize: string;
  bitrate?: string;
  fps?: number;
  codec?: string;
  isHdr?: boolean;
  badge?: FormatBadge;
  badgeLabel?: string;
  formatId?: string;
  url?: string;
};

export type SelectedFormatResult = {
  sourceIndex: number;
  display: VideoFormatOption;
  raw: VideoFormatDetails;
};

export type JobStatus = 'idle' | 'running' | 'completed' | 'failed' | 'canceled';

export type VideoSectionProps = {
  analysisData?: VideoAnalysisData;
  onFormatSelect?: (formatIndex: number, formatData: VideoFormatDetails) => void;
  onDownloadStart?: () => void;
};

export type VideoFormatVisuals = {
  icon: LucideIcon;
  gradient: string;
};
