<div align="center">

   <img src="public/pumpaj-logo.svg" alt="Pumpaj logo" width="96" height="96" />

   <h1>Pumpaj Media Downloader</h1>

   [![Donate](https://img.shields.io/badge/Donate-PayPal-FFB000?logo=paypal&labelColor=002E7A&logoColor=white)](https://www.paypal.com/paypalme/o0o0o0o0o0o0o)

   <p>
      Dual‑mode, premium‑grade media downloader. Web app (Vite + React) and Desktop app (Electron)
      powered by yt‑dlp + ffmpeg, with real‑time progress, smart queueing, and a clean, modern UI.
   </p>

   <p>
         <a href="https://github.com/o0o0o0o0o0o0o0o0o0o0o0o0o0o0o0o/pumpaj_video_downloader/actions/workflows/ci.yml"><img alt="CI" src="https://github.com/o0o0o0o0o0o0o0o0o0o0o0o0o0o0o0o/pumpaj_video_downloader/actions/workflows/ci.yml/badge.svg" /></a>
   <a href="https://img.shields.io/badge/Node-%3E%3D18.18-339933?logo=node.js&logoColor=white"><img alt="Node" src="https://img.shields.io/badge/Node-%3E%3D18.18-339933?logo=node.js&logoColor=white" /></a>
   <a href="https://vitejs.dev"><img alt="Vite" src="https://img.shields.io/badge/Vite-7.x-646CFF?logo=vite&logoColor=white" /></a>
   <a href="https://nextjs.org"><img alt="Next" src="https://img.shields.io/badge/Next.js-15-000000?logo=next.js&logoColor=white" /></a>
   <a href="https://react.dev"><img alt="React" src="https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=white" /></a>
   <a href="https://expressjs.com"><img alt="Express" src="https://img.shields.io/badge/Express-5.x-000000?logo=express&logoColor=white" /></a>
   <a href="https://www.electronjs.org"><img alt="Electron" src="https://img.shields.io/badge/Electron-38-47848F?logo=electron&logoColor=white" /></a>
      <img alt="yt-dlp" src="https://img.shields.io/badge/yt--dlp-latest-FF0000?logo=youtube&logoColor=white" />
      <img alt="FFmpeg" src="https://img.shields.io/badge/FFmpeg-static-007808?logo=ffmpeg&logoColor=white" />
      <img alt="Windows" src="https://img.shields.io/badge/Windows-10/11-0078D6?logo=windows&logoColor=white" />
   </p>

   <p>
      <a href="#features-at-a-glance">English</a> • <a href="#-srpski-serbian">Srpski</a>
   </p>

</div>

## ✨ Features at a glance

- Analyze any supported URL via yt‑dlp and present clean Video / Audio / Thumbnails options
- Server‑side job queue with live progress (SSE), cancel single job or Cancel All
- Concurrency limits, temp‑file hygiene, and automatic cleanup
- Desktop mode (Electron): embedded server, IPC controls (Open Downloads, Pause/Resume new jobs)
- Policy system for feature limits (FREE vs PREMIUM)
- Beautiful UI with quick actions, keyboard shortcuts, and status badges

## 🧱 Architecture

- Frontend: Vite + React + TypeScript (port 5183, strict)
- Backend: Express + yt‑dlp + ffmpeg (default port 5176)
- Desktop: Electron wrapper with IPC, embedded Express server
- Realtime: Server‑Sent Events (SSE) for progress updates
- Storage: JSON files in `server/data/` (settings, users, history) with migration from legacy paths

Repository layout highlights:

- `server/` – Express server, routes, and core utilities
- `electron/` – Desktop entry, preload, and packaging
- `tools/` – Dev scripts (stop, clean, smoke, clean‑data)


- Node.js >= 20 (LTS). Repo sadrži `.nvmrc`, pa je dovoljno pokrenuti `nvm use` da preuzme tačnu verziju.
- Windows is the primary target for the desktop build; the web app runs cross‑platform

## 🚀 Quick start (development)
Select Node version:
```powershell
nvm use
```

```powershell
npm install
```

Start both frontend and backend (recommended):

```powershell
Start individually:

```powershell
# Frontend (Vite on http://localhost:5183)
npm run dev:start:frontend
# Backend (Express on http://localhost:5176)
npm run dev:start:backend
```


```powershell
npm run dev:stop
npm run dev:clean

Start with a clean data slate (removes dist/, logs/, and server data):

```powershell
npm run dev:clean:data
```

Smoke test (server health):

```powershell
npm run dev:smoke
```
`npm run test -w server` pokreće brze API health testove (Vitest + Supertest) sa `NODE_ENV=test`. 
`npm run verify` zatim pokriva lint, oba typechecka, buildove i sve testove, identično onome što prolazi u CI pipeline-u.

## 🤖 Continuous integration
- Dnevni [Production Smoke Tests](https://github.com/o0o0o0o0o0o0o0o0o0o0o0o0o0o0o0o/pumpaj_video_downloader/actions/workflows/smoke-prod.yml) workflow (06:00 UTC) + ručni trigger proveravaju da su Vercel frontend i Railway backend dostupni (`tools/smoke-prod.ps1` validira web landing, `/health` (`ok: true`) i `/api/version` meta podatke)

## 🖥️ Desktop (Electron) development


```powershell
# Build UI once in watch mode and run Electron
npm run dev:ipc

Production build (Windows portable + zip):

```powershell
npm run dist:win
```

This bundles the web UI, the prebuilt server, and binaries into a portable app.

## 🌐 Web build (static)

```powershell
npm run build:all
npm run preview
```


## ⚙️ Configuration

Frontend
- Start from the template and adjust as needed:

   ```powershell
   copy web/.env.example web/.env.local
   ```

- `.env.local`
    - `NEXT_PUBLIC_API=http://localhost:5176` (frontend → backend bridge for the Next.js web app)
    - `NEXT_PUBLIC_SUPABASE_URL=https://<project>.supabase.co`
    - `NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon-key>`
    - (Legacy Vite UI) `VITE_API_BASE=http://localhost:5176`
    - At runtime the app auto‑detects the backend too: query param `?apiBase=`, `window.__API_BASE`, and file:// heuristic for desktop

Backend (environment)
- Copy the sample and fill in the values you need:

   ```powershell
   copy server/.env.example server/.env
   ```

- Key flags:
    - `PORT=5176` (ili željeni port)
    - `CORS_ORIGIN=*` (dozvole; može i lista domena)
    - `ALLOWED_HOSTS=...` (SSRF zaštita)
    - `APP_JWT_SECRET`, `APP_JWT_PUBLIC_KEY`, `APP_JWT_PRIVATE_KEY` (Supabase / JWT most)
    - `MAX_FILESIZE_MB`, `MAX_DURATION_SEC`, `PROXY_DOWNLOAD_MAX_PER_MIN` (soft limiti)

Data directory (canonical)
- `server/data/` holds runtime JSON files:
   - `settings.json` – server settings (port, limits, etc.)
   - `history.json` – completed/transient jobs history
   - `users.json` – user plans and identities
- On first run, the server migrates old files from legacy paths (e.g., `server/server/data/`).
- Git ignores these files; use `npm run dev:clean:data` to reset.

## 🌍 Production deployment

For the latest production checklist with domains and credentials, see [`docs/production-setup.md`](docs/production-setup.md). Quick recap:

1. **Railway (Express API)**
   - Variables: `PORT=8080`, `NIXPACKS_NODE_VERSION=20`, `CORS_ORIGIN=https://pumpajvideodown.vercel.app`
   - Optional safety: `ALLOWED_HOSTS=youtube.com,youtu.be`
2. **Vercel (Next.js web)**
   - Production env vars: `NEXT_PUBLIC_API`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - Project protection: keep Vercel Authentication disabled for public access, or issue a share link.
3. **Deploy**
   ```powershell
   # Backend
   railway up

   # Frontend
   vercel deploy --prod --yes
   vercel alias set <deployment-url> pumpajvideodown.vercel.app
   ```
4. **Smoke test**
   ```powershell
   npm run smoke:prod
   ```
   Confirms `https://pumpajvideodown.vercel.app` returns 200 and the Railway `/health` endpoint is OK.

> ℹ️  The repository root contains `vercel.json` which routes all requests into the `web/` Next.js app. Keep that file in sync if you move directories.

## ⌨️ Keyboard shortcuts

- Ctrl+1..5 – Switch tabs (Download / Queue / Batch / History / Settings)
- Enter – Analyze (on Download tab)
- Ctrl+L – Focus URL input

## 🔌 Job API (server)
- Start best video+audio: `POST /api/job/start/best { url, title } → { id }`
- Start best audio: `POST /api/job/start/audio { url, title, format } → { id }`
- Progress SSE: `GET /api/progress/:id` (events: `message`, `end`)
- Cancel job: `POST /api/job/cancel/:id`
- Cancel all: `POST /api/jobs/cancel-all`
- Download artifact: `GET /api/job/file/:id` (supports `HEAD`; auto‑cleans on stream close)
- Metrics: `GET /api/jobs/metrics` → `{ running, queued, maxConcurrent }`
- Prometheus scrape: `GET /metrics.prom` exposes job gauges and proxy histograms (`pumpaj_proxy_duration_seconds`, `pumpaj_proxy_bytes`, error counters)
- Settings:
   - `GET /api/jobs/settings` → `{ maxConcurrent, proxyUrl?, limitRateKbps? }`
   - `POST /api/jobs/settings { ... }` – persists and updates the scheduler live

### Signed download/progress links

- Issue short-lived signatures with `POST /api/job/file/:id/sign` (default TTL 30 min) and `POST /api/progress/:id/sign` (default TTL 10 min); both clamp to ≤1h.
- Signed responses include `s=<token>`; treat them like bearer secrets—avoid persisting them to logs, analytics, or crash reports.
- Downloads/SSE fall back to authenticated access automatically (`Authorization` header), and responses now vary on `Authorization` to keep caches honest.

## 📡 Proxy streaming & SSE contracts

### Proxy download `/proxy`

- **Status codes**
  - `502` + `error="upstream_size_limit"` – stream exceeded the local byte cap (`Retry-After` omitted)
  - `429` + `error="upstream_ratelimit"` – upstream responded with `429`; `Retry-After` mirrors upstream or defaults to 30s
  - `416` – invalid `Range` request upstream refused to satisfy
  - `413` – upfront guard when declared `Content-Length` breaches `MAX_FILESIZE_MB`
- **Response headers** (errors and success)
  - `Proxy-Status: pumpaj; error="…"; details="…"` – RFC 9209 reason string for observability
  - `Retry-After: <seconds>` – only when retry is sensible (currently upstream 429)
  - `Cache-Control: no-store` and `Accept-Ranges: bytes` are always enforced locally
  - Only a hardened allowlist is replayed from upstream on success: `content-type`, `content-length`, `content-disposition`, `accept-ranges`, `etag`, `last-modified`, `cache-control`
- **Safety rails**
  - Chunked responses without `Content-Length` are streamed through a guarded transform that aborts once the local byte cap is exceeded
  - Dangerous upstream headers (`set-cookie`, `vary`, etc.) are dropped even when the proxy succeeds
  - Errors flush with `Connection: close` before the JSON body so callers do not await extra chunks

#### Quick probes

```powershell
# Over-limit guard (returns 502 + JSON error body)
curl -i "http://localhost:5176/proxy?url=https://example.com/too-big.bin"

# Range request rejected by upstream (returns 416)
curl -i -H "Range: bytes=99999-" "http://localhost:5176/proxy?url=https://example.com/resource.bin"
```

### Progress SSE `/api/progress/:id`

- `retry: 5000` is emitted so reconnect attempts back off to 5s
- Client can resume from the most recent event id by supplying `Last-Event-ID`
- Events currently emitted:
  - unnamed (`data: { ... }`) – progress payloads
  - `event: end` – job finished or was cancelled
  - `event: ping` – keepalive heartbeat

```powershell
curl -N -H "Accept: text/event-stream" -H "Authorization: Bearer <JWT>" "http://localhost:5176/api/progress/<jobId>"
```

## 🧩 Troubleshooting
- Frontend port 5183 already in use
   - A Vite instance is already running; run:
      ```powershell
      npm run dev:stop
      ```
- Backend unreachable from the UI
   - Verify health:
      ```powershell
      curl http://localhost:5176/health
      ```
      Expect `{ "ok": true }`. If you run on a non‑default port, set `VITE_API_BASE`.
- yt‑dlp / ffmpeg
   - The server uses `youtube-dl-exec` and `ffmpeg-static`. Desktop builds bundle binaries. Ensure network access for yt‑dlp updates if needed.
- Proxy/Rate limits
   - Configure via Settings in the UI or POST to `/api/jobs/settings` (proxy URL, bandwidth caps).

