import { z } from 'zod';

export const AnalyzeBody = z.object({
  url: z.string().url().refine((u) => /^https?:\/\//i.test(u), 'Only http/https allowed').max(2000),
});

export type AnalyzeBodyType = z.infer<typeof AnalyzeBody>;

export function parseUrlAllowed(u: string) {
  try { return /^https?:\/\//i.test(u); } catch { return false; }
}
