# Pregled koda – statička analiza (automatski izveštaj)

_Datum:_ 2025-10-06T23:31:20.958720Z (Updated: 2025-10-07)

_Direktorijum:_ `/mnt/data/review_workspace`

**Datoteka ZIP:** `pumpajvideodl_backup_20251007_012856.zip`

**Ukupno fajlova:** 108  
**Ukupno nalaza:** 179  
**Kritičnih (HIGH):** 40

---

## ✅ PROGRESS UPDATE (2025-10-07)

### COMPLETED ✓
1. **Console.log cleanup** - 30+ debug logs removed from production code
   - Frontend: auth callback (13), AuthProvider (4), QueueView (1), lib files (9)
   - Backend: middleware/auth.ts (4)
   - Production-safe logger preserved (server/core/logger.ts)

2. **SSE memory leak fix** - Added 'end' event listeners
   - lib/sse-enhanced.ts ✓
   - components/QueueView.tsx ✓
   - lib/api-desktop.ts (already existed) ✓

3. **Railway environment setup** - Production variables configured
   - ENABLE_FFMPEG=false ✓
   - LOG_LEVEL=info ✓
   - NODE_ENV=production ✓

4. **FFmpeg dependency removal** 🎉 - Complete refactor to FFmpeg-free architecture
   - Removed ffmpeg-static package from dependencies ✓
   - Removed FFmpeg from nixpacks.toml build ✓
   - Removed all ffmpegLocation references (12 locations) ✓
   - Removed all mergeOutputFormat parameters (8 locations) ✓
   - Deprecated subtitle extraction endpoint (requires FFmpeg) ✓
   - TypeScript build verified (no errors) ✓
   - Tests updated (health.test.ts) ✓
   
   **Impact:**
   - Docker image size reduction: ~150MB smaller
   - Faster Railway deployments (no FFmpeg compilation)
   - Simpler dependency chain (Python + Node only)
   - yt-dlp now uses native pre-merged formats

### PENDING ⏳
- Security improvements (?token= → ?s= signed params)
- Filename sanitization validation
- Frontend subtitle feature detection (graceful disable when ENABLE_FFMPEG=false)

---

## 📊 Sažetak po kategorijama

### 🔴 HIGH Priority (40 nalaza)
- **FFmpeg zavisnost** - 30 nalaza u `index.ts`, `nixpacks.toml`, markdown dokumentaciji
- **mergeOutputFormat** - 8 nalaza (zahteva FFmpeg za merge video+audio)
- **extractAudio** - 3 nalaza (konverzija audio formata)
- **downloadSections** - 2 nalaza (sečenje video segmenata)
- **embedSubs** - 1 nalaz (umetanje titlova)

### 🟡 MEDIUM Priority (10 nalaza)
- **EventSource 'end' event** - 3 nalaza (nedostaje listener za kraj SSE konekcije)
- **?token= parametar** - 2 nalaza (trebalo bi koristiti potpisan parametar ?s=)
- **window.open bez potpisa** - 1 nalaz (proxy-download ruta bez auth potpisa)
- **Filename sanitizacija** - 4 nalaza (ručno formiranje Content-Disposition headera)

### 🔵 LOW Priority (44 nalaza)
- **console.log u produkciji** - 38 nalaza (debug logovi koji bi trebalo biti uklonjeni)
- **Authorization header provera** - 6 nalaza (proverite da se ne prebrisuje slučajno)

### ℹ️ INFO (85 nalaza)
- **tmpDir/tmpId pattern** - 70+ nalaza (informativno, deo job sistema)
- **Content-Disposition** - 10 nalaza (provera parsiranja filename-a)
- **Adaptive protokoli** - 5 nalaza (prikazati kao 'adaptive' u UI)

---

## 🎯 Prioritizovani plan akcije

### Faza 1: KRITIČNO - FFmpeg zavisnost (web-only profil) 🔴

**Problem:** Backend trenutno zavisi od FFmpeg-a, što komplikuje deployment i povećava veličinu Docker image-a.

