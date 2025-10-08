# Proxy Download Authentication Fix

## Problem

When users click download buttons for thumbnails, subtitles, or chapters, the link opens in a new browser tab. The browser cannot send the `Authorization` header for direct navigation, resulting in 401 Unauthorized errors.

## Solution

The `/api/proxy-download` endpoint now accepts authentication tokens via **query parameter** (`?token=...`) as a fallback when the `Authorization` header is not present.

### How It Works

1. **Frontend**: `proxyDownload()` function automatically appends the user's JWT token to the URL:
   ```typescript
   const target = new URL(`${API_BASE}/api/proxy-download`);
   target.searchParams.set('url', mediaUrl);
   target.searchParams.set('filename', 'file.jpg');
   target.searchParams.set('token', userJwtToken); // ← Added automatically
   ```

2. **Backend**: `requireAuth` middleware checks for token in this order:
   - `Authorization: Bearer <token>` header (primary)
   - `?token=<token>` query parameter (fallback for browser navigation)
   - Cookie-based session (if configured)

3. **Security Considerations**:
   - Token appears in URL (visible in browser history/logs)
   - Short-lived tokens (Supabase JWTs expire after 1 hour by default)
   - HTTPS required in production to prevent token leakage
   - Consider implementing signed URLs for higher security

### Code Changes

**File**: `web/lib/api-desktop/downloads.ts`
```typescript
// Before
const target = new URL(`${API_BASE}/api/proxy-download`);
target.searchParams.set('url', options.url);

// After
const target = new URL(`${API_BASE}/api/proxy-download`);
target.searchParams.set('url', options.url);
// Token automatically added from Supabase session
const token = await getSessionToken();
if (token) target.searchParams.set('token', token);
```

**No Backend Changes Required** - `server/middleware/auth.ts` already supports `?token=` query param (implemented for SSE/EventSource compatibility).

## Testing

```bash
# Test thumbnail download
curl "https://your-api.railway.app/api/proxy-download?url=https://example.com/thumb.jpg&filename=thumb.jpg&token=YOUR_JWT_TOKEN"

# Should return 200 OK with image data (not 401)
```

## Alternative: Signed URLs (Future Enhancement)

For higher security, consider implementing time-limited signed URLs:
```typescript
GET /api/proxy-download?url=...&filename=...&signature=HMAC&expires=1234567890
```

This avoids exposing JWT tokens in URLs while maintaining browser navigation support.
