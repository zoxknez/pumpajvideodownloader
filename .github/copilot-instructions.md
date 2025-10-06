# Pumpaj Video Downloader - AI Coding Instructions

## Architecture Overview

This is a **multi-platform media downloader** with three deployment targets:
- **Web app**: Next.js 15 frontend (`web/`) + Express backend (`server/`) - deployed separately (Vercel + Railway)
- **Desktop app**: Electron wrapper (`deskkgui/NovPocetak/`) with embedded server - Windows .exe build
- **Core tech**: yt-dlp + ffmpeg for media processing, Server-Sent Events (SSE) for real-time progress

### Critical Design Decisions

**Monorepo structure with workspace isolation:**
- Root `package.json` defines web workspace only - `npm run dev` = Next.js dev
- Backend is standalone: `cd server && npm run dev` (tsx watch)
- Desktop is self-contained: `cd deskkgui/NovPocetak && npm run dev:start:all`

**Deployment independence:**
- Web frontend: Vercel (Next.js App Router, SSR disabled via `ssr: false`)
- Backend API: Railway (Nixpacks build, Node 20, includes yt-dlp/ffmpeg)
- Desktop: Electron Builder for Windows (.exe with bundled binaries)

## Key Components & Data Flow

### Backend (server/) - Express + yt-dlp Job System

**Job lifecycle** (in-memory, non-persistent):
```typescript
// server/index.ts lines 140-170
type Job = { id, type, tmpId, tmpDir, userId, child, concurrencyCap, version };
const jobs = Map<string, Job>; // active jobs
const waiting: WaitingItem[] = []; // queue
const running = Set<string>; // jobIds in progress
```

**Concurrency model:**
- Global `MAX_CONCURRENT` (default 2, max 6) - configurable in `/api/settings`
- Per-user limits via policy: FREE=1, PREMIUM=4 concurrent jobs
- Queue scheduler (`schedule()`) respects both limits when starting jobs

**SSE progress streaming:**
- Route: `GET /api/progress/:id` - Server-Sent Events endpoint
- Ring buffer: `sseBuffers` stores last 20 events per job for late subscribers
- `pushSse(id, payload)` broadcasts to all connected clients + buffers event
- Client reconnects replay missed events via buffer

**Policy enforcement** (FREE vs PREMIUM tiers):
```typescript
// server/types/policy.ts
POLICIES = {
  FREE: { maxHeight: 720, playlistMax: 10, concurrentJobs: 1, ... },
  PREMIUM: { maxHeight: 4320, playlistMax: 300, concurrentJobs: 4, ... }
}
```
Applied at queue time - policy checked when job starts, not when enqueued

### Frontend (web/) - Next.js App Router

**Runtime API detection** (critical for flexible deployment):
```typescript
// web/lib/api.ts lines 9-41
const API_BASE = (() => {
  // 1. NEXT_PUBLIC_API_BASE env
  // 2. localStorage override (manual testing)
  // 3. ?apiBase= query param
  // 4. window.__API_BASE global
  // 5. file:// → localhost:5176 (desktop mode)
  // 6. empty string (same-origin proxy)
})();
```
Next.js `rewrites` in `next.config.js` proxy `/api`, `/auth`, `/health` to backend

**Authentication flow:**
- **Primary**: Supabase Auth (magic link/OAuth) - `@supabase/ssr` with cookie-based sessions
- Backend validates Supabase JWT via `SUPABASE_JWT_SECRET` env var
- `requireAuth` middleware checks Bearer token → query param (for SSE) → cookie
- Custom JWT (JWKS) exists as legacy fallback - **prefer Supabase for new features**

**Component patterns:**
- `LoginGate` wrapper: enforces auth, shows login UI if unauthenticated
- `ClientOnly` wrapper: prevents SSR hydration issues for dynamic components
- Dynamic imports: `dynamic(() => import('...'), { ssr: false })` for client-only views

