import { useCallback, useEffect, useMemo, useState } from 'react';
import type {
  VideoAnalysisData,
  VideoFormatDetails,
  VideoFormatOption,
  SelectedFormatResult,
  FormatBadge,
} from '../types';

type InternalFormat = VideoFormatOption & {
  raw: VideoFormatDetails;
};

type UseVideoFormatsParams = {
  analysisData?: VideoAnalysisData;
};

const BADGE_PRIORITY: Record<FormatBadge, number> = {
  recommended: 200,
  fast: 100,
  optimized: 150,
};

const parseHeight = (resolution?: string, quality?: string): number => {
  if (resolution) {
    const match = resolution.match(/x(\d+)/i);
    if (match?.[1]) {
      const value = parseInt(match[1], 10);
      if (Number.isFinite(value)) return value;
    }
  }
  if (quality) {
    const match = quality.match(/(\d{3,4})p/i);
    if (match?.[1]) {
      const value = parseInt(match[1], 10);
      if (Number.isFinite(value)) return value;
    }
  }
  return 0;
};

const codecScore = (codec?: string) => {
  if (!codec) return 1;
  const normalized = codec.toUpperCase();
  if (normalized.includes('H.264')) return 5;
  if (normalized.includes('AV1')) return 4;
  if (normalized.includes('VP9')) return 3;
  return 1;
};

const containerScore = (format?: string) => {
  if (!format) return 2;
  const normalized = format.toUpperCase();
  if (normalized === 'MP4') return 5;
  if (normalized === 'WEBM') return 3;
  return 2;
};

const qualityScore = (format: InternalFormat) => {
  const badge = format.badge;
  const badgeValue = badge ? BADGE_PRIORITY[badge] ?? 0 : 0;
  const fpsValue = Number.isFinite(format.fps) ? Number(format.fps) : 0;
  const hdrValue = format.isHdr ? 20 : 0;
  return badgeValue + fpsValue + hdrValue + containerScore(format.format) + codecScore(format.codec);
};

const sanitizeBadge = (value?: string): FormatBadge | undefined => {
  if (!value) return undefined;
  const normalized = value.toLowerCase();
  if (normalized === 'recommended' || normalized === 'fast' || normalized === 'optimized') {
    return normalized;
  }
  return undefined;
};

const toDisplayOption = (format: InternalFormat): VideoFormatOption => {
  const { raw, ...rest } = format;
  return rest;
};

export const useVideoFormats = ({ analysisData }: UseVideoFormatsParams) => {
  const [selectedFormat, setSelectedFormat] = useState<number>(0);

  const normalizedFormats = useMemo<InternalFormat[]>(() => {
    if (!analysisData?.formats?.length) return [];
    return analysisData.formats.map((format, index) => {
      const badge = sanitizeBadge(format.badge);
      const badgeLabel = badge ? badge.toUpperCase() : undefined;
      return {
        id:
          format.formatId ||
          format.url ||
          `${format.format}-${format.quality}-${format.resolution}-${format.codec ?? 'unknown'}-${index}`,
        sourceIndex: index,
        format: format.format,
        quality: format.quality,
        resolution: format.resolution,
        fileSize: format.fileSize,
        bitrate: format.bitrate,
        fps: format.fps,
        codec: format.codec,
        isHdr: format.isHdr,
        badge,
        badgeLabel,
        formatId: format.formatId,
        url: format.url,
        raw: format,
      } satisfies InternalFormat;
    });
  }, [analysisData?.formats]);

  const finalFormats = useMemo<InternalFormat[]>(() => {
    if (!normalizedFormats.length) return [];

    const byHeight = new Map<number, InternalFormat>();
    normalizedFormats.forEach((format) => {
      const height = parseHeight(format.resolution, format.quality);
      const existing = byHeight.get(height);
      if (!existing || qualityScore(format) > qualityScore(existing)) {
        byHeight.set(height, format);
      }
    });

    const heights = Array.from(byHeight.keys()).sort((a, b) => b - a);
    if (!heights.length) return [];

    const maxHeight = heights[0];
    let desiredHeights: number[] = [];
    if (maxHeight >= 2160) desiredHeights = [480, 720, 1080, 2160];
    else if (maxHeight >= 1440) desiredHeights = [480, 720, 1080, 1440];
    else if (maxHeight >= 1080) desiredHeights = [360, 480, 720, 1080];
    else if (maxHeight >= 720) desiredHeights = [240, 360, 480, 720];
    else desiredHeights = heights.slice(0, 4).reverse();

    const pickClosest = (target: number) => {
      let bestHeight = -1;
      for (const height of heights) {
        if (height <= target && height > bestHeight) bestHeight = height;
      }
      if (bestHeight === -1) bestHeight = heights[heights.length - 1];
      return byHeight.get(bestHeight);
    };

    const used = new Set<number>();
    const chosen: InternalFormat[] = [];
    desiredHeights.forEach((target) => {
      const candidate = pickClosest(target);
      if (!candidate) return;
      const height = parseHeight(candidate.resolution, candidate.quality);
      if (used.has(height)) return;
      used.add(height);
      chosen.push(candidate);
    });

    return chosen
      .slice(0, 4)
      .sort(
        (a, b) =>
          parseHeight(b.resolution, b.quality) -
          parseHeight(a.resolution, a.quality)
      );
  }, [normalizedFormats]);

  useEffect(() => {
    if (!analysisData?.sourceUrl) {
      setSelectedFormat(0);
      return;
    }
    const first = finalFormats[0];
    setSelectedFormat(first ? first.sourceIndex : 0);
  }, [analysisData?.sourceUrl, finalFormats]);

  const selectFormat = useCallback(
    (displayIndex: number): SelectedFormatResult | null => {
      const format = finalFormats[displayIndex];
      if (!format) return null;
      setSelectedFormat(format.sourceIndex);
      return {
        sourceIndex: format.sourceIndex,
        display: toDisplayOption(format),
        raw: format.raw,
      } satisfies SelectedFormatResult;
    },
    [finalFormats]
  );

  const displayFormats: VideoFormatOption[] = useMemo(
    () => finalFormats.map(toDisplayOption),
    [finalFormats]
  );

  return {
    displayFormats,
    selectedFormat,
    selectFormat,
  };
};
