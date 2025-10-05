# 🗄️ Supabase Setup Instructions

## ✅ Quick Setup Checklist

### 1. **Auth URL Configuration** 
🔗 Go to: [Authentication → URL Configuration](https://supabase.com/dashboard/project/fvbayulmttmcdeiybeot/auth/url-configuration)

**Site URL:**
```
https://pumpajvideodl.com
```

**Redirect URLs** (add all of these):
```
https://pumpajvideodl.com/**
https://www.pumpajvideodl.com/**
https://pumpajvideodl.vercel.app/**
https://*.vercel.app/**
http://localhost:3000/**
```

---

### 2. **Database Schema Status**

✅ **Already Created!** Your database has the following tables:

- `profiles` - User profiles with plan management
- `download_jobs` - Active download jobs
- `download_history` - Completed downloads archive
- `user_sessions` - Session tracking
- `usage_stats` - User usage analytics
- `system_stats` - System-wide metrics
- `subscription_plans` - Available subscription tiers
- `user_subscriptions` - User subscription records
- `payments` - Payment transaction history
- `rate_limits` - API rate limiting
- `security_events` - Security audit log
- `error_logs` - Error tracking
- `supported_platforms` - Platform configuration
- `user_favorites` - Saved favorites

**Row Level Security (RLS):** ✅ Enabled on all tables
**Triggers:** ✅ Auto-update timestamps and user creation

---

### 3. **Verify Database**

🔍 Check tables at: [Table Editor](https://supabase.com/dashboard/project/fvbayulmttmcdeiybeot/editor)

Expected tables should be visible in the left sidebar under `public` schema.

---

### 4. **Email Provider Configuration**

🔗 Go to: [Authentication → Providers](https://supabase.com/dashboard/project/fvbayulmttmcdeiybeot/auth/providers)

**Enable:**
- ✅ Email (should already be enabled)
- ✅ Confirm Email
- ✅ Secure Email Change

---

### 5. **Test Authentication Flow**

Visit: https://pumpajvideodl.com

1. Click "Sign Up" or "Log In"
2. Enter email and password
3. Check inbox for confirmation email
4. Confirm email
5. Log in successfully

---

## 📊 Database Schema Overview

### **Profiles Table**
Stores user information and subscription details:
- `id` - UUID (references auth.users)
- `username` - Unique username
- `email` - User email
- `plan` - FREE, PREMIUM, ENTERPRISE
- `trial_ends_at` - Trial expiration
- `settings` - JSON preferences

### **Download Jobs Table**
Active download tracking:
- `user_id` - Who initiated
- `url` - Source URL
- `platform` - youtube, tiktok, etc.
- `status` - pending, processing, completed, failed
- `format` - mp4, mp3, webm
- `quality` - 1080p, 720p, etc.

### **Download History Table**
Archive of completed downloads:
- All fields from download_jobs
- `completed_at` - Timestamp
- `file_path` - Storage location (if applicable)

---

## 🔐 Security Features

✅ **Row Level Security (RLS)** - Users can only access their own data
✅ **Triggers** - Auto-create profile on signup
✅ **Rate Limiting** - API protection
✅ **Security Events** - Audit logging
✅ **Email Confirmation** - Verify user identity

---

## 🎯 Current Status

| Component | Status | Notes |
|-----------|--------|-------|
| Database Schema | ✅ Complete | All tables created |
| RLS Policies | ✅ Active | User isolation enabled |
| Auth Provider | ✅ Enabled | Email auth ready |
| Redirect URLs | ⏳ **ACTION NEEDED** | Add URLs in dashboard |
| Triggers | ✅ Working | Auto-profile creation |
| Indexes | ✅ Optimized | Performance ready |

---

## 🚀 Next Steps

1. **Add Redirect URLs** in Supabase Auth settings (see section 1 above)
2. **Test signup flow** on https://pumpajvideodl.com
3. **Verify email confirmation** works
4. **Check Table Editor** to see new user profile created

---

## 📝 Environment Variables

Already configured on Vercel:
```bash
NEXT_PUBLIC_SUPABASE_URL=https://fvbayulmttmcdeiybeot.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGc...
NEXT_PUBLIC_API_BASE=https://pumpaj-backend-production.up.railway.app
```

---

## 🆘 Troubleshooting

**Problem:** Auth not working
**Solution:** Verify redirect URLs are added in Auth settings

**Problem:** Can't see tables
**Solution:** Check SQL Editor for migration status

**Problem:** RLS blocking queries
**Solution:** Verify user is authenticated with valid JWT

---

## 📚 Documentation Links

- [Supabase Auth Docs](https://supabase.com/docs/guides/auth)
- [Row Level Security](https://supabase.com/docs/guides/auth/row-level-security)
- [Database Functions](https://supabase.com/docs/guides/database/functions)

