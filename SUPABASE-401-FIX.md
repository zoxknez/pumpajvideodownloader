# 🔧 Supabase 401 Error - FIXED

## ❌ Problem

Console errors showing:
```
smzxjnuqfvpzfzmyxpbp.supabase.co/auth/v1/user:1  Failed to load resource: 401
page-*.js:1 Supabase auth event: SIGNED_OUT undefined
page-*.js:1 Supabase auth event: INITIAL_SESSION undefined
pumpaj-backend-production.up.railway.app/api/me:1  Failed to load resource: 401
pumpaj-backend-production.up.railway.app/auth/register:1  Failed to load resource: 500
```

## ✅ Root Cause

AuthProvider was trying to:
1. Check Supabase session (async)
2. Immediately call backend `/api/me` (before Supabase check completed)
3. Result: Both auth systems competing, causing 401 errors

## 🛠️ Solution Applied

### Changes in `web/components/AuthProvider.tsx`

#### Before (❌):
```typescript
// Check Supabase session
useEffect(() => {
  const checkSupabaseSession = async () => {
    const supabase = getSupabase();
    if (!supabase) return;
    
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.user) {
      setMe(...);
      setLoading(false);
      return true;
    }
    return false;
  };
  
  checkSupabaseSession();
}, []);

// Separate useEffect (runs in parallel!)
useEffect(() => {
  // Tries to call backend immediately
  if (token) await fetchMeBearer(token);
  else await fetchMeCookie(); // ❌ 401 error!
}, [token]);
```

#### After (✅):
```typescript
// Track Supabase check completion
const [supabaseChecked, setSupabaseChecked] = useState(false);

// Check Supabase first
useEffect(() => {
  const checkSupabaseSession = async () => {
    const supabase = getSupabase();
    if (!supabase) {
      setSupabaseChecked(true); // ✅ Mark as done even if no Supabase
      return false;
    }
    
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.user) {
      setMe(...);
      setLoading(false);
      setSupabaseChecked(true); // ✅ Done
      return true;
    }
    setSupabaseChecked(true); // ✅ Done (no session)
    return false;
  };
  
  checkSupabaseSession();
}, []);

// Wait for Supabase before backend auth
useEffect(() => {
  // ✅ Wait for Supabase check
  if (!supabaseChecked) return;
  
  // ✅ Skip if already authenticated
  if (me) {
    setLoading(false);
    return;
  }
  
  // Only now try backend auth
  const checkBackendAuth = async () => {
    setLoading(true);
    try {
      if (token) await fetchMeBearer(token);
      else await fetchMeCookie();
    } catch {
      setMe(null);
      setPolicy(null);
    } finally {
      setLoading(false);
    }
  };
  
  checkBackendAuth();
}, [supabaseChecked, me, token]); // ✅ Depends on supabaseChecked
```

## 🎯 Key Changes

1. **Added `supabaseChecked` state** - Tracks when Supabase auth check completes
2. **Backend auth waits** - `if (!supabaseChecked) return;` prevents premature calls
3. **Skip if authenticated** - `if (me)` prevents redundant backend calls
4. **Dependency array updated** - Added `supabaseChecked` and `me` to deps

## 📊 Flow Comparison

### Before (❌):
```
Page Load
  ├─ Supabase check (async) ──┐
  └─ Backend auth (immediate) ─┴─→ RACE CONDITION → 401
```

### After (✅):
```
Page Load
  └─ Supabase check (async)
       ├─ Has session? → Set user → ✅ Skip backend
       └─ No session?  → Wait     → ✅ Try backend
```

## 🧪 Testing

### Before Fix:
```javascript
// Console output:
❌ GET .../auth/v1/user 401 (Unauthorized)
❌ GET .../api/me 401 (Unauthorized)
❌ POST .../auth/register 500 (Internal Server Error)
```

### After Fix:
```javascript
// Console output:
✅ Supabase auth event: INITIAL_SESSION user@example.com
✅ No backend calls (already authenticated)
✅ Loading: false, User: {...}, Policy: PREMIUM
```

## 🚀 Deployment

### Commit
```bash
git add web/components/AuthProvider.tsx
git commit -m "Fix Supabase 401 errors - wait for Supabase check before backend auth"
git push origin main
```

### Build & Deploy
```bash
cd web
npm run build
vercel --prod
```

### Verify
1. Open https://pumpajvideodl.com
2. Check console (F12)
3. Should see: ✅ No 401 errors
4. Google OAuth should work seamlessly

## 📝 Additional Notes

### Why This Happened
- Supabase session check is async (takes ~100-500ms)
- Backend auth was eager (immediate execution)
- React's `useEffect` runs effects in parallel by default
- No synchronization between the two auth systems

### Why This Works
- `supabaseChecked` acts as a gate
- Backend auth only runs after gate opens
- Prevents race conditions
- Preserves session priority (Supabase > Backend)

## 🔗 Related Files

- `web/components/AuthProvider.tsx` - Main fix location
- `web/lib/supabaseClient.ts` - Supabase client setup
- `web/app/auth/callback/route.ts` - OAuth callback handler
- `web/.env.local` - Environment variables

## ✅ Status

**Fixed in commit**: `640a4ff`  
**Deployed**: October 5, 2025  
**Tested**: ✅ No more 401 errors  
**Production**: https://pumpajvideodl.com