**Lokacije:**
1. `server/index.ts` - linija 45-50 (import ffmpeg-static)
2. `server/index.ts` - svi `mergeOutputFormat` pozivi (8 lokacija)
3. `server/index.ts` - svi `extractAudio: true` pozivi (3 lokacije)
4. `server/index.ts` - `downloadSections` feature (2 lokacije)
5. `server/index.ts` - `embedSubs` feature (1 lokacija)
6. `nixpacks.toml` - linija 3 (FFmpeg u build dependencies)

**Rešenje:**
```typescript
// Umesto:
format: `bv*[height<=?${policy.maxHeight}]+ba/b[height<=?${policy.maxHeight}]`,
mergeOutputFormat: 'mp4',

// Koristiti:
format: `bv*[height<=?${policy.maxHeight}][ext=mp4]+ba[ext=m4a]/b[height<=?${policy.maxHeight}][ext=mp4]`,
// Nema mergeOutputFormat - yt-dlp će koristiti pre-merged format
```

**Alternativa:** Feature flag `ENABLE_FFMPEG=false` za web deployment.

---

### Faza 2: VAŽNO - SSE event handling 🟡

**Problem:** EventSource konekcije ne slušaju 'end' event, što može uzrokovati memory leaks.

**Lokacije:**
1. `web/components/QueueView.tsx` - linija 66
2. `web/lib/sse-enhanced.ts` - linija 55
3. `web/lib/api-desktop.ts` - linija 580

**Rešenje:**
```typescript
const sse = new EventSource(url);
sse.addEventListener('message', handleMessage);
sse.addEventListener('error', handleError);
sse.addEventListener('end', () => {
  console.log('SSE stream ended gracefully');
  sse.close();
});
```

---

### Faza 3: SIGURNOST - Potpisan token za download 🟡

**Problem:** `/api/progress/:id?token=` koristi query param umesto potpisanog parametra.

**Lokacije:**
1. `server/middleware/auth.ts` - linija 34 (fallback za SSE)
2. `web/components/QueueView.tsx` - linija 64 (`?token=` query)

**Rešenje:**
```typescript
// Umesto:
const url = `${apiBase}/api/progress/${jobId}?token=${token}`;

// Koristiti potpisan parametar:
const signedParams = signParams({ jobId, exp: Date.now() + 3600000 });
const url = `${apiBase}/api/progress/${jobId}?s=${signedParams}`;
```

---

### Faza 4: CLEANUP - Ukloni console.log 🔵

**Problem:** 38 console.log poziva u production kodu (najviše u `app/auth/callback/page.tsx`).

**Lokacije:**
1. `app/auth/callback/page.tsx` - 15 nalaza (OAuth debug logs)
2. `components/AuthProvider.tsx` - 6 nalaza (Supabase auth events)
3. `lib/sse-enhanced.ts` - 5 nalaza (SSE connection logs)
4. Ostali fajlovi - 12 nalaza

**Rešenje:**
```typescript
// Zameni sa conditional logger:
if (process.env.NODE_ENV !== 'production') {
  console.log('🔍 OAuth callback started');
}

// Ili koristi logger utility:
logger.debug('OAuth callback started'); // Automatski ignoriše u produkciji
```

---

### Faza 5: VALIDACIJA - Filename sanitizacija ℹ️

**Problem:** 4 lokacije gde se Content-Disposition header formira ručno bez potpune sanitizacije.

**Lokacije:**
1. `server/index.ts` - linije 750, 1014, 1143, 1236, 2182, 2261, 2282
2. `routes/proxyDownload.ts` - linija 122

**Trenutno stanje:**
```typescript
const safe = safeName(title || 'video');
res.setHeader('Content-Disposition', `attachment; filename="${safe}${ext}"`);
```

**Preporuka:** Proveri da `safeName()` funkcija pravilno handluje:
- Unicode karaktere (Cyrillic, emoji)
- Specijalne karaktere (`"`, `;`, newline)
- Duge filename-ove (>255 karaktera)

Već koristiš `express-disposition` paket u `server/package.json`, ali se ne vidi u ovim lokacijama.

---

## 📋 Implementacioni redosled

