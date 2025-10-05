# 🚀 Pumpaj – Quick Start

Web-first video downloader sa analizom URL-a, 302 redirect i proxy download.

## Brzo pokretanje

### Backend

```powershell
cd server
npm install
npm run dev
```

✅ Server: **http://localhost:5176**

### Frontend

```powershell
cd web
npm install
npm run dev
```

✅ Web UI: **http://localhost:3000**

---

## Test

```powershell
cd server
.\test-simple.ps1
```

Očekivani output:
```
[1] Health check...
  OK - Health: True

[2] CORS check...
  OK - CORS: http://localhost:3000

Backend ready at http://localhost:5176
```

---

## Korišćenje

1. **Paste URL** u input polje
2. **Klikni "Analyze"**
3. **Izaberi format** iz liste
4. **Open (302)** – browser native download  
   **Proxy** – stream proxy sa bezbednim nazivom

---

## Config

### `server/.env`
```bash
PORT=5176
WEB_ORIGIN=http://localhost:3000
PROXY_ALLOW_HOSTS=youtube.com,youtu.be,googlevideo.com
YTDLP_BINARY=yt-dlp
```

### `web/.env.local`
```bash
NEXT_PUBLIC_API_BASE=http://localhost:5176
```

---

## API Endpoints

| Method | Endpoint | Opis |
|--------|----------|------|
| GET | `/api/health` | Health check |
| GET/POST | `/api/analyze?url=...` | yt-dlp metadata |
| GET | `/api/redirect?url=...&kind=...` | 302 redirect download |
| GET | `/api/proxy-download?src=...` | Stream proxy |

---

**Više detalja:** [`IMPLEMENTATION-SUMMARY.md`](./IMPLEMENTATION-SUMMARY.md)

**Made with 💛 by a0o0o0o**
