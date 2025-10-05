# ✨ Pumpaj Web-First Implementation – COMPLETE

## 🎯 Što je implementirano

### Backend (Express + yt-dlp) ✅

**Lokacija:** `server/src/`

#### Moduli:
- `index.ts` – Express app sa svim rutama
- `yt.ts` – `analyzeUrl()` i `getDirectUrl()` wrapperi za yt-dlp
- `proxyDownload.ts` – Proxy download handler sa whitelist-om hostova
- `utils.ts` – `sanitizeFileName()` i `chooseExtFromMimeOrUrl()`

#### API Endpoints:
1. `GET /api/health` – Health check
2. `GET/POST /api/analyze?url=...` – yt-dlp `-J` metadata
3. `GET /api/get-url?url=...&kind=...&format_id=...` – yt-dlp `-g` direktan URL
4. `GET /api/redirect?url=...&kind=...&format_id=...` – 302 redirect sa Content-Disposition
5. `GET /api/proxy-download?src=...&title=...` – Stream proxy sa bezbednim nazivom fajla

#### Sigurnost:
- ✅ Helmet (XSS, Clickjacking protection)
- ✅ CORS allowlist (WEB_ORIGIN + localhost varijante)
- ✅ SSRF guard (PROXY_ALLOW_HOSTS whitelist)
- ✅ Sanitizovani nazivi fajlova (ASCII fallback)
- ✅ Body limits (1MB JSON)

---

### Frontend (Next.js 15) ✅

**Lokacija:** `web/`

#### Komponente:
1. **DownloaderHome** (`web/components/DownloaderHome.tsx`)
   - URL input bar sa "Analyze" dugmetom
   - Tab navigacija (Download, Queue, Batch, History, Settings)
   - 4 feature kartice sa desktop look-om
   - Status čipovi (Server, Queue, Net)

2. **DownloaderPanel** (`web/components/downloader/DownloaderPanel.tsx`)
   - Prima `prefilledUrl` + `analyzeSignal`
   - Poziva `/api/analyze` i prikazuje formate
   - **Muxed** (video+audio) lista
   - **Audio-only** lista
   - Dugmad: **Open (302)** i **Proxy** za svaki format

3. **DesktopApp** (`web/components/DesktopApp.tsx`)
   - Koordinator između `DownloaderHome` i `DownloaderPanel`
   - Pamti `lastAnalyzedUrl` i `analyzeSignal`
   - Prikazuje panel samo kad je URL analiziran

4. **AuthProvider** (`web/components/AuthProvider.tsx`)
   - Wrapper sa Supabase login/register UI
   - **LoginGate** render children samo ako je user prijavljen
   - Možeš zaobići ili iskoristiti za auth

---

## 🚀 Kako pokrenuti

### 1. Backend

```powershell
cd server
npm install
npm run dev
```

Server: **http://localhost:5176**

### 2. Frontend

```powershell
cd web
npm install
npm run dev
```

Web UI: **http://localhost:3000** (ili 3001/3002 ako je 3000 zauzet)

---

## 🧪 Testiranje

```powershell
# Quick test
cd server
.\test-simple.ps1

# Manual tests
curl http://localhost:5176/api/health
curl "http://localhost:5176/api/analyze?url=https://www.youtube.com/watch?v=..."
```

---

## 📁 Što JE implementirano

✅ **Analyze URL** – yt-dlp `-J` metadata extraction  
✅ **Open (302 redirect)** – browser-native download sa Content-Disposition  
✅ **Proxy download** – stream proxy sa whitelist-om hostova  
✅ **Format picker** – muxed i audio-only lista  
✅ **Desktop UI look** – URL bar + tabovi + 4 feature kartice  
✅ **CORS + Security** – Helmet, allowlist, SSRF guard  
✅ **TypeScript** – strict mode, modularan kod  

---

## 📁 Što NIJE implementirano (next steps)

⏭️ **Legacy rute** – stare `/api/download/*` rute su deaktivne (flag: `ENABLE_LEGACY_DOWNLOADS`)  
⏭️ **Auth zahtev** – svi API endpoints su trenutno bez auth (možeš dodati `requireAuth` middleware)  
⏭️ **Thumbnail ekstrakcija** – `/api/thumbnail?url=...&timestamp=...`  
⏭️ **Batch download** – `/api/batch/start` + queue manager  
⏭️ **SSE progress** – live download progress stream  
⏭️ **History panel** – perzistencija downloads u localStorage ili backend  
⏭️ **Settings panel** – max concurrent, proxy toggle, format defaults  

---

## 🔧 Konfiguracija

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
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
```

---

## 💡 Kako dalje

### 1. Dodaj auth na API endpoints

U `server/src/index.ts`, importuj middleware:

```typescript
import { requireAuth } from '../middleware/auth.js';

app.get('/api/analyze', requireAuth, async (req, res) => { ... });
```

### 2. Dodaj thumbnail ekstrakciju

```typescript
app.get('/api/thumbnail', async (req, res) => {
  const url = String(req.query.url || '').trim();
  const timestamp = req.query.timestamp || '00:00:01';
  // yt-dlp --write-thumbnail --skip-download ...
});
```

### 3. Batch download

```typescript
app.post('/api/batch/start', async (req, res) => {
  const { urls, kind } = req.body;
  const batchId = randomUUID();
  // Kreiraj queue, vrati batchId
});

app.get('/api/batch/:id/status', (req, res) => {
  // SSE stream sa batch progress
});
```

### 4. History panel

Frontend:

```typescript
// localStorage ili API poziv
const history = JSON.parse(localStorage.getItem('download_history') || '[]');
```

Backend:

```typescript
app.get('/api/history', requireAuth, (req, res) => {
  // Vrati user download history iz DB
});
```

---

## 📝 Razlike između starog i novog

| Staro | Novo |
|-------|------|
| `server/index.ts` (2484 linija) | `server/src/` (modularno, 4 fajla) |
| Job queue + SSE progress | Nema job queue (next step) |
| Auth required | Auth optional (može se uključiti) |
| ffmpeg merge | Samo direktan URL (bez merge-a) |
| Čuvanje fajlova u `/tmp` | Bez čuvanja (302 ili proxy) |

---

## 🎉 Rezultat

- ✅ **Backend radi** – `http://localhost:5176` (testirano)
- ✅ **Frontend radi** – `http://localhost:3000`
- ✅ **CORS OK** – allowlist config
- ✅ **UI look** – desktop-style panel sa karticama
- ✅ **Format picker** – muxed i audio lista
- ✅ **Open & Proxy** – bez čuvanja fajlova

---

**Made with 💛 by a0o0o0o**

[Donate via PayPal](https://paypal.me/zoxknez)