**Settings architecture** (client-side only):
```typescript
// web/components/SettingsContext.tsx
// Single source of truth: AppSettings type + DEFAULT_SETTINGS
// localStorage: 'pumpaj:settings:v1' for persistence
// Export/Import JSON for portability between machines
```
- **Provider chain**: `ErrorBoundary → SettingsProvider → AuthProvider → ToastProvider`
- **No server sync**: Settings are intentionally local (web ≠ desktop)
- **Sectioned UI**: `SettingsView.tsx` - General, Downloads, Network, Privacy, Advanced
- **Removed**: `SettingsTab.tsx`, `SettingsProvider.tsx`, `desktop-providers.tsx` (consolidated)

### Desktop Integration (deskkgui/NovPocetak/)

**Status**: Desktop app je u planu ali **trenutno nije prioritet** - fokus je na web verziji.

**Electron IPC bridge** (za buduću upotrebu):
- `electron/preload.cjs` exposes `window.api` for file system, clipboard, system integration
- Components detect desktop mode: `const isIpc = Boolean(window.api?.analyze)`
- Embedded server spawned as child process, communicates via HTTP (localhost)

## Development Workflows

### Starting Development

**Web + Backend (typical development):**
```powershell
# From root - starts Next.js frontend only
npm run dev  # localhost:3000

# Backend in separate terminal
cd server
npm run dev  # tsx watch, default port 5176

# Or use task runner (if configured)
# Frontend: task "frontend: start"
# Backend: task "backend: start"
```

**Desktop (Electron):** *(trenutno nije prioritet, fokus na web)*
```powershell
cd deskkgui/NovPocetak
npm run dev:start:all  # Vite (5183) + server (5176)
npm run dev:start:electron  # Opens Electron window
```

### Port Configuration

**Dynamic backend port resolution** (non-obvious pattern):
```typescript
// server/core/config.ts lines 24-32
// PORT env → server/data/settings.json lastPort → fallback 5176
// Vite reads settings.json to configure proxy dynamically
```
**Why:** Allows backend to choose available port, frontend adapts automatically

### Critical Commands

**Build for production:**
```powershell
# Web frontend
cd web && npm run build  # .next/ output for Vercel

# Backend
cd server && npm run build  # TypeScript → dist/

# Desktop
cd deskkgui/NovPocetak
npm run build  # Vite build
npm run dist:win  # Electron Builder → release/*.exe
```

**Testing:**
```powershell
# Backend tests
cd server && npm test  # vitest run

# API smoke test
.\scripts\release-smoke.ps1 -BaseUrl "https://api.domain.com" -Token "jwt..."

# Load test
k6 run scripts/k6-metrics-smoke.js -e BASE_URL=... -e TOKEN=...
```

## Critical Patterns & Conventions

### Authentication Middleware

**Dual JWT support** (Supabase + custom):
```typescript
// server/middleware/auth.ts lines 36-65
// 1. Try Supabase JWT with SUPABASE_JWT_SECRET
// 2. Fallback to app JWT via JWKS
// 3. Populate req.user with { id, email, username, plan }
```

**EventSource auth workaround:**
```typescript
// SSE can't set custom headers → allow ?token= query param
// server/middleware/auth.ts lines 31-34
if (!token) {
  const q = req.query.token;
  if (q && typeof q === 'string') token = q;
}
```

### Job Management

**Download endpoint pattern:**
```typescript
// ALL download routes: /api/download/best, /api/download/audio, /api/download/chapter
// 1. Create Job → enqueue → immediately stream response
// 2. Run yt-dlp as child process, output to tmpDir
// 3. Push SSE progress events as download proceeds
// 4. On completion: stream file + cleanup OR keep in history
```

**Batch processing:**
```typescript
// server/index.ts lines 183-192
type Batch = { id, userId, mode, items: BatchItem[] };
// Items queued independently, batch tracks overall progress
// Frontend polls /api/batch/:id for summary
```

### Error Handling

**yt-dlp error normalization:**
```typescript
// server/core/errors.ts - normalizeYtError()
// Parses yt-dlp stderr for specific errors (geo-block, private video, etc.)
// Returns structured { type, message, recoverable } for client display
```

