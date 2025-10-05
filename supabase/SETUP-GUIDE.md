# 🛠️ Supabase Database Setup - Step by Step

## ❌ Greška: `column "status" does not exist`

### Problem
PostgreSQL inline CHECK constraints ponekad ne rade sa `CREATE TABLE IF NOT EXISTS`.

### ✅ Rešenje
Pomeri CHECK constraints na kraj table definicije kao **named constraints**.

---

## 📋 Koraci za Setup

### Opcija 1: Fresh Start (Preporučeno)

1. **Otvori Supabase SQL Editor**:
   ```
   https://supabase.com/dashboard/project/smzxjnuqfvpzfzmyxpbp/sql/new
   ```

2. **Ako već imaš tabele sa greškama, prvo cleanup**:
   - Kopiraj sve iz `supabase/cleanup.sql`
   - Paste u SQL Editor
   - Klikni **RUN**
   - ⚠️ **WARNING**: Ovo briše sve postojeće podatke!

3. **Pokreni main setup**:
   - Kopiraj sve iz `supabase/auto-setup.sql` (fixed version)
   - Paste u SQL Editor
   - Klikni **RUN**

4. **Proveri rezultate**:
   ```sql
   -- Trebalo bi da vidiš 3 reda:
   -- profiles, download_history, user_settings
   ```

### Opcija 2: Manual Step-by-Step

Ako imaš problema sa full SQL, evo komandu po komandu:

#### Step 1: Extensions
```sql
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
```

#### Step 2: Profiles Table
```sql
CREATE TABLE public.profiles (
    id UUID REFERENCES auth.users(id) PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    full_name TEXT,
    avatar_url TEXT,
    role TEXT DEFAULT 'user',
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT role_check CHECK (role IN ('user', 'admin', 'moderator'))
);
```

#### Step 3: Download History Table
```sql
CREATE TABLE public.download_history (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    video_url TEXT NOT NULL,
    video_title TEXT,
    video_thumbnail TEXT,
    format_requested TEXT,
    quality_requested TEXT,
    file_size BIGINT,
    duration_seconds INTEGER,
    status TEXT DEFAULT 'pending',
    error_message TEXT,
    downloaded_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    metadata JSONB DEFAULT '{}'::jsonb,
    CONSTRAINT status_check CHECK (status IN ('pending', 'processing', 'completed', 'failed'))
);
```

#### Step 4: User Settings Table
```sql
CREATE TABLE public.user_settings (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE UNIQUE,
    preferred_quality TEXT DEFAULT '720p',
    preferred_format TEXT DEFAULT 'mp4',
    auto_download BOOLEAN DEFAULT false,
    notifications_enabled BOOLEAN DEFAULT true,
    theme TEXT DEFAULT 'system',
    language TEXT DEFAULT 'en',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT theme_check CHECK (theme IN ('light', 'dark', 'system'))
);
```

#### Step 5: Indexes
```sql
CREATE INDEX idx_download_history_user_id ON public.download_history(user_id);
CREATE INDEX idx_download_history_status ON public.download_history(status);
CREATE INDEX idx_download_history_downloaded_at ON public.download_history(downloaded_at DESC);
CREATE INDEX idx_profiles_email ON public.profiles(email);
```

#### Step 6: Enable RLS
```sql
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.download_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_settings ENABLE ROW LEVEL SECURITY;
```

#### Step 7: RLS Policies - Profiles
```sql
CREATE POLICY "Users can view own profile" 
    ON public.profiles FOR SELECT 
    USING (auth.uid() = id);

CREATE POLICY "Users can update own profile" 
    ON public.profiles FOR UPDATE 
    USING (auth.uid() = id);

CREATE POLICY "Admins can view all profiles" 
    ON public.profiles FOR SELECT 
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles 
            WHERE id = auth.uid() AND role = 'admin'
        )
    );
```

#### Step 8: RLS Policies - Download History
```sql
CREATE POLICY "Users can view own download history" 
    ON public.download_history FOR SELECT 
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own download history" 
    ON public.download_history FOR INSERT 
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own download history" 
    ON public.download_history FOR UPDATE 
    USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own download history" 
    ON public.download_history FOR DELETE 
    USING (auth.uid() = user_id);
```

#### Step 9: RLS Policies - User Settings
```sql
CREATE POLICY "Users can view own settings" 
    ON public.user_settings FOR SELECT 
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own settings" 
    ON public.user_settings FOR INSERT 
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own settings" 
    ON public.user_settings FOR UPDATE 
    USING (auth.uid() = user_id);
```

#### Step 10: Auto Profile Creation Trigger
```sql
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (id, email, full_name, avatar_url)
    VALUES (
        NEW.id,
        NEW.email,
        NEW.raw_user_meta_data->>'full_name',
        NEW.raw_user_meta_data->>'avatar_url'
    );
    
    INSERT INTO public.user_settings (user_id)
    VALUES (NEW.id);
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_new_user();
```

#### Step 11: Auto Update Timestamp Trigger
```sql
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_profiles_updated_at
    BEFORE UPDATE ON public.profiles
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_user_settings_updated_at
    BEFORE UPDATE ON public.user_settings
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();
```

---

## ✅ Verification

Proveri da li su tabele kreirane:

```sql
SELECT 
    tablename,
    schemaname
FROM pg_tables 
WHERE schemaname = 'public' 
AND tablename IN ('profiles', 'download_history', 'user_settings');
```

**Očekivani rezultat**:
```
tablename           | schemaname
--------------------|------------
profiles            | public
download_history    | public
user_settings       | public
```

---

## 🧪 Test

Nakon setup-a, testiraj sa:

```sql
-- Check profiles
SELECT * FROM public.profiles LIMIT 5;

-- Check triggers
SELECT trigger_name, event_object_table 
FROM information_schema.triggers 
WHERE trigger_schema = 'public';

-- Check RLS policies
SELECT schemaname, tablename, policyname 
FROM pg_policies 
WHERE schemaname = 'public';
```

---

## 🐛 Troubleshooting

### Greška: "relation already exists"
**Rešenje**: Pokreni `supabase/cleanup.sql` prvo

### Greška: "column does not exist" 
**Rešenje**: ✅ FIXED u novoj verziji `auto-setup.sql`

### Greška: "permission denied"
**Rešenje**: Koristi Supabase SQL Editor (ima admin prava)

### Greška: "constraint violation"
**Rešenje**: Proveri da li imaš postojeće podatke koji ne zadovoljavaju constraint

---

## 📝 Files

- `supabase/auto-setup.sql` - Main setup script (FIXED ✅)
- `supabase/cleanup.sql` - Clean existing tables
- `supabase/SETUP-GUIDE.md` - This file

---

**Last Updated**: October 5, 2025  
**Status**: ✅ Ready to use
