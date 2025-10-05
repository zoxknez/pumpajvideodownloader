# Pumpaj Testing & Utility Scripts

Comprehensive collection of testing, validation, and utility scripts for Pumpaj Video Downloader.

---

## 📦 Available Scripts

### 1. **`release-smoke.sh`** - Release Smoke Test

Quick cURL-based smoke test for API endpoints.

**Usage:**
```bash
chmod +x release-smoke.sh

# Basic test (health + version only)
./release-smoke.sh

# Full test with auth
BASE_URL="https://pumpaj-backend-production.up.railway.app" \
TOKEN="your-jwt-token" \
YT_URL="https://www.youtube.com/watch?v=dQw4w9WgXcQ" \
./release-smoke.sh
```

**Tests:**
- ✅ Health check (`/health`)
- ✅ Version info (`/api/version`)
- ✅ Metrics (`/api/jobs/metrics`)
- ✅ Analyze URL (`/api/analyze`)
- ✅ History (`/api/history`)
- ✅ CORS preflight

---

### 2. **`pumpaj-postman-collection.json`** - Postman Collection

Complete API collection with 15+ endpoints.

**Usage:**
1. Import into Postman: `File → Import → pumpaj-postman-collection.json`
2. Set variables:
   - `baseUrl`: `https://pumpaj-backend-production.up.railway.app`
   - `token`: Your JWT token from Supabase
   - `ytUrl`: Test YouTube URL
3. Run requests individually or as collection

**Endpoints:**
- Health & Version
- Analyze URL
- Start/Cancel Jobs
- Job Metrics & Settings
- History (get/clear)
- Batch operations

---

### 3. **`k6-metrics-smoke.js`** - Load Test Script

k6 load test for performance validation.

**Prerequisites:**
```bash
# Install k6
brew install k6  # macOS
choco install k6  # Windows
# Or: https://k6.io/docs/getting-started/installation/
```

**Usage:**
```bash
# Basic test (5 VUs, 30s)
k6 run k6-metrics-smoke.js \
  -e BASE_URL=https://api.domain.com \
  -e TOKEN=your-jwt-token

# Stress test (50 VUs, 2min)
k6 run k6-metrics-smoke.js \
  -e BASE_URL=https://api.domain.com \
  -e TOKEN=your-jwt-token \
  --vus 50 \
  --duration 2m
```

**Thresholds:**
- 95% of requests < 500ms
- Less than 10% failure rate

---

### 4. **`CSP-allowlist.md`** - Content Security Policy Guide

Documentation for CSP (Content-Security-Policy) configuration.

**Topics:**
- Current CSP breakdown
- Hardening recommendations
- Report-Only mode setup
- Testing tools & methods
- Production-ready examples

---

### 5. **`sanitize-filename.ts`** - Filename Sanitization

TypeScript helper for safe filename generation.

**Features:**
- Windows reserved character handling
- Windows reserved name handling (CON, PRN, etc.)
- Unicode/emoji support
- Length truncation with extension preservation
- Video/audio filename generators

**Usage:**
```typescript
import { sanitizeFilename, generateVideoFilename } from './sanitize-filename';

// Basic sanitization
sanitizeFilename('Video: Title | 2024.mp4');
// => 'Video_ Title _ 2024.mp4'

// Generate video filename
generateVideoFilename('My Video', 'mp4', '1080p');
// => 'My Video [1080p].mp4'
```

**Integration Example (Express):**
```typescript
// In your download route
const safeFilename = sanitizeFilename(job.title + '.mp4');
res.download(filePath, safeFilename);
```

---

### 6. **`express-disposition-usage.ts`** - Content-Disposition Helper

Express middleware for safe Content-Disposition headers with UTF-8 support.

**Features:**
- RFC 5987 UTF-8 encoding
- ASCII fallback for old browsers
- Content-Length helper
- All-in-one download headers

**Usage:**
```typescript
import { setDownloadHeaders } from './express-disposition-usage';

app.get('/api/jobs/:id/file', (req, res) => {
  const job = getJob(req.params.id);
  
  setDownloadHeaders(res, {
    filename: `${job.title}.mp4`,
    size: job.fileSize,
    mimeType: 'video/mp4',
    type: 'attachment'
  });
  
  res.sendFile(job.filePath);
});
```

**What it sets:**
- `Content-Disposition` with UTF-8 + ASCII fallback
- `Content-Type`
- `Content-Length` (if known)
- `Cache-Control`
- `X-Content-Type-Options: nosniff`

---

### 7. **`sse-enhanced.ts`** - Enhanced SSE Helper

Advanced Server-Sent Events helper with visibility detection.

**Features:**
- Auto-close on tab hidden (saves resources)
- Optional auto-reconnect
- Multiple connection manager
- React hook example

**Usage:**
```typescript
import { subscribeJobProgressEnhanced } from './sse-enhanced';

const subscription = subscribeJobProgressEnhanced(
  'https://api.domain.com',
  jobId,
  (data) => setProgress(data.progress),
  (status) => console.log('Complete:', status),
  { autoCloseOnHidden: true }
);

// Cleanup
subscription.close();
```