### Sprint 1 (Kritično - 1-2 dana)
1. ✅ **Isključi FFmpeg zavisnost** (Faza 1)
   - Ukloni `mergeOutputFormat` iz svih download endpoint-a
   - Koristi pre-merged formate za yt-dlp
   - Feature flag `ENABLE_FFMPEG=false` za Railway deployment
   - Ukloni FFmpeg iz `nixpacks.toml`

### Sprint 2 (Važno - pola dana)
2. ✅ **Fiksuj SSE event handling** (Faza 2)
   - Dodaj 'end' event listener u sve EventSource konekcije
   - Dodaj timeout za automatsko zatvaranje nakon 5 min neaktivnosti

3. ✅ **Implementiraj potpisan token** (Faza 3)
   - Koristi postojeći `signParams()` helper iz `core/signed.ts`
   - Zameni `?token=` sa `?s=` u SSE endpointima

### Sprint 3 (Cleanup - 1 sat)
4. ✅ **Ukloni console.log** (Faza 4)
   - Zameni sa `logger.debug()` pozivima
   - Proveri da `NODE_ENV=production` u Railway environment

5. ✅ **Validiraj filename sanitizaciju** (Faza 5)
   - Test sa Cyrillic karakterima
   - Test sa emoji u title-u
   - Test sa veoma dugim filename-ovima

---

## 🧪 Test plan

### FFmpeg removal test
```powershell
# Test da video download radi bez FFmpeg-a
curl -X POST https://pumpaj-backend-production.up.railway.app/api/download/best \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"url":"https://www.youtube.com/watch?v=dQw4w9WgXcQ"}'

# Proveri da ne postoji ffmpeg proces
railway run --service backend "ps aux | grep ffmpeg"
```

### SSE graceful shutdown test
```typescript
// Test da EventSource properly zatvara konekciju
const sse = new EventSource('/api/progress/test-job-id');
setTimeout(() => {
  sse.close();
  console.assert(sse.readyState === EventSource.CLOSED);
}, 5000);
```

### Filename sanitization test
```typescript
const testCases = [
  '🚀 Test Video.mp4',
  'Ćирилица тест.mp4',
  '"dangerous";filename.mp4',
  'a'.repeat(300) + '.mp4'
];

testCases.forEach(name => {
  const safe = safeName(name);
  assert(!/["\r\n;]/.test(safe));
  assert(safe.length <= 255);
});
```

---

## 📦 Deployment strategy

### Railway deployment (production)
1. **Environment variables:**
   ```bash
   ENABLE_FFMPEG=false
   NODE_ENV=production
   LOG_LEVEL=info  # Removes debug console.log
   ```

2. **Build process:**
   - `nixpacks.toml` bez FFmpeg dependency
   - TypeScript build: `npm run build`
   - Start: `node dist/index.js`

3. **Rollback plan:**
   - Ako nešto ne radi, set `ENABLE_FFMPEG=true`
   - Redeploy sa FFmpeg u nixpacks.toml

---

## 🔍 Dodatne napomene

### False positives (ℹ️ INFO kategorija)
- **tmpDir/tmpId pattern** - Ovo je **normalan pattern** za job system, ne zahteva akciju
- **Content-Disposition expose** - Već pravilno expose-ovano u CORS headers
- **Adaptive protokoli** - Već pravilno prikazani u UI

### Ne zahteva akciju
- `CLEANUP-REPORT.md` i dokumentacija fajlovi - 0 nalaza ✅
- TypeScript config fajlovi - 0 nalaza ✅
- Middleware fajlovi - uglavnom čisti, samo par console.log-ova

---

## 🎯 Prioritet za DANAS

**Ako imaš 2 sata:**
1. Isključi FFmpeg dependency (30 min)
2. Fiksuj SSE event handling (15 min)
3. Ukloni console.log iz OAuth callback stranice (15 min)

**Ako imaš 30 minuta:**
1. Samo isključi FFmpeg dependency (najkritičnije)

**Ako imaš 5 minuta:**
1. Dodaj environment variable: `ENABLE_FFMPEG=false` u Railway

---

**Status:** ⏳ Čeka implementaciju  
**Procena vremena:** 4-6 sati ukupno  
**Prioritet:** 🔴 Kritično (FFmpeg removal) + 🟡 Važno (SSE/Security fixes)
