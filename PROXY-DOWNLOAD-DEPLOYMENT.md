# Proxy Download Fix - Deployment Checklist

## Changes Made

✅ **Frontend**: `web/lib/api-desktop/downloads.ts`
- `proxyDownload()` function now automatically appends JWT token to URL query params
- Supports both Supabase session tokens and localStorage fallback
- Enables direct browser downloads without 401 errors

✅ **Backend**: No changes needed
- `server/middleware/auth.ts` already supports `?token=` query parameter
- Originally implemented for SSE/EventSource compatibility
- Now also used for proxy-download browser navigation

## Deployment Steps

### 1. Deploy Frontend (Vercel)

```bash
cd web
npm run build
# Push to main branch - Vercel auto-deploys
git add .
git commit -m "fix: Add JWT token to proxy-download URLs for direct browser downloads"
git push origin main
```

### 2. No Backend Deployment Needed

The backend already supports token query params - no code changes required on Railway.

### 3. Test After Deployment

```bash
# 1. Login to the app
# 2. Analyze a YouTube video
# 3. Click "Download" on a thumbnail/subtitle
# 4. Verify it opens in new tab and downloads (not 401)
```

## Security Notes

⚠️ **Token Visibility**: JWT tokens are visible in:
- Browser URL bar
- Browser history
- Server access logs
- Network monitoring tools

✅ **Mitigation**:
- Supabase JWTs expire after 1 hour (default)
- HTTPS encrypts tokens in transit
- Tokens are user-scoped (can't access other user's data)
- Consider implementing signed URLs for higher security

## Rollback Plan

If issues occur, revert by removing token parameter:

```typescript
// In web/lib/api-desktop/downloads.ts
// Remove lines 42-58 (token append logic)
const target = new URL(`${API_BASE}/api/proxy-download`);
target.searchParams.set('url', options.url);
target.searchParams.set('filename', options.filename);
// Don't add token - will require fetch() API instead of direct navigation
```

## Future Enhancement: Signed URLs

For production-grade security, implement HMAC-signed temporary URLs:

```typescript
// Backend generates signed URL
const signature = crypto
  .createHmac('sha256', SECRET)
  .update(`${url}${filename}${expires}`)
  .digest('hex');

const signedUrl = `/api/proxy-download?url=${url}&sig=${signature}&exp=${expires}`;

// Frontend uses signed URL (no JWT in URL)
window.open(signedUrl, '_blank');
```

Benefits:
- No JWT exposure in URLs
- Time-limited (expires parameter)
- Purpose-specific (can't reuse for other endpoints)
- No session dependency
