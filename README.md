<div align="center">

# Pumpaj Media Downloader

Dual‑mode, premium‑grade media downloader. Web app (Vite + React) and Desktop app (Electron) powered by yt‑dlp + ffmpeg, with real‑time progress, smart queueing, and a clean, modern UI.

</div>

## Features at a glance

- Analyze any supported URL via yt‑dlp and present clean Video / Audio / Thumbnails options
- Server‑side job queue with live progress (SSE), cancel single job or Cancel All
- Concurrency limits, temp‑file hygiene, and automatic cleanup
- Desktop mode (Electron): embedded server, IPC controls (Open Downloads, Pause/Resume new jobs)
- Policy system for feature limits (FREE vs PREMIUM)
- Beautiful UI with quick actions, keyboard shortcuts, and status badges

## Architecture

- Frontend: Vite + React + TypeScript (port 5183, strict)
- Backend: Express + yt‑dlp + ffmpeg (default port 5176)
- Desktop: Electron wrapper with IPC, embedded Express server
- Realtime: Server‑Sent Events (SSE) for progress updates
- Storage: JSON files in `server/data/` (settings, users, history) with migration from legacy paths

Repository layout highlights:

- `src/` – React app components and client libs
- `server/` – Express server, routes, and core utilities
- `electron/` – Desktop entry, preload, and packaging
- `tools/` – Dev scripts (stop, clean, smoke, clean‑data)

## Requirements

- Node.js >= 18.18 (LTS or newer)
- Windows is the primary target for the desktop build; the web app runs cross‑platform

## Quick start (development)

Install dependencies (root manages the workspace and the server package):

```powershell
npm install
```

Start both frontend and backend (recommended):

```powershell
npm run dev:start:all
```

Start individually:

```powershell
# Frontend (Vite on http://localhost:5183)
npm run dev:start:frontend

# Backend (Express on http://localhost:5176)
npm run dev:start:backend
```

Stop stuck dev ports and clean temp artifacts:

```powershell
npm run dev:stop
npm run dev:clean
```

Start with a clean data slate (removes dist/, logs/, and server data):

```powershell
npm run dev:clean:data
```

Smoke test (server health):

```powershell
npm run dev:smoke
```

## Desktop (Electron) development

For a desktop experience with IPC controls:

```powershell
# Build UI once in watch mode and run Electron
npm run dev:ipc
```

Production build (Windows portable + zip):

```powershell
npm run dist:win
```

This bundles the web UI, the prebuilt server, and binaries into a portable app.

## Web build (static)

```powershell
npm run build
npm run preview
```

`vite build` outputs to `dist/`. `vite preview` serves the static build locally.

## Configuration

Frontend
- `.env.local`: `VITE_API_BASE` to point the UI at a different backend
   - Example: `VITE_API_BASE=http://localhost:5176`
   - At runtime the app also auto‑detects the backend: query param `?apiBase=`, `window.__API_BASE`, and file:// heuristic for desktop

Backend (environment)
- CORS via `CORS_ORIGIN`:
   - Allow all (dev default): `CORS_ORIGIN=*`
   - Disable CORS: `CORS_ORIGIN=disabled`
   - Comma allow‑list: `CORS_ORIGIN=http://localhost:5183,https://your.site`

Data directory (canonical)
- `server/data/` holds runtime JSON files:
   - `settings.json` – server settings (port, limits, etc.)
   - `history.json` – completed/transient jobs history
   - `users.json` – user plans and identities
- On first run, the server migrates old files from legacy paths (e.g., `server/server/data/`).
- Git ignores these files; use `npm run dev:clean:data` to reset.

## Keyboard shortcuts

- Ctrl+1..5 – Switch tabs (Download / Queue / Batch / History / Settings)
- Enter – Analyze (on Download tab)
- Ctrl+L – Focus URL input

## Job API (server)

- Start best video+audio: `POST /api/job/start/best { url, title } → { id }`
- Start best audio: `POST /api/job/start/audio { url, title, format } → { id }`
- Progress SSE: `GET /api/progress/:id` (events: `message`, `end`)
- Cancel job: `POST /api/job/cancel/:id`
- Cancel all: `POST /api/jobs/cancel-all`
- Download artifact: `GET /api/job/file/:id` (supports `HEAD`; auto‑cleans on stream close)
- Metrics: `GET /api/jobs/metrics` → `{ running, queued, maxConcurrent }`
- Settings:
   - `GET /api/jobs/settings` → `{ maxConcurrent, proxyUrl?, limitRateKbps? }`
   - `POST /api/jobs/settings { ... }` – persists and updates the scheduler live

## Troubleshooting

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

## Security & policies

- Security middleware: helmet, rate limiting, HPP, SSRF guard, CORS
- Policy system gates max quality, concurrency, playlist limits, and features per plan (FREE vs PREMIUM)

## Contributing

PRs and issues are welcome. Keep changes focused, and include a short description, screenshots for UI changes, and steps to test.

## Acknowledgements

- yt‑dlp – amazing open‑source downloader
- ffmpeg / ffprobe – media swiss‑army knives
- Vite + React – the modern web dev stack

