/**
 * Express middleware helper for safe Content-Disposition headers
 * Handles UTF-8 filenames with RFC 5987 encoding and ASCII fallback
 */

import { Response } from 'express';
import { sanitizeFilename } from './sanitize-filename';

/**
 * Set Content-Disposition header with proper UTF-8 encoding
 * Uses RFC 5987 (filename*=UTF-8'') for modern browsers
 * Falls back to ASCII-safe filename for old browsers
 * 
 * @example
 * // In your Express route:
 * app.get('/download', (req, res) => {
 *   const filename = 'Video: Café ☕ 2024.mp4';
 *   setContentDisposition(res, filename, 'attachment');
 *   res.sendFile('/path/to/file.mp4');
 * });
 */
export function setContentDisposition(
  res: Response,
  filename: string,
  type: 'inline' | 'attachment' = 'attachment'
): void {
  // Sanitize filename for ASCII fallback
  const safeFilename = sanitizeFilename(filename, {
    allowUnicode: false,
    maxLength: 200,
  });

  // RFC 5987: filename*=UTF-8''encoded-filename
  const encodedFilename = encodeRFC5987ValueChars(filename);

  // Set both headers for maximum compatibility
  // Modern browsers use filename*, old browsers use filename
  res.setHeader(
    'Content-Disposition',
    `${type}; filename="${safeFilename}"; filename*=UTF-8''${encodedFilename}`
  );
}

/**
 * Encode filename according to RFC 5987
 * Allows UTF-8 characters in HTTP headers
 * 
 * @see https://datatracker.ietf.org/doc/html/rfc5987
 */
function encodeRFC5987ValueChars(str: string): string {
  return encodeURIComponent(str)
    // Note: although RFC 5987 allows more characters, we use standard encodeURIComponent
    // and then fix a few specific chars that should not be encoded
    .replace(/['()]/g, escape) // i.e., %27 %28 %29
    .replace(/\*/g, '%2A')
    // The following are not required for percent-encoding per RFC5987,
    // so we can improve readability by not encoding them
    .replace(/%(?:7C|60|5E)/g, unescape);
}

/**
 * Express middleware to set Content-Disposition for job downloads
 * Automatically handles filename extraction and sanitization
 * 
 * @example
 * // In your Express app:
 * app.get('/api/jobs/:id/file', authMiddleware, (req, res) => {
 *   const job = getJobById(req.params.id);
 *   const filename = `${job.title}.${job.extension}`;
 *   
 *   setContentDisposition(res, filename);
 *   res.sendFile(job.filePath);
 * });
 */

/**
 * Set Content-Length header if file size is known
 * Helps browser show accurate download progress
 */
export function setContentLength(res: Response, bytes: number): void {
  res.setHeader('Content-Length', bytes.toString());
}

/**
 * Set complete download headers (all-in-one helper)
 * 
 * @example
 * setDownloadHeaders(res, {
 *   filename: 'Video Title.mp4',
 *   size: 1024000,
 *   mimeType: 'video/mp4',
 *   type: 'attachment'
 * });
 */
export interface DownloadHeadersOptions {
  filename: string;
  size?: number;
  mimeType?: string;
  type?: 'inline' | 'attachment';
  cacheControl?: string;
}

export function setDownloadHeaders(
  res: Response,
  options: DownloadHeadersOptions
): void {
  const {
    filename,
    size,
    mimeType = 'application/octet-stream',
    type = 'attachment',
    cacheControl = 'private, no-cache',
  } = options;

  // Content-Disposition
  setContentDisposition(res, filename, type);

  // Content-Type
  res.setHeader('Content-Type', mimeType);

  // Content-Length (if known)
  if (size !== undefined && size > 0) {
    setContentLength(res, size);
  }

  // Cache-Control
  res.setHeader('Cache-Control', cacheControl);

  // Additional security headers for downloads
  res.setHeader('X-Content-Type-Options', 'nosniff');
}

/**
 * Example Express route using download headers
 */
export function exampleDownloadRoute() {
  // This is example code, not executed
  const exampleCode = `
  import express from 'express';
  import { setDownloadHeaders } from './express-disposition-usage';
  import fs from 'fs';
  
  const app = express();
  
  app.get('/api/jobs/:id/file', (req, res) => {
    const jobId = req.params.id;
    const job = getJobById(jobId); // Your job lookup logic
    
    if (!job || !job.filePath) {
      return res.status(404).json({ error: 'Job not found' });
    }
    
    const stats = fs.statSync(job.filePath);
    const filename = \`\${job.title}.\${job.extension}\`;
    
    setDownloadHeaders(res, {
      filename,
      size: stats.size,
      mimeType: job.mimeType || 'video/mp4',
      type: 'attachment'
    });
    
    // Stream file to response
    const stream = fs.createReadStream(job.filePath);
    stream.pipe(res);
    
    stream.on('error', (err) => {
      console.error('Stream error:', err);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Stream error' });
      }
    });
  });
  `;
  
  return exampleCode;
}

// Test examples
if (require.main === module) {
  console.log('RFC 5987 encoding tests:');
  console.log(encodeRFC5987ValueChars('Simple.mp4')); // => Simple.mp4
  console.log(encodeRFC5987ValueChars('Café ☕.mp4')); // => Caf%C3%A9%20%E2%98%95.mp4
  console.log(encodeRFC5987ValueChars('Српски: Видео 🎉.mp4')); // => %D0%A1%D1%80%D0%BF%D1%81%D0%BA%D0%B8...
  
  console.log('\nExample Content-Disposition headers:');
  console.log('attachment; filename="Cafe_.mp4"; filename*=UTF-8\'\'Caf%C3%A9%20%E2%98%95.mp4');
}
