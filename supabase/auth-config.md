# Supabase Authentication Configuration
# ==========================================
# Copy these settings to Supabase Dashboard:
# Authentication → URL Configuration

## Site URL
https://pumpajvideodl.com

## Redirect URLs (one per line)
https://pumpajvideodl.com/**
https://www.pumpajvideodl.com/**
https://pumpajvideodl.vercel.app/**
https://pumpajvideodl-*.vercel.app/**
https://*.vercel.app/**
http://localhost:3000/**
http://localhost:3001/**

## Additional Redirect URLs (for email confirmation)
https://pumpajvideodl.com/auth/callback
https://www.pumpajvideodl.com/auth/callback
https://pumpajvideodl.vercel.app/auth/callback
http://localhost:3000/auth/callback

# ==========================================
# Email Auth Settings
# Authentication → Providers → Email
# ==========================================

Enable Email Provider: ✅ Yes
Confirm Email: ✅ Yes (recommended)
Secure Email Change: ✅ Yes
Double Confirm Email Change: ⬜ Optional

# ==========================================
# Email Templates
# Authentication → Email Templates
# ==========================================

You can customize:
- Confirm signup
- Invite user
- Magic Link
- Change Email Address
- Reset Password

# ==========================================
# Rate Limiting
# Authentication → Rate Limits
# ==========================================

Rate Limiting: ✅ Enabled
Per Hour: 30 (default)
Per Minute: 5 (default)

# ==========================================
# Security Settings
# ==========================================

JWT expiry: 3600 seconds (1 hour)
Refresh token rotation: ✅ Enabled
Reuse interval: 10 seconds
