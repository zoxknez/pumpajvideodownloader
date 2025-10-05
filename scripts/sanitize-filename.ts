/**
 * Sanitize filename for safe filesystem usage
 * Handles Windows reserved characters, long filenames, Unicode, emoji
 */

// Windows reserved characters
const WINDOWS_RESERVED = /[<>:"/\\|?*\x00-\x1F]/g;

// Windows reserved filenames (case-insensitive)
const WINDOWS_RESERVED_NAMES = new Set([
  'CON', 'PRN', 'AUX', 'NUL',
  'COM1', 'COM2', 'COM3', 'COM4', 'COM5', 'COM6', 'COM7', 'COM8', 'COM9',
  'LPT1', 'LPT2', 'LPT3', 'LPT4', 'LPT5', 'LPT6', 'LPT7', 'LPT8', 'LPT9',
]);

export interface SanitizeOptions {
  /** Maximum filename length (default: 200) */
  maxLength?: number;
  /** Replacement character for invalid chars (default: '_') */
  replacement?: string;
  /** Preserve extension (default: true) */
  preserveExtension?: boolean;
  /** Allow Unicode characters (default: true) */
  allowUnicode?: boolean;
}

/**
 * Sanitize a filename for safe use across filesystems
 * 
 * @example
 * sanitizeFilename('Video Title: 4K (2024).mp4')
 * // => 'Video Title_ 4K (2024).mp4'
 * 
 * sanitizeFilename('CON.txt')
 * // => '_CON.txt'
 * 
 * sanitizeFilename('Very Long Title...'.repeat(10) + '.mp4', { maxLength: 100 })
 * // => 'Very Long Title...Very Long T.mp4' (truncated to 100 chars)
 */
export function sanitizeFilename(
  filename: string,
  options: SanitizeOptions = {}
): string {
  const {
    maxLength = 200,
    replacement = '_',
    preserveExtension = true,
    allowUnicode = true,
  } = options;

  if (!filename || typeof filename !== 'string') {
    return 'unnamed';
  }

  // Extract extension
  const lastDot = filename.lastIndexOf('.');
  const hasExt = lastDot > 0 && lastDot < filename.length - 1;
  const ext = hasExt ? filename.slice(lastDot) : '';
  const base = hasExt ? filename.slice(0, lastDot) : filename;

  // Replace Windows reserved characters
  let sanitized = base.replace(WINDOWS_RESERVED, replacement);

  // Remove non-printable ASCII (if allowUnicode is false)
  if (!allowUnicode) {
    sanitized = sanitized.replace(/[^\x20-\x7E]/g, replacement);
  }

  // Trim whitespace and dots (Windows doesn't allow trailing dots/spaces)
  sanitized = sanitized.trim().replace(/[.\s]+$/, '');

  // Handle empty name after sanitization
  if (!sanitized) {
    sanitized = 'unnamed';
  }

  // Check for Windows reserved names (case-insensitive)
  const upperBase = sanitized.toUpperCase();
  if (WINDOWS_RESERVED_NAMES.has(upperBase)) {
    sanitized = replacement + sanitized;
  }

  // Truncate to maxLength (preserve extension if requested)
  const extLength = preserveExtension ? ext.length : 0;
  const availableLength = maxLength - extLength;
  
  if (sanitized.length > availableLength) {
    sanitized = sanitized.slice(0, availableLength);
  }

  // Combine base + extension
  const final = preserveExtension ? sanitized + ext : sanitized;

  // Final safety check: no empty filename
  return final || 'unnamed';
}

/**
 * Generate a safe filename from video title and format
 * 
 * @example
 * generateVideoFilename('My Video', 'mp4', '1080p')
 * // => 'My Video [1080p].mp4'
 */
export function generateVideoFilename(
  title: string,
  extension: string,
  quality?: string
): string {
  let base = sanitizeFilename(title, { preserveExtension: false });
  
  if (quality) {
    base += ` [${quality}]`;
  }
  
  const ext = extension.startsWith('.') ? extension : `.${extension}`;
  return sanitizeFilename(base + ext);
}

/**
 * Generate a safe filename from audio title and format
 * 
 * @example
 * generateAudioFilename('Song Title', 'mp3', '320kbps')
 * // => 'Song Title [320kbps].mp3'
 */
export function generateAudioFilename(
  title: string,
  extension: string,
  bitrate?: string
): string {
  let base = sanitizeFilename(title, { preserveExtension: false });
  
  if (bitrate) {
    base += ` [${bitrate}]`;
  }
  
  const ext = extension.startsWith('.') ? extension : `.${extension}`;
  return sanitizeFilename(base + ext);
}

// Example usage
if (require.main === module) {
  console.log('Sanitization tests:');
  console.log(sanitizeFilename('Normal File.mp4')); // => Normal File.mp4
  console.log(sanitizeFilename('File: With | Invalid * Chars?.mp4')); // => File_ With _ Invalid _ Chars_.mp4
  console.log(sanitizeFilename('CON.txt')); // => _CON.txt
  console.log(sanitizeFilename('Very'.repeat(100) + '.mp4', { maxLength: 50 })); // => VeryVeryVeryVeryVeryVeryVeryVeryVeryVeryV.mp4
  console.log(sanitizeFilename('Emoji 🎉 Video.mp4')); // => Emoji 🎉 Video.mp4
  console.log(sanitizeFilename('Emoji 🎉 Video.mp4', { allowUnicode: false })); // => Emoji _ Video.mp4
  
  console.log('\nGeneration tests:');
  console.log(generateVideoFilename('My Video', 'mp4', '1080p')); // => My Video [1080p].mp4
  console.log(generateAudioFilename('Song: Amazing!', 'mp3', '320kbps')); // => Song_ Amazing! [320kbps].mp3
}
