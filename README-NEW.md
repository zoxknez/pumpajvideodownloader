# Pumpaj – Web-First Media Downloader

**Sve je spremno za "paste & go"** – analiza URL-a, 302 redirect i proxy download, bez čuvanja fajlova. Backend: Express + yt-dlp. Frontend: Next.js + Tailwind.

---

## 🚀 Brzi start

### 1. Backend (Express + yt-dlp)

```powershell
cd server
npm install
cp .env.example .env  # uredi ako treba
npm run dev
```

Server pokreće na **http://localhost:5176**

### 2. Frontend (Next.js)

```powershell
cd web
npm install
npm run dev
```

Web UI pokreće na **http://localhost:3000**

---

## 📦 Struktura

```
server/src/
├── index.ts          # Express app + rute
├── yt.ts             # yt-dlp wrapperi (analyzeUrl, getDirectUrl)
├── proxyDownload.ts  # /api/proxy-download handler
└── utils.ts          # sanitizeFileName, chooseExtFromMimeOrUrl

web/
├── app/page.tsx      # Root stranica (AuthProvider + DesktopApp)
├── components/
│   ├── DownloaderHome.tsx   # URL bar + tabovi + feature kartice
│   ├── DownloaderPanel.tsx  # Format picker + Open/Proxy dugmad
│   └── DesktopApp.tsx       # Koordinator between Home i Panel
└── lib/api.ts        # API_BASE + helper funkcije
```

---

## 🔌 Backend API

Sve rute su **CORS-protected** (whitelist: `WEB_ORIGIN` + localhost varijante).

### `GET /api/health`

```json
{ "ok": true }
```

### `GET /api/analyze?url=...`  
### `POST /api/analyze` (body: `{ url }`)

**Response:**

```json
{
  "ok": true,
  "info": { /* yt-dlp -J json */ },
  "summary": {
    "id": "...",
    "title": "...",
    "duration": 123,
    "hasFormats": true
  }
}
```

### `GET /api/get-url?url=...&kind=best|audio&format_id=...&title=...`

Vraća direktan URL (yt-dlp `-g`):

```json
{
  "ok": true,
  "finalUrl": "https://...",
  "filename": "Safe Title.mp4"
}
```

### `GET /api/redirect?url=...&kind=best|audio&format_id=...&title=...`

302 redirect sa `Content-Disposition: attachment` – browser počinje download.

### `GET /api/proxy-download?src=...&title=...`

Stream proxy sa **whitelist-om hostova** (`PROXY_ALLOW_HOSTS`).  
Bezbedni naziv fajla + Content-Disposition UTF-8.

---

## ⚙️ Konfiguracija

### `server/.env`

```bash
PORT=5176
WEB_ORIGIN=http://localhost:3000
ENABLE_LEGACY_DOWNLOADS=false
PROXY_ALLOW_HOSTS=youtube.com,youtu.be,googlevideo.com,ytimg.com,vimeo.com,cdn.videodelivery.net
YTDLP_BINARY=yt-dlp
NODE_ENV=development
```

### `web/.env.local`

```bash
NEXT_PUBLIC_API_BASE=http://localhost:5176
```

---

## 🎨 Frontend flow

1. **DownloaderHome** – URL input + "Analyze" dugme  
2. **onAnalyze** callback → `DesktopApp` čuva `lastAnalyzedUrl`  
3. **DownloaderPanel** prima `prefilledUrl` + `analyzeSignal` → poziva `/api/analyze`  
4. Prikaže:
   - **Muxed** (video+audio) formati  
   - **Audio-only** formati  
   - Dugmad: **Open (302)** ili **Proxy**

### Primer: Open 302

```tsx
const open302 = (params: Record<string, string | undefined>) => {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value) search.set(key, value);
  });
  window.open(`${API_BASE}/api/redirect?${search.toString()}`, '_blank');
};
```

### Primer: Proxy

```tsx
const proxy = (params: Record<string, string | undefined>) => {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value) search.set(key, value);
  });
  if (info?.title) search.set('filename', info.title);
  window.open(`${API_BASE}/api/proxy-download?${search.toString()}`, '_blank');
};
```

---

## 🧪 Testiranje

```powershell
# Backend health
curl http://localhost:5176/api/health

# Analyze
curl "http://localhost:5176/api/analyze?url=https://www.youtube.com/watch?v=dQw4w9WgXcQ"

# Get direct URL
curl "http://localhost:5176/api/get-url?url=https://www.youtube.com/watch?v=dQw4w9WgXcQ&kind=best"
```

---

## 🛡️ Bezbednost

- **Helmet** (XSS, Clickjacking protection)  
- **CORS allowlist** (samo whitelist origin-i)  
- **SSRF guard** (proxy dozvoljava samo `PROXY_ALLOW_HOSTS`)  
- **Sanitizovani nazivi fajlova** (ASCII fallback)  
- **Body limits** (1MB JSON)

---

## 📝 Napomene

- **Bez ffmpeg-a** – koristi se samo yt-dlp `-g` (direktan URL)  
- **Bez čuvanja fajlova** – sve je 302 ili stream proxy  
- **Legacy rute** mogu se uključiti sa `ENABLE_LEGACY_DOWNLOADS=true`  
- **AuthProvider** wrapper postoji u `web/app/page.tsx` – možeš ga zaobići ili iskoristiti za Supabase login

---

## 🎯 Sledeći koraci

1. **Thumbnail ekstrakcija** – dodaj `/api/thumbnail?url=...&timestamp=...`  
2. **Batch queue** – `/api/batch/start` + SSE progress  
3. **History panel** – sacuvaj downloads u localStorage ili backend  
4. **Settings panel** – max concurrent, proxy toggle, format defaults

---

**Happy downloading! ✨**  
Made with 💛 by a0o0o0o

[Donate via PayPal](https://paypal.me/zoxknez)