**HTTP error pattern:**
```typescript
// server/core/httpError.ts - HttpError class
throw new HttpError(400, 'Invalid URL', { cause: 'url_parse_failed' });
// Middleware catches, responds with { error, details, status }
```

### File Handling

**Temporary file lifecycle:**
```typescript
// 1. Job created → tmpId = randomUUID(), tmpDir = os.tmpdir()
// 2. yt-dlp outputs to tmpDir/${tmpId}.ext
// 3. On success: stream file → delete OR move to storage
// 4. On failure: cleanup via cleanupJobFiles()
// 5. Disk guard: MIN_FREE_DISK_BYTES check before job start
```

**Content-Disposition header:**
```typescript
// express-disposition package for RFC-compliant filename encoding
// Handles Unicode filenames (Cyrillic, emoji) safely
```

### Security Considerations

**SSRF protection:**
```typescript
// server/core/ssrfGuard.ts - assertPublicHttpHost()
// Rejects private IPs, localhost, link-local addresses
// Applied to user-provided URLs before yt-dlp execution
```

**URL allowlist:**
```typescript
// server/core/urlAllow.ts - isUrlAllowed()
// ALLOWED_HOSTS env: comma-separated list (youtube.com, x.com, ...)
// If set, only whitelisted domains allowed
```

**Rate limiting:**
```typescript
// Token bucket: progressive rate limits per endpoint
// /api/analyze: 120/min burst 180
// /api/job/*: 180/min burst 240
// /api/progress: 240/min burst 360 (higher for SSE reconnects)
```

## File Structure Conventions

### Core Directories

- `server/core/` - Shared utilities (config, policy, validation, SSRF guards)
- `server/routes/` - Express route handlers (auth, metrics, proxy-download)
- `server/middleware/` - Request pipeline (auth, rate-limit, error handlers)
- `server/storage/` - File-based persistence (users, history, settings JSON files)
- `web/components/` - React UI components (AuthProvider, SettingsContext, DownloadView, etc.)
- `web/lib/` - Client utilities (API client, Supabase client, i18n)
- `web/app/` - Next.js App Router pages (page.tsx, layout.tsx)

**Important**: `web/components/SettingsContext.tsx` je **single source of truth** za client settings - ne dupliraj type definicije.

### Configuration Files

- `server/data/settings.json` - Runtime server settings (maxConcurrent, lastPort, proxyUrl)
- `server/data/history.json` - Job history (in-memory + file persistence)
- `server/data/users.json` - User accounts (file-based, **planiran prelazak na pravu bazu**)
- `.env.local` (web) - Frontend env vars (NEXT_PUBLIC_SUPABASE_*, NEXT_PUBLIC_API_BASE)
- `.env` (server) - Backend env vars (PORT, CORS_ORIGIN, ALLOWED_HOSTS, **SUPABASE_JWT_SECRET**)
- `vercel.json` - Vercel deployment config (framework, buildCommand, outputDirectory)
- `railway.json` - Railway deployment config (Nixpacks, startCommand)
- `nixpacks.toml` - Nixpacks builder setup (Node 20, Python, ffmpeg)

**Storage strategija**: Trenutno file-based JSON za brzinu razvoja. Prelazak na skalabilnije rešenje (PostgreSQL/Supabase DB) je planiran.

### Binary Dependencies

- `deskkgui/NovPocetak/binaries/` - Bundled yt-dlp.exe, ffmpeg.exe for Windows desktop builds
- Server assumes system binaries available (Railway/Vercel provide via buildpacks)

## Integration Points

### Supabase Auth (Primary Strategy)

```typescript
// web/lib/supabaseClient.ts
// Client-side: createClient() with persistSession + autoRefreshToken
// getSession() provides JWT for backend Authorization header

// server/middleware/auth.ts
// Backend validates Supabase JWT first (SUPABASE_JWT_SECRET required)
// Falls back to custom JWT only if Supabase validation fails
```

**Important**: Novi features koriste **isključivo Supabase Auth**. Custom JWT je legacy.

### Metrics & Observability

```typescript
// server/core/metrics.ts - Prometheus metrics registry
// Exposed via /api/metrics/prometheus (requires auth)
// Tracks: request counts, durations, job queue depth, SSE connections
```

