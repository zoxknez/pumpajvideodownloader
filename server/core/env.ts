/**
 * Environment variable utilities
 * Consistent parsing of boolean and optional values
 */

/**
 * Parse truthy environment variable
 * Accepts: 1, true, yes, on (case-insensitive)
 */
export const isTrue = (v?: string): boolean => 
  /^(1|true|yes|on)$/i.test(String(v || ''));

/**
 * Parse falsy environment variable
 * Accepts: 0, false, no, off (case-insensitive)
 */
export const isFalse = (v?: string): boolean => 
  /^(0|false|no|off)$/i.test(String(v || ''));

/**
 * Check if FFmpeg is enabled
 * Returns true unless explicitly disabled
 */
export const ffmpegEnabled = (): boolean => 
  !isFalse(process.env.ENABLE_FFMPEG);

/**
 * Get environment variable with default
 */
export const getEnv = (key: string, defaultValue = ''): string => 
  process.env[key] || defaultValue;

/**
 * Get integer environment variable with default
 */
export const getEnvInt = (key: string, defaultValue: number): number => {
  const val = process.env[key];
  if (!val) return defaultValue;
  const parsed = parseInt(val, 10);
  return Number.isFinite(parsed) ? parsed : defaultValue;
};

/**
 * Get float environment variable with default
 */
export const getEnvFloat = (key: string, defaultValue: number): number => {
  const val = process.env[key];
  if (!val) return defaultValue;
  const parsed = parseFloat(val);
  return Number.isFinite(parsed) ? parsed : defaultValue;
};
