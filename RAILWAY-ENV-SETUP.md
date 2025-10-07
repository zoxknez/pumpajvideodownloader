# Railway Environment Variables Setup

## 🔧 Required Configuration

After deploying to Railway, you **MUST** configure these environment variables in the Railway dashboard:

### Critical Variables (Required for production)

```bash
# CORS - Allow frontend domain
CORS_ORIGIN=https://pumpajvideodl.com

# Supabase Integration (required for auth)
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
SUPABASE_JWT_SECRET=your-jwt-secret

# Port (optional - Railway auto-assigns)
PORT=5176
```

### Optional Variables

```bash
# SSRF Protection - Whitelist allowed domains for downloads
ALLOWED_HOSTS=youtube.com,youtu.be,x.com,twitter.com,vimeo.com

# Rate Limiting
MAX_FILESIZE_MB=500
MAX_DURATION_SEC=3600
PROXY_DOWNLOAD_MAX_PER_MIN=30
MAX_HISTORY=100

# Trust Proxy (Railway specific)
TRUST_PROXY_CIDRS=10.0.0.0/8,172.16.0.0/12,192.168.0.0/16
```

## 🚨 Common Issues

### CORS Error: "No 'Access-Control-Allow-Origin' header"
**Symptom**: Frontend gets CORS errors when calling API
**Solution**: Set `CORS_ORIGIN=https://pumpajvideodl.com` in Railway environment variables

### Auth failing with 401/403
**Symptom**: Guest login fails, /api/me returns unauthorized
**Solution**: Verify all three Supabase env vars are set correctly

## 📝 How to Set Environment Variables in Railway

1. Go to Railway dashboard: https://railway.app
2. Select your project: `pumpajvideodownloader-production`
3. Click on the service (backend API)
4. Go to **Variables** tab
5. Click **+ New Variable**
6. Add each variable from the list above
7. Click **Deploy** to restart with new variables

## 🔍 Verify Configuration

After setting variables, check logs:
```bash
# In Railway dashboard, go to Deployments → View Logs
# Look for:
[info] CORS origins: https://pumpajvideodl.com
[info] Supabase configured: true
```

## 🌐 Multiple Domains (Optional)

To allow multiple frontend domains:
```bash
# Comma-separated list
CORS_ORIGIN=https://pumpajvideodl.com,https://pumpajvideodownloader.vercel.app

# Or use regex pattern
CORS_ORIGIN=/^https:\/\/(.*\.)?pumpajvideodl\.com$/
```

## 📚 Reference

- Main docs: `server/.env.example`
- CORS implementation: `server/core/corsOrigin.ts`
- Security setup: `server/middleware/security.ts`