### Deployment Triggers

- **Vercel**: Push to `main` → auto-deploy frontend (Next.js)
- **Railway**: Push to `main` → Nixpacks build → deploy backend (Express)
- **Desktop**: Trenutno nije u aktivnom development-u

**Napomena**: Deployment proces je u fazi testiranja - dokumentacija će biti ažurirana kada sistem stabilno radi.

## Common Pitfalls

1. **Port mismatch**: Backend must run on port matching `NEXT_PUBLIC_API_BASE` or Next.js rewrite config
2. **SSE reconnection**: Always implement reconnect logic with Last-Event-ID header for buffer replay
3. **Electron IPC**: Don't mix HTTP API calls with IPC - detect mode at component mount, not render
4. **Policy expiry**: User plan downgrade (PREMIUM → FREE) happens at job queue time, not runtime
5. **File cleanup**: Always use `finalizeJob()` to ensure temp files cleaned, listeners closed
6. **CORS credentials**: Supabase auth requires `credentials: true` in CORS + fetch options
7. **Settings drift**: NEVER duplicate `AppSettings` type - uvek koristi `SettingsContext.tsx` kao source of truth
8. **Provider order**: Poredak je bitan - `SettingsProvider` mora biti iznad `AuthProvider` u `app/providers.tsx`

## Project-Specific Commands

```powershell
# Stop all dev servers (PowerShell)
.\tools\stop.ps1  # Kills node/tsx processes from this repo

# Clean build artifacts
npm run dev:clean  # Removes dist/, server/logs/

# Type checking
npm run typecheck  # web + server

# Database setup (Supabase)
psql $DATABASE_URL < supabase/setup-database.sql
```

## Testing Utilities

- `scripts/pumpaj-postman-collection.json` - Full API collection (15+ endpoints)
- `scripts/release-smoke.ps1` - PowerShell smoke test for production deployments
- `scripts/k6-metrics-smoke.js` - Load test (k6) for performance validation
- `server/test-api.ps1` - Quick backend API test script

**Napomena**: Test data se redovno briše tokom development-a. Ne oslanjaj se na perzistentnost test podataka.

## When Making Changes

**Adding a new download endpoint:**
1. Define route in `server/index.ts` with `requireAuth` middleware
2. Create Job → enqueue with `waiting.push()` → call `schedule()`
3. Implement yt-dlp command with policy enforcement (`ytDlpArgsFromPolicy()`)
4. Stream progress via `pushSse()` → finalize with `finalizeJob()`

**Adding a new frontend feature:**
1. Check if desktop/web divergence needed (detect via `window.api`)
2. Use `LoginGate` wrapper if auth required
3. Import dynamically with `{ ssr: false }` if client-only
4. Call backend via `postJSON()`/`getJSON()` from `lib/api.ts`
5. If adding client settings: extend `AppSettings` type in `SettingsContext.tsx` + update `DEFAULT_SETTINGS`

**Adding a new setting:**
1. Update `AppSettings` type in `web/components/SettingsContext.tsx`
2. Add default value to `DEFAULT_SETTINGS` constant
3. Add UI field in `web/components/SettingsView.tsx` under appropriate section
4. LocalStorage auto-persists on change - no extra code needed

**Updating policies:**
1. Edit `server/types/policy.ts` POLICIES constant
2. Test both FREE and PREMIUM flows (use `POST /auth/activate` to upgrade)
3. Verify rate limits via smoke test script

## Active Development Priorities

1. **Web app** (Next.js + Express) je **glavni fokus**
2. **Supabase Auth** je primarna strategija - koristi ga za sve nove features
3. **Desktop app** čeka svoj red - za sada nije prioritet
4. **Storage migracija** na PostgreSQL/Supabase DB je planirana kada se stabilizuje core funkcionalnost

## Known Limitations

- Test data se redovno briše - ne računaj na perzistentnost tokom razvoja
- Deployment proces je u testiranju - dokumentacija će se ažurirati po stabilizaciji
- File-based storage je privremeno rešenje za brz razvoj
