/**
 * Rate limiting middleware for API endpoints
 * Prevents spam and protects upstream services
 */

import rateLimit from 'express-rate-limit';

/**
 * Rate limiter for analyze endpoint
 * 30 requests per minute per IP
 */
export const analyzeRateLimit = rateLimit({
  windowMs: 60_000, // 1 minute
  max: 30, // 30 requests per window per IP
  standardHeaders: true, // Return rate limit info in `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  message: { error: 'Too many analyze requests. Please slow down.' },
  // Skip successful responses from counting against the limit
  skipSuccessfulRequests: false,
  // Skip failed responses from counting against the limit
  skipFailedRequests: false,
});

/**
 * Rate limiter for download endpoints
 * 60 requests per minute per IP (more generous for downloads)
 */
export const downloadRateLimit = rateLimit({
  windowMs: 60_000, // 1 minute
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many download requests. Please slow down.' },
});

/**
 * Rate limiter for batch operations
 * 10 requests per minute per IP (stricter for batch)
 */
export const batchRateLimit = rateLimit({
  windowMs: 60_000, // 1 minute
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many batch requests. Please slow down.' },
});

/**
 * Global rate limiter
 * 300 requests per minute per IP (fallback for all routes)
 */
export const globalRateLimit = rateLimit({
  windowMs: 60_000, // 1 minute
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Please slow down.' },
});
