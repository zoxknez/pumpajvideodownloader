# 🚀 PUMPAJ - Optimized Production Deployment

**Arhitektura**: Vercel (Frontend UI) + Railway (Backend API/SSE/Downloads)
**Prednosti**: Stabilan SSE, ffmpeg/yt-dlp bez ograničenja, brži latency

## 📋 Pre-deployment Verifikacija

```powershell
# Potpuna build verifikacija
npm install
npm run build:server    # Kompajlira server u dist/
npm run build          # Kreira frontend dist/
npm run verify         # Cela CI pipeline
```

## 🚂 RAILWAY BACKEND (PRVO!)

### 1. Login & Project Setup
```powershell
railway login
railway link    # Izaberi/kreiraj projekat
```

### 2. Environment Variables (Kritično!)
```powershell
# OBAVEZNO - PORT će Railway postaviti automatski
railway variables set NODE_ENV=production

# CORS - svi dozvoljena domeni (dodaj sve verzije)
railway variables set CORS_ORIGIN="https://your-app.vercel.app,https://your-app-git-main.vercel.app,https://www.your-domain.com"

# Security
railway variables set LINK_SIGN_SECRET="your-super-strong-secret-key-256bit"
railway variables set SIGN_KID_ACTIVE=v1

# Opcionalno - Limits
railway variables set MAX_FILESIZE_MB=500
railway variables set MAX_DURATION_SEC=7200
railway variables set PROXY_SPOOL_TO_TEMP=1
```

### 3. Deploy
```powershell
railway up
```

### 4. Get Railway URL
```powershell
railway status
# Kopiraj URL: https://something.up.railway.app
```

## 🌐 VERCEL FRONTEND (DRUGO!)

### 1. Update Environment
```powershell
vercel login
vercel link
```

### 2. Set API Base (Railway URL)
```powershell
# Koristi stvarni Railway URL iz prethodnog koraka
vercel env add VITE_API_BASE production
# Paste: https://your-railway-backend.up.railway.app

vercel env add NODE_ENV production
# Enter: production
```

### 3. Deploy
```powershell
vercel --prod
```

## ✅ VERIFIKACIJA

### 1. Health Checks
```powershell
# Backend ready check
curl https://your-railway-backend.up.railway.app/ready
# Expected: {"ok": true}

# Frontend load
curl https://your-frontend.vercel.app
# Expected: HTML page loads
```

### 2. SSE Test (Direktan Railway Hit)
```javascript
// U browser console na frontend-u
const sse = new EventSource('https://your-railway-backend.up.railway.app/api/progress/test');
sse.onmessage = (e) => console.log('SSE:', e.data);
```

### 3. Full Download Test
1. Paste YouTube URL → Analyze
2. Proveri SSE progress updates  
3. Potvrdi successful download

## � TROUBLESHOOTING

### CORS Issues
```powershell
# Dodaj nov domen u Railway
railway variables set CORS_ORIGIN="existing-domains,https://new-domain.com"
```

### SSE Connection Problems
- Direktno testiraj Railway endpoint (zaobiđi Vercel)
- Proveri CORS headers u Network tab
- Verify connection origin u Railway logs

### Railway Logs Debug
```powershell
railway logs --tail
# Look for: CORS errors, SSE disconnects, ffmpeg issues
```

## 🚀 PRODUCTION OPTIMIZATIONS

### Railway Regions
- Izaberi region blizu korisnika
- US West/East za YouTube brzinu
- EU Central za evropske korisnike

### CORS Setup
```javascript
// Automatski u backend-u - samo setuj Railway env:
CORS_ORIGIN=https://app.vercel.app,https://app-git-main.vercel.app,https://preview.vercel.app
```

### SSE Stability  
- ✅ Direktan Railway hit (trenutna config)
- ❌ Kroz Vercel proxy (može prekidati)

## 📊 MONITORING

### Railway Health
```powershell
railway logs --service backend --tail
```

### Vercel Analytics
```powershell
vercel logs --follow
```

---

## � KLJUČNE PREDNOSTI

1. **Railway**: Stalno aktivan proces, stabilne TCP konekcije, ffmpeg/yt-dlp
2. **Vercel**: Optimizovan static serving, global CDN, instant deploys  
3. **Direktan hit**: Minimalan latency za SSE/downloads
4. **Auto-scaling**: Railway containers + Vercel edge functions

**Production URLs**:
- Frontend: `https://your-app.vercel.app`
- Backend: `https://your-api.up.railway.app`