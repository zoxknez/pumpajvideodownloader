-- =====================================================
-- AUTOMATSKA INICIJALIZACIJA SUPABASE BAZE
-- Projekat: smzxjnuqfvpzfzmyxpbp
-- =====================================================

-- 1. ENABLE EXTENSIONS
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 2. CREATE PROFILES TABLE
DO $$ 
BEGIN
    CREATE TABLE IF NOT EXISTS public.profiles (
        id UUID REFERENCES auth.users(id) PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        full_name TEXT,
        avatar_url TEXT,
        role TEXT DEFAULT 'user',
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    );
EXCEPTION
    WHEN duplicate_table THEN
        NULL;
END $$;

-- Add missing columns if they don't exist
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_schema = 'public' 
                   AND table_name = 'profiles' 
                   AND column_name = 'role') THEN
        ALTER TABLE public.profiles ADD COLUMN role TEXT DEFAULT 'user';
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_schema = 'public' 
                   AND table_name = 'profiles' 
                   AND column_name = 'is_active') THEN
        ALTER TABLE public.profiles ADD COLUMN is_active BOOLEAN DEFAULT true;
    END IF;
END $$;

-- Add constraint separately (won't fail if already exists)
DO $$ 
BEGIN
    ALTER TABLE public.profiles 
    ADD CONSTRAINT role_check CHECK (role IN ('user', 'admin', 'moderator'));
EXCEPTION
    WHEN duplicate_object THEN
        NULL;
END $$;

-- 3. CREATE DOWNLOAD_HISTORY TABLE
DO $$ 
BEGIN
    CREATE TABLE IF NOT EXISTS public.download_history (
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
        metadata JSONB DEFAULT '{}'::jsonb
    );
EXCEPTION
    WHEN duplicate_table THEN
        NULL;
END $$;

-- Add missing columns if they don't exist
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_schema = 'public' 
                   AND table_name = 'download_history' 
                   AND column_name = 'status') THEN
        ALTER TABLE public.download_history ADD COLUMN status TEXT DEFAULT 'pending';
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_schema = 'public' 
                   AND table_name = 'download_history' 
                   AND column_name = 'downloaded_at') THEN
        ALTER TABLE public.download_history ADD COLUMN downloaded_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_schema = 'public' 
                   AND table_name = 'download_history' 
                   AND column_name = 'metadata') THEN
        ALTER TABLE public.download_history ADD COLUMN metadata JSONB DEFAULT '{}'::jsonb;
    END IF;
END $$;

-- Add constraint separately (won't fail if already exists)
DO $$ 
BEGIN
    ALTER TABLE public.download_history 
    ADD CONSTRAINT status_check CHECK (status IN ('pending', 'processing', 'completed', 'failed'));
EXCEPTION
    WHEN duplicate_object THEN
        NULL;
END $$;

-- 4. CREATE USER_SETTINGS TABLE
DO $$ 
BEGIN
    CREATE TABLE IF NOT EXISTS public.user_settings (
        id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
        user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE UNIQUE,
        preferred_quality TEXT DEFAULT '720p',
        preferred_format TEXT DEFAULT 'mp4',
        auto_download BOOLEAN DEFAULT false,
        notifications_enabled BOOLEAN DEFAULT true,
        theme TEXT DEFAULT 'system',
        language TEXT DEFAULT 'en',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    );
EXCEPTION
    WHEN duplicate_table THEN
        NULL;
END $$;

-- Add missing columns if they don't exist
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_schema = 'public' 
                   AND table_name = 'user_settings' 
                   AND column_name = 'theme') THEN
        ALTER TABLE public.user_settings ADD COLUMN theme TEXT DEFAULT 'system';
    END IF;
END $$;

-- Add constraint separately (won't fail if already exists)
DO $$ 
BEGIN
    ALTER TABLE public.user_settings 
    ADD CONSTRAINT theme_check CHECK (theme IN ('light', 'dark', 'system'));
EXCEPTION
    WHEN duplicate_object THEN
        NULL;
END $$;

-- 5. CREATE INDEXES
CREATE INDEX IF NOT EXISTS idx_download_history_user_id ON public.download_history(user_id);
CREATE INDEX IF NOT EXISTS idx_download_history_status ON public.download_history(status);
CREATE INDEX IF NOT EXISTS idx_download_history_downloaded_at ON public.download_history(downloaded_at DESC);
CREATE INDEX IF NOT EXISTS idx_profiles_email ON public.profiles(email);

-- 6. ENABLE RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.download_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_settings ENABLE ROW LEVEL SECURITY;

-- 7. CREATE RLS POLICIES - PROFILES
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

-- 8. CREATE RLS POLICIES - DOWNLOAD_HISTORY
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

-- 9. CREATE RLS POLICIES - USER_SETTINGS
CREATE POLICY "Users can view own settings" 
    ON public.user_settings FOR SELECT 
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own settings" 
    ON public.user_settings FOR INSERT 
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own settings" 
    ON public.user_settings FOR UPDATE 
    USING (auth.uid() = user_id);

-- 10. CREATE TRIGGERS - AUTO PROFILE CREATION
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

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_new_user();

-- 11. CREATE TRIGGERS - AUTO UPDATE TIMESTAMP
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_profiles_updated_at ON public.profiles;
CREATE TRIGGER update_profiles_updated_at
    BEFORE UPDATE ON public.profiles
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_user_settings_updated_at ON public.user_settings;
CREATE TRIGGER update_user_settings_updated_at
    BEFORE UPDATE ON public.user_settings
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

-- =====================================================
-- GOTOVO! Baza je spremna za upotrebu! 🚀
-- =====================================================

-- Provera da li su tabele kreirane:
SELECT 
    tablename,
    schemaname
FROM pg_tables 
WHERE schemaname = 'public' 
AND tablename IN ('profiles', 'download_history', 'user_settings');
