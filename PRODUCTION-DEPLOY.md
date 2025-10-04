# 🚀 PUMPAJ - Production Deployment Guide

Kompletni vodič za deployment Vite frontend-a na Vercel i Express backend-a na Railway.

## 📋 Pre-deployment Checklist

### 1. Build Verification
```powershell
# Iz root direktorijuma
npm install
npm run build:server    # Kompajlira backend u server/dist/
npm run build          # Kreira frontend dist/
npm run verify         # Potpuna CI pipeline
```

### 2. Environment Variables Setup

#### Backend (Railway)
```
NODE_ENV=production
PORT=8080
CORS_ORIGIN=https://your-frontend-domain.vercel.app
```

#### Frontend (Vercel) 
```
VITE_API_BASE=https://your-backend.up.railway.app
NODE_ENV=production
```

## 🎯 DEPLOYMENT KORACI

### 📦 Backend Deployment (Railway)

1. **Login to Railway**
```powershell
railway login
```

2. **Link Project**
```powershell
railway link
# Izaberi postojeći projekat ili kreiraj novi
```

3. **Set Environment Variables**
```powershell
railway variables set NODE_ENV=production
railway variables set PORT=8080
railway variables set CORS_ORIGIN=https://your-frontend.vercel.app
```

4. **Deploy**
```powershell
railway up
```

5. **Get Backend URL**
```powershell
railway status
# Kopiraj dobijenu URL (npr: https://pumpaj-backend-production.up.railway.app)
```

### 🌐 Frontend Deployment (Vercel)

1. **Update vercel.json rewrites sa stvarnim backend URL-om**
Otvori `vercel.json` i zameni `YOUR_RAILWAY_BACKEND_URL` sa Railway URL-om iz prethodnog koraka.

2. **Login to Vercel**
```powershell
vercel login
```

3. **Link Project**
```powershell
vercel link
```

4. **Set Environment Variables**
```powershell
vercel env add VITE_API_BASE production
# Unesi Railway backend URL kada CLI traži

vercel env add NODE_ENV production
# Unesi: production
```

5. **Deploy**
```powershell
vercel --prod
```

## 🔍 Verifikacija

### Health Check
```powershell
# Backend
curl https://your-backend.up.railway.app/health
# Expected: {"ok": true}

# Frontend 
curl https://your-frontend.vercel.app
# Expected: HTML page loads
```

### Full Flow Test
1. Otvori frontend URL u browser-u
2. Testiraj analyze funkciju sa YouTube URL-om  
3. Proveri da SSE progress radi
4. Potvrdi da download završava uspešno

## 🐛 Troubleshooting

### CORS Issues
```powershell
# Update backend CORS_ORIGIN
railway variables set CORS_ORIGIN=https://new-frontend-domain.com
```

### Build Failures
```powershell
# Clean i retry
npm run dev:clean
npm run build:server && npm run build
```

### SSE Connection Issues
- Proveri da Vercel rewrites rade ispravno
- Test direktno backend `/api/progress/:id` endpoint

## 📊 Monitoring

### Railway Logs
```powershell
railway logs --tail
```

### Vercel Logs
```powershell
vercel logs --follow
```

## 🔧 Rollback Strategy

### Railway
```powershell
railway redeploy <deployment-id>
```

### Vercel  
```powershell
vercel rollback <deployment-url>
```

---

## 🎉 Post-Deployment

1. Update DNS (ako imaš custom domain)
2. Configure analytics/monitoring
3. Setup automated health checks
4. Update documentation sa production URL-ovima

**Frontend URL**: https://your-app.vercel.app  
**Backend URL**: https://your-api.up.railway.app