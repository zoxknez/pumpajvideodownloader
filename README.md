# Pumpaj Video Downloader

All-in-one media downloader that combines a Next.js web client, an Express backend, and an Electron desktop shell to deliver premium-grade downloads without waiting.

![Pumpaj interface](./pumpaj.jpg)

## ✨ Highlights

- **100+ supported platforms** powered by `yt-dlp` and `ffmpeg` under the hood.
- **Realtime progress** via Server-Sent Events (SSE) for accurate ETA, speed, and log streaming.
- **Premium features for everyone**: batch queues, playlist extraction, metadata handling, and subtitle support.
- **Local-first storage** ensures privacy—downloaded files never leave your machine unless you choose to.
- **Supabase-authenticated** workflow with optional guest-access tokens for frictionless trials.

## 🏗️ Architecture Overview

| Layer | Location | Tech | Notes |
| --- | --- | --- | --- |
| Web client | `web/` | Next.js 15 (App Router), Tailwind CSS, Supabase Auth | Deployed on Vercel. Uses runtime API base auto-detection to work in web and desktop modes. |
| API server | `server/` | Express + TypeScript | Deployed on Railway (Node 20). Orchestrates downloads, policies, job queue, and SSE progress streams. |
| Desktop wrapper | `deskkgui/NovPocetak/` | Electron + Vite | Wraps the web UI and starts an embedded backend with bundled `yt-dlp`/`ffmpeg` binaries. |
| Core tooling | `yt-dlp`, `ffmpeg` | System / bundled binaries | Required for video/audio extraction and post-processing. |

Key runtime decisions:

- **Job Scheduler**: Enforces global and per-plan concurrency caps (FREE vs PREMIUM) using an in-memory queue (`server/index.ts`).
- **Policy Enforcement**: `server/types/policy.ts` defines height/bitrate/playlist limits and is checked before each job starts.
- **Settings**: The web UI persists client settings locally through `SettingsContext.tsx`—no server sync.
- **Security**: SSRF guard, URL allow-list, token bucket rate limiting, and Supabase JWT validation keep endpoints safe.

## 🚀 Quick Start

### Prerequisites

- Node.js 20+
- `yt-dlp` and `ffmpeg` available on your `PATH` (backend requires them). On Windows you can install via [Chocolatey](https://community.chocolatey.org/packages/yt-dlp) and [ffmpeg](https://community.chocolatey.org/packages/ffmpeg).
- Optional: Supabase project for production auth (see `supabase/` for setup scripts).

### 1. Install Dependencies

```powershell
npm install
cd web
npm install
cd ..\server
npm install
```

### 2. Environment Variables

Create `.env.local` in `web/` with:

```
NEXT_PUBLIC_SUPABASE_URL=<your-supabase-url>
NEXT_PUBLIC_SUPABASE_ANON_KEY=<your-supabase-anon-key>
NEXT_PUBLIC_API_BASE=http://localhost:5176
```

Create `.env` in `server/` with:

```
PORT=5176
CORS_ORIGIN=http://localhost:3000
SUPABASE_JWT_SECRET=<supabase-jwt-secret>
ALLOWED_HOSTS=youtube.com,instagram.com,tiktok.com
```

> Tip: Run `supabase/auto-setup.sql` against your project to provision required schemas and policies.

### 3. Start Development Servers

Open two terminals:

```powershell
# Terminal 1 - Next.js frontend (root folder)
npm run dev

# Terminal 2 - Express backend
cd server
npm run dev
```

Frontend runs on `http://localhost:3000`, backend on `http://localhost:5176`.

### 4. Electron Desktop (Optional)

```powershell
cd deskkgui/NovPocetak
npm install
npm run dev:start:all
```

This launches both the local server and the Electron shell pointed at the bundled UI.

## ✅ Test & Quality

- `npm run typecheck` (root) runs TypeScript checks for both web and server workspaces.
- `cd server && npm test` to execute backend unit tests (Vitest).
- `scripts/release-smoke.ps1` contains a PowerShell smoke test hitting production endpoints.

## 🗃️ Project Structure

```
.
├── web/                 # Next.js app (App Router)
├── server/              # Express API (TypeScript)
├── deskkgui/NovPocetak/ # Electron desktop client
├── scripts/             # Tooling (k6 load test, Postman collection, helpers)
├── supabase/            # Supabase setup scripts & docs
├── public/              # Shared static assets
└── pumpaj.jpg           # Screenshot used above
```

## 📦 Deployment Notes

- **Frontend**: Deploy `web/` to Vercel. Build with `npm run build` inside the `web` folder.
- **Backend**: Deploy `server/` to Railway (Node 20, Nixpacks). Build with `npm run build` and start `node dist/index.js`.
- **Desktop**: Package via `npm run dist:win` inside `deskkgui/NovPocetak` to produce the Windows installer.

Ensure `yt-dlp` and `ffmpeg` binaries are available in production environments or bundled for desktop builds.

## 🤝 Contributing

1. Fork the repository and create a feature branch.
2. Run `npm run typecheck` and relevant tests.
3. Follow the existing TypeScript/Tailwind style conventions.
4. Submit a pull request—Supabase credentials and binary assets should never be committed.

## 📄 License

This project is released under the MIT License. See [LICENSE](./LICENSE) for details.
