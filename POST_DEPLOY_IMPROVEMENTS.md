# Post-Deploy Improvements Checklist

## ✅ Deployment Fixes (DONE - Commit b0b783a)

- [x] Railway: Skip youtube-dl-exec broken postinstall (`--ignore-scripts`)
- [x] Vercel: Fix module resolution (simplified installCommand)

## ✅ P0 + P1 Critical Fixes (DONE - Commit 509e208)

- [x] **P0: Signed URL Auth** - Removed `/api/job` from global `requireAuth` middleware
- [x] **P0: 206 Range Cleanup** - Added `Vary: Range` + cleanup for full range (0..size-1)
- [x] **P0: formatId Injection** - Already validated (regex present on line 891) ✅
- [x] **P0: SSE Buffer Leak** - Already validated (cleanup in `finalizeJob()`) ✅
- [x] **P0: FFmpeg-free Fallbacks** - Already validated (all 8 endpoints use conditional logic) ✅
- [x] **P1: CORS Headers** - Added Range/ETag/Last-Modified support for progressive downloads
- [x] **P1: SSE Timeout (1h)** - Activity-based reset (resets on every heartbeat ping)
- [x] **P1: IG/FB Headers** - Added Instagram + Facebook referer/user-agent to `makeHeaders()`
- [x] **P1: Trust Proxy** - Set to `1` for Railway single-hop (accurate rate limit keys)

---

---

## 🔧 Remaining Optional Improvements (Lower Priority)

### 1. Active Readers Tracking (Windows Safety) 🟢 LOW

**Problem:** Windows can't unlink open files. Reaper may fail on active downloads.

**Solution:** Track active readers, skip in reaper

```typescript
// Top of file with other Maps
const activeReaders = new Map<string, number>(); // jobId -> refcount

// In /api/job/file/:id when opening stream
activeReaders.set(id, (activeReaders.get(id) || 0) + 1);
const done = () => {
  const n = (activeReaders.get(id) || 1) - 1;
  n ? activeReaders.set(id, n) : activeReaders.delete(id);
};
res.on('close', done);
res.on('aborted', done);
stream.on('close', done);

// In reaper loop
if (activeReaders.has(job.id)) {
  continue; // Skip active downloads
}
```

**File:** `server/index.ts` line ~150 (globals) + ~2140 (job file route) + ~560 (reaper)

**Note:** Railway (Linux) doesn't need this - only relevant for Windows deployments.

---

### 2. Signed Token Revocation (Optional) 🟢 LOW

**Problem:** Signed tokens remain valid even after job completion.

**Solution:** Bump job version on finalize (not just cleanup)

```typescript
// In finalizeJob() function around line ~470
if (!keepJob) {
  try {
    bumpJobVersion(job); // Invalidate all tokens
    jobs.delete(id);
  } catch {}
}
```

**File:** `server/index.ts` line ~490

**Note:** Only enable if you want strict "one-time download" policy. Not critical for current use case.

---

## 🧪 Production QA Checklist (Post-509e208)

**Deployment Validation:**
- [x] Railway build: npm ci succeeds (no postinstall errors)
- [x] Vercel build: Module resolution works (components found)
- [ ] Railway /health: Returns 200 OK
- [ ] Vercel site: Loads at pumpajvideodl.com

**P0/P1 Fixes Validation:**
- [ ] **Signed URL:** `GET /api/job/file/:id?s=TOKEN` → 200 (not 401)
- [ ] **Range cleanup:** Download full file via 206 → file deleted + job finalized
- [ ] **formatId injection:** `POST /api/get-url` with `'; rm -rf /'` → 400 `invalid_format_id`
- [ ] **SSE timeout:** Long job (>10min) maintains SSE connection (activity reset)
- [ ] **CORS Range:** Preflight `OPTIONS` with `Access-Control-Request-Headers: range` → allowed
- [ ] **IG headers:** Instagram video URL → lower 403 rate (monitor logs)
- [ ] **FB headers:** Facebook video URL → lower 403 rate (monitor logs)
- [ ] **Trust proxy:** Rate limit key uses real client IP (not Railway proxy)

**FFmpeg-Free Verification:**
- [ ] YouTube 720p video (progressive stream, no merge)
- [ ] M4A audio direct stream (no conversion)
- [ ] All 8 batch modes work in FFmpeg-free mode

---

## � Monitoring Metrics

**Watch after deploy (commit 509e208):**

| Metric | Expected Change | Reason |
|--------|----------------|--------|
| Railway memory | Stabilize/decrease | SSE buffer cleanup (already in place) |
| Disk usage (orphan files) | Decrease | Range 206 cleanup on full delivery |
| SSE timeout events | Rare (<1%) | Activity-based 1h timeout |
| 403 errors (IG/FB URLs) | Decrease 20-30% | Referer/user-agent headers |
| Rate limit false positives | Decrease | Trust proxy fix (req.ip = real client) |

---

## � Implementation Notes

- **SSE timeout (1h):** Critical for playlists and 1080p+ downloads
- **Active readers:** Only needed for Windows servers (Railway is Linux - skip)
- **Token revocation:** Optional strict policy - not essential for current workflow
- **IG/FB headers:** May still fail for private/auth-required content (expected)

---

_Created: 2025-10-07_  
_Updated: 2025-10-07 (Commit 509e208)_  
_Related Commits:_
- `d75e545` - P0/P1 security + FFmpeg removal
- `b0b783a` - Railway/Vercel deployment fixes  
- `509e208` - **Final P0/P1 stabilization** (signed URL, range cleanup, SSE timeout, CORS, IG/FB, trust proxy)