**Multiple Jobs:**
```typescript
import { SSEConnectionManager } from './sse-enhanced';

const manager = new SSEConnectionManager();

manager.subscribe(API_BASE, 'job-1', onProgress, onComplete);
manager.subscribe(API_BASE, 'job-2', onProgress, onComplete);

// Close all
manager.closeAll();
```

---

## 🧪 Complete Testing Workflow

### 1. **Local Development**
```bash
# Start backend
cd server && npm run dev

# Start frontend
cd web && npm run dev

# Run smoke test
cd scripts
BASE_URL="http://localhost:5176" ./release-smoke.sh
```

### 2. **Pre-Deployment**
```bash
# Build frontend
cd web && npm run build

# Test production build locally
npm run start

# Run k6 load test
cd scripts
k6 run k6-metrics-smoke.js -e BASE_URL=http://localhost:3000
```

### 3. **Post-Deployment**
```bash
# Smoke test production
cd scripts
BASE_URL="https://pumpaj-backend-production.up.railway.app" \
TOKEN="prod-jwt-token" \
./release-smoke.sh

# Load test production (careful!)
k6 run k6-metrics-smoke.js \
  -e BASE_URL=https://pumpaj-backend-production.up.railway.app \
  --vus 10 \
  --duration 1m
```

### 4. **Manual Testing Checklist**
See `../TESTING-CHECKLIST.md` for comprehensive manual testing steps.

---

## 📊 Expected Results

### Smoke Test (release-smoke.sh)
```
🔥 Pumpaj Release Smoke Test
Base URL: https://api.domain.com

[1/6] Health check...
✅ Health OK

[2/6] Version info...
✅ Version: 1.2.3

[3/6] Metrics (auth required)...
✅ Metrics OK

[4/6] Analyze URL...
✅ Analyze OK: Rick Astley - Never Gonna Give You Up

[5/6] History...
✅ History OK (12 entries)

[6/6] CORS preflight...
✅ CORS OK: *

🎉 Smoke test complete!
```

### k6 Load Test
```
     ✓ health status is 200
     ✓ version status is 200
     ✓ metrics status is 200

     checks.........................: 100.00% ✓ 450  ✗ 0
     http_req_duration..............: avg=123ms  p(95)=245ms
     http_req_failed................: 0.00%   ✓ 0    ✗ 450
```

---

## 🔧 Troubleshooting

### Smoke Test Fails

**Error: `curl: command not found`**
- **Windows**: Install Git Bash or use PowerShell equivalent
- **macOS/Linux**: Install curl via package manager

**Error: `Health FAILED (HTTP 000)`**
- Check if backend is running
- Verify BASE_URL is correct
- Check network/firewall

**Error: `Metrics FAILED (HTTP 401)`**
- Token is expired or invalid
- Get fresh token from Supabase session

### k6 Test Fails

**Error: `k6: command not found`**
- Install k6: https://k6.io/docs/getting-started/installation/

**Error: `ERRO[0001] GoError: connection refused`**
- Backend is not running
- Check BASE_URL

---

## 📝 Integration Recommendations

### Backend (server/)

1. **Add filename sanitization to job routes:**
```typescript
import { sanitizeFilename } from '../scripts/sanitize-filename';

// In /api/jobs/:id/file
const safeFilename = sanitizeFilename(`${job.title}.${job.ext}`);
res.download(job.filePath, safeFilename);
```

2. **Use Content-Disposition helper:**
```typescript
import { setDownloadHeaders } from '../scripts/express-disposition-usage';

// In /api/jobs/:id/file
setDownloadHeaders(res, {
  filename: `${job.title}.mp4`,
  size: stats.size,
  mimeType: 'video/mp4'
});
```

### Frontend (web/)

1. **Use enhanced SSE in components:**
```typescript
import { subscribeJobProgressEnhanced } from '@/lib/sse-enhanced';

// In VideoSection or AudioSection
useEffect(() => {
  if (!jobId) return;
  
  const sub = subscribeJobProgressEnhanced(
    API_BASE,
    jobId,
    (data) => setProgress(data.progress),
    (status) => handleComplete(status),
    { autoCloseOnHidden: true }
  );
  
  return () => sub.close();
}, [jobId]);
```

---

## 🚀 Next Steps

1. **Run smoke test** after each deployment
2. **Schedule k6 tests** weekly (or after major changes)
3. **Monitor CSP violations** in browser console
4. **Integrate filename sanitization** in backend download routes
5. **Add SSE enhancements** to frontend job tracking

---

## 📚 Additional Resources

- [Next.js Security Headers](https://nextjs.org/docs/advanced-features/security-headers)
- [k6 Documentation](https://k6.io/docs/)
- [RFC 5987 (UTF-8 in HTTP Headers)](https://datatracker.ietf.org/doc/html/rfc5987)
- [MDN: Content-Disposition](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Content-Disposition)
- [MDN: Server-Sent Events](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events)

---

**Last Updated:** October 5, 2025  
**Maintained by:** Pumpaj Team
