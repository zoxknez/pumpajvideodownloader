# 🔧 Quick Fix - 401 Errors Still Showing

## ⚠️ Problem
After deployment, still seeing:
```
smzxjnuqfvpzfzmyxpbp.supabase.co/auth/v1/user:1 - 401
pumpaj-backend-production.up.railway.app/api/me:1 - 401
```

## 🎯 Quick Fixes

### Fix 1: Hard Refresh (90% of cases)
```
1. Open https://pumpajvideodl.com
2. Press: Ctrl + Shift + R (Windows) or Cmd + Shift + R (Mac)
3. This clears browser cache and reloads
```

### Fix 2: Clear Browser Cache
```
1. Open DevTools (F12)
2. Right-click Refresh button
3. Select "Empty Cache and Hard Reload"
```

### Fix 3: Clear Application Storage
```
1. Open DevTools (F12)
2. Go to "Application" tab
3. Click "Clear site data"
4. Reload page
```

### Fix 4: Incognito/Private Window
```
1. Open Incognito/Private window
2. Go to https://pumpajvideodl.com
3. Try login again
```

## 🔍 Debug Steps

### Step 1: Check Deployment
Visit Vercel dashboard to confirm latest deployment is live:
```
https://vercel.com/o0o0o0os-projects/web
```

Latest deployment should be: **BhTbmFtPVNQcaVYGktZ5zqAJEz4S**

### Step 2: Run Debug Script
1. Open https://pumpajvideodl.com
2. Open Console (F12)
3. Copy/paste contents of `debug-auth.js`
4. Check output

### Step 3: Check Network Tab
1. Open Network tab (F12)
2. Reload page
3. Look for:
   - ✅ `/auth/v1/user` - should be 200 if logged in
   - ⚠️ `/api/me` - should NOT be called if Supabase session exists

## 📊 Expected Behavior

### When NOT logged in:
```
1. Page loads
2. Supabase checks session → no session
3. Backend checks /api/me → 401 (expected)
4. Shows login screen
```

### When logged in via Google OAuth:
```
1. Page loads
2. Supabase checks session → session found ✅
3. Backend /api/me is SKIPPED (no call)
4. Shows app directly
```

### Current Issue (if still happening):
```
1. Page loads
2. Supabase checks session → session found
3. Backend STILL calls /api/me → 401 ❌
4. Means: AuthProvider not updated on Vercel
```

## ✅ Verify Fix Worked

Open Console (F12) and check logs:
```javascript
// Should see:
✅ "Supabase auth event: INITIAL_SESSION user@example.com"
✅ No /api/me request in Network tab

// Should NOT see:
❌ "Supabase auth event: SIGNED_OUT"
❌ 401 errors
```

## 🚀 Re-deploy if needed

If hard refresh doesn't work:

```powershell
# From project root
cd web
npm run build
vercel --prod
```

Wait 30 seconds, then hard refresh browser.

## 🐛 Still Not Working?

If 401 errors persist after ALL above steps:

1. **Check Environment Variables on Vercel**:
   ```
   https://vercel.com/o0o0o0os-projects/web/settings/environment-variables
   ```
   
   Should have:
   - `NEXT_PUBLIC_SUPABASE_URL` = https://smzxjnuqfvpzfzmyxpbp.supabase.co
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` = eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

2. **Check Build Logs**:
   ```
   https://vercel.com/o0o0o0os-projects/web/BhTbmFtPVNQcaVYGktZ5zqAJEz4S
   ```
   
   Look for build errors or warnings.

3. **Force new deployment**:
   ```powershell
   git commit --allow-empty -m "Force rebuild"
   git push origin main
   ```
   
   Vercel auto-deploys on git push.

## 📝 Files to Check

- `web/components/AuthProvider.tsx` - Has `supabaseChecked` state?
- `web/lib/supabaseClient.ts` - Returns client correctly?
- `web/.env.local` - Environment variables set?

## 🎯 Summary

Most likely cause: **Browser cache**  
Quick fix: **Hard refresh (Ctrl+Shift+R)**  
Nuclear option: **Incognito window**

---

**Last Deployment**: Oct 5, 2025  
**Deployment ID**: BhTbmFtPVNQcaVYGktZ5zqAJEz4S  
**Status**: ✅ Fixed in code, may need cache clear
