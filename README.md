# Premium Downloader (Vite + Express + yt-dlp)

## Run locally

Backend (Express + yt-dlp)
- Path: `server/`
- Port: `5176` (default). If you run on another port, set `VITE_API_BASE` in `.env.local` accordingly.
- Dev: `npm run dev --prefix server`
- Build/Start: `npm run build --prefix server`; `npm run start --prefix server`
- CORS via `CORS_ORIGIN` env:
   - Allow all (dev default): `CORS_ORIGIN=*`
   - Disable CORS: `CORS_ORIGIN=disabled`
   - Allow list: `CORS_ORIGIN=http://localhost:5183,https://my.site`

Frontend (Vite + React)
- Port: `5183` (strict; change in `vite.config.ts` if needed)
- Dev: `npm run dev`

### Try it
- Stop any stuck dev ports: `npm run dev:stop`
- Start backend: `npm run dev --prefix server` (listens on http://localhost:5176)
- Start frontend: `npm run dev` (opens http://localhost:5183)
- Open the app and paste a YouTube URL, then try Video/Audio/Thumbnails

Troubleshooting
- Frontend error “Port 5183 is already in use”: a Vite instance already runs; run `npm run dev:stop` once, then start again.
- Backend unreachable: verify `GET http://localhost:5176/health` returns `{ "ok": true }`.

One-liner (dev, Windows PowerShell)
- Start backend and frontend: `npm run dev:start:all`
- Stop/clean ports (5176/5183): `npm run dev:stop` / `npm run dev:clean`
- Quick smoke test (server): `npm run dev:smoke`

Configuration
- Frontend: `.env.local` ⇒ `VITE_API_BASE=http://localhost:5176`
- Health check: `GET http://localhost:5176/health`

## Features
- Analyze YouTube URLs (yt-dlp JSON) and show curated Video/Audio/Thumbnails.
- Server-driven downloads with a Job queue:
   - Background jobs with SSE live progress (%/speed/ETA)
   - Cancel single job or Cancel All
   - Concurrency control (1–6) with server-side persistence
   - Temp-file cleanup after download or cancel
- Direct downloads via `/api/proxy-download` (when CORS/direct URLs allow).

## Job API (server)
- Start best video+audio: `POST /api/job/start/best { url, title } → { id }`
- Start best audio: `POST /api/job/start/audio { url, title, format } → { id }`
- Progress SSE: `GET /api/progress/:id` (events: `message`, `end`)
- Cancel job: `POST /api/job/cancel/:id`
- Cancel all: `POST /api/jobs/cancel-all`
- Download file: `GET /api/job/file/:id` (supports `HEAD`; auto-cleans on stream close)
- Metrics: `GET /api/jobs/metrics` → `{ running, queued, maxConcurrent }`
- Settings:
   - `GET /api/jobs/settings` → `{ maxConcurrent }`
   - `POST /api/jobs/settings { maxConcurrent }` (persists; updates scheduler live)
- Maintenance: `POST /api/jobs/cleanup-temp` → `{ ok, removed }`

## UI highlights
- Settings → Advanced: slider for “Jobs Queue” (server-side concurrency) + “Cleanup Temp Files”.
- Header badges show Server health and Queue (running/max, queued).
- History tab: live progress with stage/speed/ETA, Cancel, Cancel All, Retry.

## Notes
- Some formats returned by yt-dlp don’t expose a direct URL (dash/hls manifests). For those, use server jobs.
- Binary requirements are managed by `youtube-dl-exec`; ffmpeg is bundled via `ffmpeg-static`.

## VS Code tasks
- Start both (dev): “dev: start all”
- Start individually: “backend: start”, “frontend: start”
- Stop dev ports: “all: stop (dev ports)”
- Clean artifacts: “dev: clean”
