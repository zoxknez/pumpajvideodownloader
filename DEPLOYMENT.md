# 🚀 Pumpaj Video Downloader - Deployment Guide

## Architecture Overview

```
┌─────────────────┐      ┌──────────────────┐      ┌─────────────────┐
│   Vercel        │─────▶│   Railway        │─────▶│   Supabase      │
│   (Frontend)    │      │   (Backend)      │      │   (Database)    │
│   Next.js 15    │      │   Express API    │      │   PostgreSQL    │
└─────────────────┘      └──────────────────┘      └─────────────────┘
```

## 📦 Components

### 1. Frontend - Vercel
- **Framework**: Next.js 15.5.4
- **Repository**: `web/` directory
- **Build Command**: `cd web && npm run build`
- **Output Directory**: `web/.next`
- **Install Command**: `npm install && cd web && npm install`

### 2. Backend - Railway
- **Framework**: Express 5.1.0
- **Repository**: `server/` directory
- **Builder**: Nixpacks
- **Build Command**: `npm ci --prefix server && npm run build --prefix server`
- **Start Command**: `node server/dist/index.js`
- **Runtime**: Node.js 20 + Python 3 + ffmpeg

### 3. Database - Supabase
- **Type**: PostgreSQL
- **Tables**: `profiles`, `download_history`, `user_settings`
- **Auth**: Supabase Auth (email + OAuth providers)
- **Setup Script**: `supabase/setup-database.sql`

---

## 🔧 Environment Variables

### Frontend (Vercel) - `.env.production`

```bash
# API Backend URL (Railway deployment)
NEXT_PUBLIC_API_BASE=https://your-app.railway.app

# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**Vercel Dashboard Setup:**
1. Go to Project Settings → Environment Variables
2. Add `NEXT_PUBLIC_API_BASE` → Railway URL
3. Add `NEXT_PUBLIC_SUPABASE_URL` → Supabase project URL
4. Add `NEXT_PUBLIC_SUPABASE_ANON_KEY` → Supabase anon key

### Backend (Railway) - Environment Variables

```bash
# Server Configuration
PORT=5176
NODE_ENV=production

# CORS - Allow Vercel frontend
CORS_ORIGIN=https://your-app.vercel.app,https://www.your-domain.com

# Supabase Integration
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_JWT_SECRET=your-jwt-secret-from-supabase-settings

# SSRF Protection
ALLOWED_HOSTS=youtube.com,youtu.be,x.com,twitter.com,instagram.com,facebook.com,tiktok.com

# Download Limits
MAX_FILESIZE_MB=2048
MAX_DURATION_SEC=10800
PROXY_DOWNLOAD_MAX_PER_MIN=30
MAX_HISTORY=1000

# Optional: Proxy
PROXY_URL=

# Optional: Rate Limiting
RATE_LIMIT_MAX_REQUESTS_PER_WINDOW=100
RATE_LIMIT_WINDOW_MS=60000
```

**Railway Dashboard Setup:**
1. Go to your service → Variables
2. Add all environment variables listed above
3. **Important**: Set `SUPABASE_JWT_SECRET` to match Supabase project JWT secret

### Supabase - Configuration

```bash
# Database Setup
1. Create new Supabase project
2. Go to SQL Editor
3. Run: supabase/setup-database.sql
4. Enable Row Level Security (RLS)
5. Configure Auth providers (Email, Google, GitHub)

# Get Credentials
1. Project Settings → API
   - Copy Project URL → NEXT_PUBLIC_SUPABASE_URL
   - Copy anon key → NEXT_PUBLIC_SUPABASE_ANON_KEY
   - Copy service_role key → SUPABASE_SERVICE_ROLE_KEY

2. Project Settings → Auth → JWT
   - Copy JWT Secret → SUPABASE_JWT_SECRET (for Railway backend)
```

---

## 🌐 Domain Configuration

### Vercel (Frontend)
1. Add custom domain in Vercel dashboard
2. Update DNS records:
   - `A` record: `76.76.21.21`
   - `CNAME` www → `cname.vercel-dns.com`
3. Enable HTTPS (automatic)

### Railway (Backend)
1. Generate Railway domain: `your-app.railway.app`
2. Copy Railway URL to Vercel's `NEXT_PUBLIC_API_BASE`
3. Update Railway `CORS_ORIGIN` to include Vercel domain

### Supabase (Database)
- Already configured with HTTPS
- No additional DNS setup needed

---

## 📝 Deployment Steps

### Initial Setup

#### 1. Supabase (First!)
```bash
# Create project on supabase.com
# Run SQL setup script
psql $DATABASE_URL < supabase/setup-database.sql

# Configure Auth providers
1. Go to Authentication → Providers
2. Enable Email (magic link)
3. Enable Google OAuth (optional)
4. Set redirect URLs:
   - http://localhost:3000/auth/callback (dev)
   - https://your-app.vercel.app/auth/callback (prod)
```

#### 2. Railway (Backend)
```bash
# Install Railway CLI
npm i -g @railway/cli

# Login and create project
railway login
railway init

