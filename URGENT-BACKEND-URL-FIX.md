# 🚨 URGENT FIX NEEDED - Wrong Backend URL

## ❌ Problem Detected

Frontend pokušava da se poveže na:
```
❌ https://pumpaj-web-production.up.railway.app/api/me
```

Ali pravi backend je:
```
✅ https://pumpaj-backend-production.up.railway.app
```

---

## 🔧 Fix 1: Set Environment Variable on Vercel

### Go to:
```
https://vercel.com/o0o0o0os-projects/web/settings/environment-variables
```

### Add Variable:
```
Name:  NEXT_PUBLIC_API_BASE
Value: https://pumpaj-backend-production.up.railway.app
```

### Apply to:
- [x] Production
- [x] Preview
- [x] Development

### Save and Redeploy:
```powershell
vercel --prod
```

---

## 🔧 Fix 2: Clear localStorage Override (Immediate)

Otvori Console (F12) na https://pumpajvideodl.com i pokreni:

```javascript
// Check current override
console.log('Current API override:', localStorage.getItem('pumpaj:apiBaseOverride'));

// Remove bad override
localStorage.removeItem('pumpaj:apiBaseOverride');

// Verify removed
console.log('After removal:', localStorage.getItem('pumpaj:apiBaseOverride'));

// Hard refresh
location.reload();
```

---

## 🔧 Fix 3: Use Cache Cleaner Tool

```
https://pumpajvideodl.com/clear-cache.html
```

Klikni "Clear Cache & Reload" - ovo će obrisati localStorage sa lošim API override-om.

---

## 📊 Verification

After fixing, check Console (F12):

### Before Fix (BAD):
```
❌ CORS error from pumpaj-web-production.up.railway.app
```

### After Fix (GOOD):
```
✅ No CORS errors
✅ Requests go to pumpaj-backend-production.up.railway.app
✅ Google OAuth works
✅ Session persists
```

---

## 🎯 Quick Command to Check

```javascript
// Paste in Console (F12)
console.log('API_BASE:', 
  process.env.NEXT_PUBLIC_API_BASE || 
  localStorage.getItem('pumpaj:apiBaseOverride') || 
  'NOT SET'
);
```

---

## ⚡ Immediate Action Required

**Do THIS NOW:**

1. Open Console (F12) on https://pumpajvideodl.com
2. Run: `localStorage.removeItem('pumpaj:apiBaseOverride')`
3. Run: `location.reload()`
4. Try Google Login again

**Then later (for permanent fix):**

5. Add `NEXT_PUBLIC_API_BASE` to Vercel
6. Redeploy with `vercel --prod`

---

## 📝 Root Cause

Someone (ili neki script) je setovao localStorage override na pogrešan URL:
```javascript
localStorage.setItem('pumpaj:apiBaseOverride', 'https://pumpaj-web-production.up.railway.app');
```

Ovo override-uje sve environment variables i forcing backend calls na WEB server umesto BACKEND server!

---

**Status**: 🔴 URGENT - Blocking Google OAuth  
**Impact**: High - Users cannot login  
**Fix Time**: 2 minutes (localStorage clear) + 5 minutes (Vercel env setup)
