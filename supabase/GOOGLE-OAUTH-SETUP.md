# ✅ Google OAuth Configuration

## 🔗 Callback URL
```
https://smzxjnuqfvpzfzmyxpbp.supabase.co/auth/v1/callback
```

## 📋 Setup Checklist

### 1. Google Cloud Console
- ✅ **Authorized redirect URIs** configured
- ✅ Callback URL dodato: `https://smzxjnuqfvpzfzmyxpbp.supabase.co/auth/v1/callback`

### 2. Supabase Dashboard
🔗 **Provider Settings**: https://supabase.com/dashboard/project/smzxjnuqfvpzfzmyxpbp/auth/providers

#### Google Provider Configuration:
- ✅ **Enabled**: ON
- ✅ **Client ID**: Kopirano iz Google Cloud Console
- ✅ **Client Secret**: Kopirano iz Google Cloud Console

#### Additional URLs (Redirect URLs):
Dodaj sve u: https://supabase.com/dashboard/project/smzxjnuqfvpzfzmyxpbp/auth/url-configuration

```
https://pumpajvideodl.com/**
https://www.pumpajvideodl.com/**
https://web-c8ycqj1z4-o0o0o0os-projects.vercel.app/**
https://*.vercel.app/**
http://localhost:3000/**
https://smzxjnuqfvpzfzmyxpbp.supabase.co/auth/v1/callback
```

### 3. Frontend Integration

#### Login Button Component
```tsx
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';

export function GoogleLoginButton() {
  const supabase = createClientComponentClient();

  const handleGoogleLogin = async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
        queryParams: {
          access_type: 'offline',
          prompt: 'consent',
        }
      }
    });

    if (error) {
      console.error('Google login error:', error);
    }
  };

  return (
    <button onClick={handleGoogleLogin}>
      Sign in with Google
    </button>
  );
}
```

#### Auth Callback Route (`app/auth/callback/route.ts`)
```typescript
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get('code');

  if (code) {
    const supabase = createRouteHandlerClient({ cookies });
    await supabase.auth.exchangeCodeForSession(code);
  }

  // Redirect to home page after successful login
  return NextResponse.redirect(new URL('/', requestUrl.origin));
}
```

### 4. Environment Variables

Proveri da su postavljeni:

#### `.env.local` (local development)
```bash
NEXT_PUBLIC_SUPABASE_URL=https://smzxjnuqfvpzfzmyxpbp.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNtenhqbnVxZnZwemZ6bXl4cGJwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MjgxMTk3NjAsImV4cCI6MjA0MzY5NTc2MH0.wvnLlI-l-C11kVS8j1OW0ZZ-Zl_G7_C-WZCpYVGx19g
```

#### Vercel (production)
```bash
vercel env add NEXT_PUBLIC_SUPABASE_URL production
# Paste: https://smzxjnuqfvpzfzmyxpbp.supabase.co

vercel env add NEXT_PUBLIC_SUPABASE_ANON_KEY production
# Paste: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

### 5. Testing

#### Local Testing
1. Start dev server: `npm run dev`
2. Navigate to: http://localhost:3000
3. Click "Sign in with Google"
4. Authorize app
5. Check redirect back to app

#### Production Testing
1. Navigate to: https://pumpajvideodl.com
2. Click "Sign in with Google"
3. Authorize app
4. Check redirect back to app

### 6. Troubleshooting

#### Common Issues:

**1. "redirect_uri_mismatch" error**
- ✅ Check Google Cloud Console → Authorized redirect URIs
- ✅ Must include: `https://smzxjnuqfvpzfzmyxpbp.supabase.co/auth/v1/callback`

**2. "Invalid redirect URL" error**
- ✅ Check Supabase → Auth → URL Configuration
- ✅ Must include production URL: `https://pumpajvideodl.com/**`

**3. "User not found" after login**
- ✅ Check database trigger: `handle_new_user()` function
- ✅ Run auto-setup.sql if not already done

**4. CORS errors**
- ✅ Check Supabase → API Settings → CORS
- ✅ Add production domain to allowed origins

### 7. Security Checklist

- ✅ **HTTPS only** for production URLs
- ✅ **Client Secret** stored only in Supabase (not in frontend)
- ✅ **RLS policies** enabled on all tables
- ✅ **Email verification** enabled (optional but recommended)
- ✅ **Rate limiting** on auth endpoints

### 8. Monitoring

#### Supabase Auth Logs
🔗 https://supabase.com/dashboard/project/smzxjnuqfvpzfzmyxpbp/auth/users

Monitor for:
- New user registrations
- Login attempts
- Failed authentications
- Session expirations

---

## 🎉 Google OAuth is Ready!

Users can now:
1. ✅ Sign up with Google account
2. ✅ Login with Google account
3. ✅ Profile automatically created in database
4. ✅ Settings automatically initialized

---

## 📌 Quick Links

- 🔐 **Auth Providers**: https://supabase.com/dashboard/project/smzxjnuqfvpzfzmyxpbp/auth/providers
- 🔗 **URL Config**: https://supabase.com/dashboard/project/smzxjnuqfvpzfzmyxpbp/auth/url-configuration
- 👥 **Users**: https://supabase.com/dashboard/project/smzxjnuqfvpzfzmyxpbp/auth/users
- 🔑 **API Settings**: https://supabase.com/dashboard/project/smzxjnuqfvpzfzmyxpbp/settings/api
- 📊 **Database**: https://supabase.com/dashboard/project/smzxjnuqfvpzfzmyxpbp/editor
