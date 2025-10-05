# Content Security Policy (CSP) Allowlist Guide

## Current CSP (from `web/next.config.js`)

```
Content-Security-Policy: default-src 'self'; 
  img-src 'self' data: blob: https:; 
  media-src 'self' blob:; 
  connect-src 'self' https: http:; 
  script-src 'self' 'unsafe-inline' 'unsafe-eval'; 
  style-src 'self' 'unsafe-inline';
```

## Breakdown

### `default-src 'self'`
- Base policy: only allow resources from same origin
- Fallback for any directive not explicitly set

### `img-src 'self' data: blob: https:`
- Allow images from:
  - Same origin (`'self'`)
  - Data URIs (`data:`)
  - Blob URLs (`blob:`)
  - Any HTTPS domain (`https:`)
- **Why**: Thumbnail previews from YouTube/other platforms use external HTTPS URLs

### `media-src 'self' blob:`
- Allow video/audio from:
  - Same origin (`'self'`)
  - Blob URLs (`blob:`)
- **Why**: Downloaded files are often served via blob URLs in browser

### `connect-src 'self' https: http:`
- Allow fetch/XHR/SSE/WebSocket to:
  - Same origin (`'self'`)
  - Any HTTPS domain (`https:`)
  - Any HTTP domain (`http:`)
- **Why**: Backend API (Railway), Supabase, yt-dlp metadata fetches

### `script-src 'self' 'unsafe-inline' 'unsafe-eval'`
- Allow scripts from:
  - Same origin (`'self'`)
  - Inline scripts (`'unsafe-inline'`)
  - `eval()` and dynamic code execution (`'unsafe-eval'`)
- **Why**: Next.js uses inline scripts for hydration; React dev tools use eval
- **⚠️ Risk**: `'unsafe-inline'` and `'unsafe-eval'` weaken XSS protection

### `style-src 'self' 'unsafe-inline'`
- Allow styles from:
  - Same origin (`'self'`)
  - Inline styles (`'unsafe-inline'`)
- **Why**: Tailwind CSS uses inline styles; React components have inline styles

---

## Hardening Recommendations

### 1. **Remove `'unsafe-inline'` and `'unsafe-eval'` (production)**

Use **nonces** or **hashes** for inline scripts:

```js
// next.config.js
const crypto = require('crypto');

const nextConfig = {
  async headers() {
    const nonce = crypto.randomBytes(16).toString('base64');
    return [{
      source: '/(.*)',
      headers: [
        {
          key: 'Content-Security-Policy',
          value: `
            default-src 'self';
            img-src 'self' data: blob: https:;
            media-src 'self' blob:;
            connect-src 'self' https://pumpaj-backend-production.up.railway.app https://smzxjnuqfvpzfzmyxpbp.supabase.co;
            script-src 'self' 'nonce-${nonce}';
            style-src 'self' 'nonce-${nonce}';
          `.replace(/\s+/g, ' ').trim(),
        },
      ],
    }];
  },
};
```

**Note**: Next.js doesn't support per-request nonces easily. Consider **CSP Report-Only** mode first.

---

### 2. **Use Report-Only Mode (testing)**

Test CSP without breaking the site:

```js
{
  key: 'Content-Security-Policy-Report-Only',
  value: "default-src 'self'; report-uri /api/csp-report;"
}
```

Monitor violations in browser console or send to `/api/csp-report` endpoint.

---

### 3. **Restrict `connect-src` to Known Domains**

Replace `https: http:` with explicit allowlist:

```
connect-src 'self' 
  https://pumpaj-backend-production.up.railway.app 
  https://smzxjnuqfvpzfzmyxpbp.supabase.co 
  https://accounts.google.com;
```

**Why**: Prevents malicious scripts from exfiltrating data to arbitrary domains.

---

### 4. **Add `upgrade-insecure-requests`**

Force HTTP → HTTPS upgrades:

```
upgrade-insecure-requests;
```

Useful if backend has mixed HTTP/HTTPS endpoints.

---

### 5. **Add `frame-ancestors 'none'`**

Prevent embedding in iframes (alternative to `X-Frame-Options`):

```
frame-ancestors 'none';
```

Already have `X-Frame-Options: DENY`, but CSP is more modern.

---

## Testing CSP

### Browser Console
1. Open DevTools → Console
2. Look for CSP violation warnings (red text)
3. Example: `Refused to load the script 'https://evil.com/script.js' because it violates the following Content Security Policy directive: "script-src 'self'"`

### cURL Test
```bash
curl -I https://pumpajvideodl.com | grep -i "content-security-policy"
```

### Online Tools
- [CSP Evaluator](https://csp-evaluator.withgoogle.com/)
- [Report URI](https://report-uri.com/)

---

## Example: Production-Ready CSP

```js
// web/next.config.js
const nextConfig = {
  async headers() {
    return [{
      source: '/(.*)',
      headers: [
        {
          key: 'Content-Security-Policy',
          value: `
            default-src 'self';
            img-src 'self' data: blob: https:;
            media-src 'self' blob:;
            connect-src 'self' 
              https://pumpaj-backend-production.up.railway.app 
              https://smzxjnuqfvpzfzmyxpbp.supabase.co 
              https://accounts.google.com;
            script-src 'self' 'unsafe-inline' 'unsafe-eval';
            style-src 'self' 'unsafe-inline';
            frame-ancestors 'none';
            base-uri 'self';
            form-action 'self';
            upgrade-insecure-requests;
          `.replace(/\s+/g, ' ').trim(),
        },
      ],
    }];
  },
};
```

---

## Summary

| Directive | Current | Recommendation |
|-----------|---------|----------------|
| `default-src` | `'self'` | ✅ Keep |
| `img-src` | `'self' data: blob: https:` | ✅ Keep (thumbnails) |
| `connect-src` | `'self' https: http:` | ⚠️ Restrict to known domains |
| `script-src` | `'self' 'unsafe-inline' 'unsafe-eval'` | ⚠️ Use nonces (advanced) |
| `style-src` | `'self' 'unsafe-inline'` | ⚠️ Use nonces (advanced) |

**Start with Report-Only mode to avoid breaking changes!**
