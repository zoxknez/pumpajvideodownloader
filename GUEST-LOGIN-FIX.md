## Guest Login Production Issue - Analysis

### ✅ Confirmed Working Locally
- Local endpoint `http://localhost:5176/auth/guest` returns **200 OK**
- Response includes valid JWT token, user object, policy, and guestExpiresAt
- Local build (server/dist/) contains the guest route

### ❌ Production Issue
- Production endpoint `https://pumpaj-backend-production.up.railway.app/auth/guest` returns **404**
- Error message: "Cannot POST /auth/guest"

### 🔍 Root Cause Analysis
**The production Railway instance is running an OLD build that doesn't include the guest route.**

Evidence:
1. `/api/version` still returns old CSP headers (`script-src 'self'` instead of new analytics-enabled version)
2. Guest route returns 404 (route doesn't exist in deployed code)
3. Latest commit (56efa7b) with guest route is pushed to GitHub but Railway hasn't rebuilt

### 🛠️ Solution Steps

#### 1. Trigger Railway Redeploy
Railway needs to pull the latest commit and rebuild:
- Option A: Manual redeploy from Railway dashboard (Services → pumpaj-backend-production → Deployments → "New Deployment")
- Option B: Use Railway CLI: `railway up` from repo root
- Option C: Push an empty commit to trigger rebuild: `git commit --allow-empty -m "chore: trigger railway rebuild" && git push`

#### 2. Verify Environment Variables
Ensure Railway has the required Supabase variables set:
```
SUPABASE_URL=https://smzxjnuqfvpzfzmyxpbp.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<your-service-role-key>
```
(Or any of the accepted aliases: `SUPABASE_SERVICE_KEY`, `SUPABASE_SECRET_KEY`, `SUPABASE_SERVICE_API_KEY`)

These variables enable the backend to verify Supabase OAuth tokens via remote API call.

#### 3. Post-Deploy Verification
After successful deployment, test:
```powershell
# Test guest endpoint
Invoke-WebRequest -Method POST -Uri 'https://pumpaj-backend-production.up.railway.app/auth/guest' -UseBasicParsing

# Verify new version deployed (should show analytics in CSP)
Invoke-WebRequest -Uri 'https://pumpaj-backend-production.up.railway.app/api/version' -UseBasicParsing | Select-Object -ExpandProperty Headers
```

#### 4. Frontend Integration Check
Once backend is live, test from frontend:
1. Visit https://pumpajvideodl.com
2. Click "Continue as guest" button
3. Should receive valid session without 404 errors

### 📋 Technical Details

**Build Command (from railway.json):**
```bash
npm ci --prefix server && npm run build --prefix server
```

**Start Command:**
```bash
node server/dist/index.js
```

**Expected Routes After Deploy:**
- `POST /auth/guest` → 200 OK (guest session)
- `POST /auth/login` → 200 OK (username/password)
- `POST /auth/register` → 200 OK (new account)
- `GET /api/me` → 200 OK (authenticated user info)

**Current Local Build Hash:** 56efa7b
**Production Build Hash:** Unknown (needs verification after redeploy)

### 🚨 Critical Note
Without redeploying, the production backend **cannot** serve guest requests because the route literally doesn't exist in the currently running code. The local build proves the code is correct—Railway just needs to catch up.
