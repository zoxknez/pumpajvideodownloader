# Post-Deploy Improvements Checklist

## ✅ Deployment Fixes (DONE - Commit b0b783a)

- [x] Railway: Skip youtube-dl-exec broken postinstall (`--ignore-scripts`)
- [x] Vercel: Fix module resolution (simplified installCommand)

---

## 🔧 Recommended Improvements (Priority Order)

### 1. SSE Timeout vs Token TTL (Robustness) 🟡 MEDIUM

**Problem:** Server closes SSE after ~10min, but signed token TTL is 600s. Long jobs may experience silent disconnects.

**Solution:** Activity-based timeout reset

```typescript
// /api/progress/:id - around line ~700
const SSE_TIMEOUT_MS = 60 * 60 * 1000; // 1 hour instead of 10min

const arm = () => {
  if (timeout) clearTimeout(timeout);
  timeout = setTimeout(() => {
    pushSse(id, { id, status: 'timeout' }, 'end');
    cleanup();
  }, SSE_TIMEOUT_MS);
};

arm(); // Initial arm

// Reset timeout on every event (ping or progress)
hb = setInterval(() => {
  safeWrite(`event: ping\ndata: {"ts":${Date.now()}}\n\n`);
  arm(); // Reset timeout on ping
}, 15000);
```

**File:** `server/index.ts` around line ~700-730 (SSE /api/progress/:id route)

---

### 2. Reaper vs Active Readers (Windows Safety) 🟢 LOW

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

---

### 3. Vary Header for Range Responses 🟢 LOW

**Problem:** Cache/proxy correctness - Range responses should vary by Range header.

**Solution:** Add `Vary: Range` alongside `Vary: Authorization`

```typescript
// In /api/job/file/:id around line ~2160
res.setHeader('Accept-Ranges', 'bytes');
appendVary(res, 'Authorization');
appendVary(res, 'Range'); // Add this line
```

**File:** `server/index.ts` line ~2160

---

### 4. Headers for Instagram/Facebook 🟡 MEDIUM

**Problem:** IG/FB may return 403 without proper referer/user-agent.

**Solution:** Extend `makeHeaders()` function

```typescript
// In makeHeaders() function around line ~250
if (h.includes('instagram.com')) {
  return [
    'referer: https://www.instagram.com',
    'user-agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
  ];
}
if (h.includes('facebook.com') || h.includes('fbcdn.net')) {
  return [
    'referer: https://www.facebook.com',
    'user-agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
  ];
}
```

**File:** `server/index.ts` line ~250 (makeHeaders function)

---

### 5. FFmpeg-Free Double Check 🟢 LOW

**Status:** Already applied in commit d75e545, but verify all paths:

**Checklist:**
- [x] `/api/download/best` - Progressive fallback ✓
- [x] `/api/download/audio` - bestaudio native ✓
- [x] `/api/download/chapter` - Progressive fallback ✓
- [x] Batch best video - Progressive fallback ✓
- [x] Batch audio - bestaudio native ✓
- [x] Batch clip - Progressive fallback ✓
- [x] Batch convert - Progressive fallback ✓
- [x] Batch multi-URL - Both fallbacks ✓

**Verification Command:**
```bash
grep -n "bv\*\[height" server/index.ts | grep -v "process.env.ENABLE_FFMPEG"
# Should return 0 results (all paths have FFmpeg-free check)
```

---

### 6. Signed Token Revocation (Optional) 🟢 LOW

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

---

## 🧪 Production QA Checklist

Before marking improvements complete, test:

- [ ] 720p YouTube progressive video (FFmpeg-free mode)
- [ ] M4A audio direct stream (no conversion)
- [ ] SSE reconnect after 15+ minutes (long job)
- [ ] Partial range request (multiple segments) - file cleanup
- [ ] `/api/get-url` with malicious formatId (`'; rm -rf /`) → 400 error
- [ ] Instagram video download (with new headers)
- [ ] Facebook video download (with new headers)
- [ ] Windows: Download file while reaper runs - no unlink errors

---

## 📝 Implementation Notes

**SSE Timeout:** Most important for long video downloads (1080p+ playlist items).

**Active Readers:** Only needed if running on Windows server. Linux/Railway OK without it.

**Vary Header:** Mostly for CDN/proxy correctness - not critical for direct Railway deployment.

**IG/FB Headers:** Test with real URLs - some endpoints may still require cookies/auth.

**Token Revocation:** Only enable if you want strict "one-time download" policy.

---

## 🚀 Deployment Strategy

**Phase 1:** Deploy current fixes (b0b783a) - verify Railway + Vercel build success

**Phase 2:** Implement SSE timeout + IG/FB headers (high impact, low risk)

**Phase 3:** Add active readers tracking (Windows safety net)

**Phase 4:** Token revocation + Vary header (nice-to-have polish)

---

## 📊 Monitoring After Deploy

Watch for:
- Railway memory usage (should stabilize with SSE buffer cleanup)
- Disk usage patterns (orphan files should decrease)
- 403 errors on IG/FB URLs (track before/after header changes)
- SSE timeout events in logs (should be rare with activity-based reset)

---

_Created: 2025-10-07_  
_Related Commits: d75e545 (P0/P1 fixes), b0b783a (deployment fixes)_