# Link to repository
railway link

# Set environment variables (use Railway dashboard or CLI)
railway variables set SUPABASE_URL=...
railway variables set SUPABASE_JWT_SECRET=...
railway variables set CORS_ORIGIN=...

# Deploy
git push origin main
# Railway auto-deploys on push to main
```

#### 3. Vercel (Frontend)
```bash
# Install Vercel CLI
npm i -g vercel

# Login
vercel login

# Link project
vercel link

# Set environment variables
vercel env add NEXT_PUBLIC_API_BASE production
vercel env add NEXT_PUBLIC_SUPABASE_URL production
vercel env add NEXT_PUBLIC_SUPABASE_ANON_KEY production

# Deploy
git push origin main
# Vercel auto-deploys on push to main
```

### Continuous Deployment

**Auto-deploy on `git push`:**
- ✅ Push to `main` branch
- ✅ Vercel rebuilds frontend automatically
- ✅ Railway rebuilds backend automatically
- ✅ Supabase database changes require manual SQL execution

---

## ✅ Post-Deployment Checklist

### Backend Health Check
```bash
# Check Railway backend
curl https://your-app.railway.app/health

# Expected response:
{
  "status": "ok",
  "timestamp": "2025-01-06T12:00:00.000Z",
  "version": "1.0.0"
}
```

### Frontend Health Check
```bash
# Check Vercel frontend
curl https://your-app.vercel.app/api/version

# Should proxy to Railway backend and return version info
```

### Supabase Connection Test
```bash
# Test auth from frontend
1. Open https://your-app.vercel.app
2. Click Login/Register
3. Should redirect to Supabase auth
4. Check browser console for errors
```

### API Integration Test
```bash
# Test video analysis
curl -X POST https://your-app.vercel.app/api/analyze \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{"url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ"}'

# Should return video metadata
```

---

## 🔒 Security Checklist

- ✅ `SUPABASE_SERVICE_ROLE_KEY` only on backend (Railway)
- ✅ `SUPABASE_ANON_KEY` on frontend (Vercel) - public safe
- ✅ CORS configured: Railway allows Vercel origin only
- ✅ HTTPS enabled on all services
- ✅ Row Level Security (RLS) enabled on Supabase tables
- ✅ Rate limiting configured in backend
- ✅ SSRF protection enabled (`ALLOWED_HOSTS`)
- ✅ CSP headers configured in Next.js

---

## 🐛 Troubleshooting

### Frontend can't reach backend
**Problem**: API calls return 404 or CORS errors

**Solution**:
1. Check `NEXT_PUBLIC_API_BASE` in Vercel env vars
2. Verify Railway backend is running: `railway logs`
3. Check CORS_ORIGIN in Railway includes Vercel URL
4. Verify rewrites in `next.config.js` are correct

### Authentication not working
**Problem**: Login redirects fail or tokens invalid

**Solution**:
1. Check Supabase redirect URLs include Vercel URL
2. Verify `SUPABASE_JWT_SECRET` matches in Railway
3. Check Supabase Auth settings (email/OAuth enabled)
4. Clear browser cookies and try again

### Downloads failing
**Problem**: Video downloads timeout or fail

**Solution**:
1. Check Railway logs: `railway logs --service backend`
2. Verify yt-dlp is installed: `yt-dlp --version`
3. Check `ALLOWED_HOSTS` includes video platform
4. Increase Railway memory if OOM errors

### Database connection issues
**Problem**: Backend can't connect to Supabase

**Solution**:
1. Verify `SUPABASE_URL` is correct
2. Check `SUPABASE_SERVICE_ROLE_KEY` is valid
3. Test connection from Railway shell: `railway shell`
4. Check Supabase database status

---

## 📊 Monitoring

### Railway Backend
- Metrics: CPU, Memory, Network in Railway dashboard
- Logs: `railway logs --tail --service backend`
- Alerts: Configure in Railway settings

### Vercel Frontend
- Analytics: Built-in Vercel Analytics
- Logs: Vercel dashboard → Functions → Logs
- Performance: Web Vitals in Vercel dashboard

### Supabase Database
- Logs: Supabase dashboard → Logs
- Queries: Supabase dashboard → Database → Query Performance
- Auth: Supabase dashboard → Authentication → Users

---

## 🔄 Rollback Strategy

### Frontend (Vercel)
```bash
# Rollback to previous deployment
vercel rollback
```

### Backend (Railway)
```bash
# Redeploy previous commit
git revert HEAD
git push origin main
```

### Database (Supabase)
```sql
-- Restore from backup (manual)
-- Supabase dashboard → Database → Backups → Restore
```

---

## 📚 Additional Resources

- [Vercel Documentation](https://vercel.com/docs)
- [Railway Documentation](https://docs.railway.app)
- [Supabase Documentation](https://supabase.com/docs)
- [yt-dlp Documentation](https://github.com/yt-dlp/yt-dlp)
- [Next.js Documentation](https://nextjs.org/docs)

---

**Last Updated**: January 2025  
**Version**: 1.0.0
