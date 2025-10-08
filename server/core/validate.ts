import { z } from 'zod';

const HttpUrl = z
  .string()
  .url()
  .max(2000)
  .refine((u) => /^https?:\/\//i.test(u), 'Only http/https allowed');

const SafeTitle = z
  .string()
  .trim()
  .min(1, 'Title required')
  .max(160, 'Title too long')
  .optional();

const AudioFormat = z
  .string()
  .regex(/^[a-zA-Z0-9](?:[a-zA-Z0-9._-]{0,31})?$/, 'Invalid format')
  .optional();

export const AnalyzeBody = z.object({
  url: HttpUrl,
});

export const StartVideoJobBody = z.object({
  url: HttpUrl,
  title: SafeTitle,
});

export const StartAudioJobBody = z.object({
  url: HttpUrl,
  title: SafeTitle,
  format: AudioFormat,
});

export const StartClipJobBody = z
  .object({
    url: HttpUrl,
    title: SafeTitle,
    start: z
      .coerce.number()
      .refine(Number.isFinite, 'Invalid start')
      .refine((n) => n >= 0, 'Start must be non-negative'),
    end: z
      .coerce.number()
      .refine(Number.isFinite, 'Invalid end')
      .refine((n) => n >= 0, 'End must be non-negative'),
  })
  .refine((data) => data.end > data.start, {
    message: 'End must be greater than start',
    path: ['end'],
  });

export type AnalyzeBodyType = z.infer<typeof AnalyzeBody>;
export type StartVideoJobBodyType = z.infer<typeof StartVideoJobBody>;
export type StartAudioJobBodyType = z.infer<typeof StartAudioJobBody>;
export type StartClipJobBodyType = z.infer<typeof StartClipJobBody>;

export function parseUrlAllowed(u: string) {
  try {
    return /^https?:\/\//i.test(u);
  } catch {
    return false;
  }
}
