-- =====================================================
-- ČIŠĆENJE POSTOJEĆIH TABELA (ako treba)
-- Ovo pokreni SAMO AKO imaš greške sa postojećim tabelama
-- =====================================================

-- Drop existing policies
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Users can view own download history" ON public.download_history;
DROP POLICY IF EXISTS "Users can insert own download history" ON public.download_history;
DROP POLICY IF EXISTS "Users can update own download history" ON public.download_history;
DROP POLICY IF EXISTS "Users can delete own download history" ON public.download_history;
DROP POLICY IF EXISTS "Users can view own settings" ON public.user_settings;
DROP POLICY IF EXISTS "Users can insert own settings" ON public.user_settings;
DROP POLICY IF EXISTS "Users can update own settings" ON public.user_settings;

-- Drop existing triggers
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP TRIGGER IF EXISTS update_profiles_updated_at ON public.profiles;
DROP TRIGGER IF EXISTS update_user_settings_updated_at ON public.user_settings;

-- Drop existing functions
DROP FUNCTION IF EXISTS public.handle_new_user() CASCADE;
DROP FUNCTION IF EXISTS public.update_updated_at_column() CASCADE;

-- Drop existing tables (CAREFUL - ovo briše sve podatke!)
DROP TABLE IF EXISTS public.user_settings CASCADE;
DROP TABLE IF EXISTS public.download_history CASCADE;
DROP TABLE IF EXISTS public.profiles CASCADE;

-- =====================================================
-- SPREMNO za pokretanje auto-setup.sql
-- =====================================================
