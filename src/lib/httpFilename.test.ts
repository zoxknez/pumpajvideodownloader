import { describe, it, expect } from 'vitest';
import { parseFilenameFromContentDisposition, inferExtFromContentType } from './httpFilename';

describe('http filename helpers', () => {
  describe('parseFilenameFromContentDisposition', () => {
    it('parses plain filename', () => {
      expect(parseFilenameFromContentDisposition('attachment; filename="video.mp4"')).toBe('video.mp4');
      expect(parseFilenameFromContentDisposition('attachment; filename=audio.m4a')).toBe('audio.m4a');
    });
    it('parses RFC5987 encoded filename*', () => {
      expect(parseFilenameFromContentDisposition("attachment; filename*=UTF-8''My%20File.webm")).toBe('My File.webm');
    });
    it('returns null when not present', () => {
      expect(parseFilenameFromContentDisposition(undefined)).toBeNull();
      expect(parseFilenameFromContentDisposition('inline')).toBeNull();
    });
  });

  describe('inferExtFromContentType', () => {
    it('maps common media types', () => {
      expect(inferExtFromContentType('video/mp4')).toBe('.mp4');
      expect(inferExtFromContentType('video/webm')).toBe('.webm');
      expect(inferExtFromContentType('audio/mpeg')).toBe('.mp3');
      expect(inferExtFromContentType('audio/mp4')).toBe('.m4a');
      expect(inferExtFromContentType('application/vnd.apple.mpegurl')).toBe('.m3u8');
    });
    it('returns null for unknown', () => {
      expect(inferExtFromContentType('application/octet-stream')).toBeNull();
      expect(inferExtFromContentType(undefined)).toBeNull();
    });
  });
});
