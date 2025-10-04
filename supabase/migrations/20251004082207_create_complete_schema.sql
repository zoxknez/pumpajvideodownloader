-- Pumpaj Video Downloader - Professional Database Schema
-- Designed for production use with scalability, security, and performance in mind

-- =====================================================
-- 1. AUTHENTICATION & USER MANAGEMENT
-- =====================================================

-- User profiles table (extends Supabase auth.users)
CREATE TABLE public.profiles (
    id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
    username TEXT UNIQUE,
    display_name TEXT,
    email TEXT,
    avatar_url TEXT,
    plan TEXT CHECK (plan IN ('FREE', 'PREMIUM', 'ENTERPRISE')) DEFAULT 'PREMIUM',
    plan_expires_at TIMESTAMPTZ,
    subscription_id TEXT, -- For Stripe/payment integration
    trial_ends_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '7 days'), -- 7-day trial
    settings JSONB DEFAULT '{}', -- User preferences
    last_login_at TIMESTAMPTZ,
    login_count INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- User sessions for detailed analytics
CREATE TABLE public.user_sessions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    session_token TEXT,
    ip_address INET,
    user_agent TEXT,
    country TEXT,
    city TEXT,
    device_type TEXT, -- 'desktop', 'mobile', 'tablet'
    created_at TIMESTAMPTZ DEFAULT NOW(),
    ended_at TIMESTAMPTZ
);

-- =====================================================
-- 2. DOWNLOAD MANAGEMENT
-- =====================================================

-- Download jobs with comprehensive tracking
CREATE TABLE public.download_jobs (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    url TEXT NOT NULL,
    title TEXT,
    platform TEXT, -- 'youtube', 'tiktok', 'instagram', etc.
    video_id TEXT, -- Platform-specific video ID
    thumbnail_url TEXT,
    duration INTEGER, -- in seconds
    
    -- Download configuration
    format TEXT DEFAULT 'best', -- 'best', 'audio', 'video_only', specific format
    quality TEXT, -- '1080p', '720p', '480p', 'best', etc.
    audio_quality TEXT, -- 'best', '320k', '256k', '128k'
    include_subtitles BOOLEAN DEFAULT FALSE,
    subtitle_language TEXT DEFAULT 'en',
    
    -- Job status and progress
    status TEXT CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'cancelled')) DEFAULT 'pending',
    progress INTEGER DEFAULT 0, -- 0-100
    download_speed TEXT, -- e.g., '1.2MB/s'
    eta_seconds INTEGER, -- estimated time to completion
    
    -- File information
    file_path TEXT,
    file_size BIGINT, -- in bytes
    file_format TEXT, -- actual downloaded format
    
    -- Error handling
    error_message TEXT,
    retry_count INTEGER DEFAULT 0,
    max_retries INTEGER DEFAULT 3,
    
    -- Performance metrics
    processing_time_ms INTEGER,
    download_time_ms INTEGER,
    server_instance TEXT, -- which server processed this
    
    -- Timestamps
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Download history for analytics
CREATE TABLE public.download_history (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    job_id UUID REFERENCES public.download_jobs(id) ON DELETE CASCADE,
    url TEXT NOT NULL,
    title TEXT,
    platform TEXT,
    format TEXT,
    quality TEXT,
    file_size BIGINT,
    success BOOLEAN,
    processing_time_ms INTEGER,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- 3. USAGE & ANALYTICS
-- =====================================================

-- User usage tracking per day
CREATE TABLE public.usage_stats (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    date DATE DEFAULT CURRENT_DATE,
    downloads_count INTEGER DEFAULT 0,
    total_file_size BIGINT DEFAULT 0,
    processing_time_ms BIGINT DEFAULT 0,
    unique_platforms TEXT[] DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    UNIQUE(user_id, date)
);

-- System-wide analytics
CREATE TABLE public.system_stats (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    date DATE DEFAULT CURRENT_DATE,
    total_users INTEGER DEFAULT 0,
    active_users INTEGER DEFAULT 0,
    new_users INTEGER DEFAULT 0,
    total_downloads INTEGER DEFAULT 0,
    successful_downloads INTEGER DEFAULT 0,
    failed_downloads INTEGER DEFAULT 0,
    total_file_size BIGINT DEFAULT 0,
    avg_processing_time_ms INTEGER DEFAULT 0,
    popular_platforms JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    
    UNIQUE(date)
);

-- =====================================================
-- 4. SUBSCRIPTIONS & BILLING
-- =====================================================

-- Subscription plans
CREATE TABLE public.subscription_plans (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    display_name TEXT NOT NULL,
    description TEXT,
    price_monthly DECIMAL(10,2),
    price_yearly DECIMAL(10,2),
    features JSONB DEFAULT '{}', -- List of features
    limits JSONB DEFAULT '{}', -- Usage limits
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- User subscriptions
CREATE TABLE public.user_subscriptions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    plan_id UUID REFERENCES public.subscription_plans(id),
    stripe_subscription_id TEXT UNIQUE,
    stripe_customer_id TEXT,
    status TEXT CHECK (status IN ('active', 'canceled', 'past_due', 'unpaid', 'trialing')) DEFAULT 'trialing',
    current_period_start TIMESTAMPTZ,
    current_period_end TIMESTAMPTZ,
    trial_end TIMESTAMPTZ,
    canceled_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Payment history
CREATE TABLE public.payments (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    subscription_id UUID REFERENCES public.user_subscriptions(id),
    stripe_payment_intent_id TEXT UNIQUE,
    amount DECIMAL(10,2),
    currency TEXT DEFAULT 'USD',
    status TEXT CHECK (status IN ('succeeded', 'pending', 'failed', 'canceled')),
    payment_method TEXT, -- 'card', 'paypal', etc.
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- 5. SECURITY & MONITORING
-- =====================================================

-- API rate limiting
CREATE TABLE public.rate_limits (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    endpoint TEXT NOT NULL,
    requests_count INTEGER DEFAULT 1,
    window_start TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    
    UNIQUE(user_id, endpoint, window_start)
);

-- Security events log
CREATE TABLE public.security_events (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    event_type TEXT NOT NULL, -- 'login_attempt', 'password_change', 'suspicious_activity', etc.
    ip_address INET,
    user_agent TEXT,
    success BOOLEAN,
    details JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- System errors and monitoring
CREATE TABLE public.error_logs (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    job_id UUID REFERENCES public.download_jobs(id) ON DELETE SET NULL,
    error_type TEXT NOT NULL,
    error_message TEXT,
    stack_trace TEXT,
    request_data JSONB,
    server_instance TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- 6. CONTENT & FEATURES
-- =====================================================

-- Supported platforms and their capabilities
CREATE TABLE public.supported_platforms (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    display_name TEXT NOT NULL,
    domain TEXT NOT NULL,
    supports_video BOOLEAN DEFAULT TRUE,
    supports_audio BOOLEAN DEFAULT TRUE,
    supports_subtitles BOOLEAN DEFAULT FALSE,
    max_quality TEXT DEFAULT '1080p',
    is_active BOOLEAN DEFAULT TRUE,
    rate_limit_per_hour INTEGER DEFAULT 100,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- User favorites/bookmarks
CREATE TABLE public.user_favorites (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    url TEXT NOT NULL,
    title TEXT,
    thumbnail_url TEXT,
    platform TEXT,
    tags TEXT[] DEFAULT '{}',
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    
    UNIQUE(user_id, url)
);

-- =====================================================
-- 7. INDEXES FOR PERFORMANCE
-- =====================================================

-- Profiles indexes
CREATE INDEX idx_profiles_username ON public.profiles(username);
CREATE INDEX idx_profiles_email ON public.profiles(email);
CREATE INDEX idx_profiles_plan ON public.profiles(plan);
CREATE INDEX idx_profiles_created_at ON public.profiles(created_at);

-- Download jobs indexes
CREATE INDEX idx_download_jobs_user_id ON public.download_jobs(user_id);
CREATE INDEX idx_download_jobs_status ON public.download_jobs(status);
CREATE INDEX idx_download_jobs_platform ON public.download_jobs(platform);
CREATE INDEX idx_download_jobs_created_at ON public.download_jobs(created_at);
CREATE INDEX idx_download_jobs_url_hash ON public.download_jobs USING hash(url);

-- Usage stats indexes
CREATE INDEX idx_usage_stats_user_date ON public.usage_stats(user_id, date);
CREATE INDEX idx_usage_stats_date ON public.usage_stats(date);

-- Security and monitoring indexes
CREATE INDEX idx_rate_limits_user_endpoint ON public.rate_limits(user_id, endpoint);
CREATE INDEX idx_rate_limits_window ON public.rate_limits(window_start);
CREATE INDEX idx_security_events_user_id ON public.security_events(user_id);
CREATE INDEX idx_security_events_type ON public.security_events(event_type);
CREATE INDEX idx_error_logs_created_at ON public.error_logs(created_at);

-- =====================================================
-- 8. ROW LEVEL SECURITY (RLS) POLICIES
-- =====================================================

-- Enable RLS on all tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.download_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.download_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.usage_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rate_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.security_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_favorites ENABLE ROW LEVEL SECURITY;

-- Profiles policies
CREATE POLICY "Users can view own profile" ON public.profiles
    FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update own profile" ON public.profiles
    FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Users can insert own profile" ON public.profiles
    FOR INSERT WITH CHECK (auth.uid() = id);

-- Download jobs policies
CREATE POLICY "Users can view own download jobs" ON public.download_jobs
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own download jobs" ON public.download_jobs
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own download jobs" ON public.download_jobs
    FOR UPDATE USING (auth.uid() = user_id);

-- Download history policies
CREATE POLICY "Users can view own download history" ON public.download_history
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "System can insert download history" ON public.download_history
    FOR INSERT WITH CHECK (true); -- Backend service inserts

-- Usage stats policies
CREATE POLICY "Users can view own usage stats" ON public.usage_stats
    FOR SELECT USING (auth.uid() = user_id);

-- User sessions policies
CREATE POLICY "Users can view own sessions" ON public.user_sessions
    FOR SELECT USING (auth.uid() = user_id);

-- Subscriptions policies
CREATE POLICY "Users can view own subscriptions" ON public.user_subscriptions
    FOR SELECT USING (auth.uid() = user_id);

-- Payments policies
CREATE POLICY "Users can view own payments" ON public.payments
    FOR SELECT USING (auth.uid() = user_id);

-- Rate limits policies
CREATE POLICY "Users can view own rate limits" ON public.rate_limits
    FOR SELECT USING (auth.uid() = user_id);

-- Favorites policies
CREATE POLICY "Users can manage own favorites" ON public.user_favorites
    FOR ALL USING (auth.uid() = user_id);

-- Public read access for system tables
CREATE POLICY "Public read access" ON public.subscription_plans
    FOR SELECT USING (is_active = true);

CREATE POLICY "Public read access" ON public.supported_platforms
    FOR SELECT USING (is_active = true);

CREATE POLICY "Public read access" ON public.system_stats
    FOR SELECT USING (true);

-- =====================================================
-- 9. FUNCTIONS & TRIGGERS
-- =====================================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply updated_at trigger to relevant tables
CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_download_jobs_updated_at BEFORE UPDATE ON public.download_jobs
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_usage_stats_updated_at BEFORE UPDATE ON public.usage_stats
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_subscription_plans_updated_at BEFORE UPDATE ON public.subscription_plans
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_user_subscriptions_updated_at BEFORE UPDATE ON public.user_subscriptions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_supported_platforms_updated_at BEFORE UPDATE ON public.supported_platforms
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Function to handle new user registration
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (id, email, username, display_name)
    VALUES (
        NEW.id,
        NEW.email,
        COALESCE(NEW.raw_user_meta_data->>'username', NULL),
        COALESCE(NEW.raw_user_meta_data->>'display_name', NEW.raw_user_meta_data->>'username', NULL)
    );
    RETURN NEW;
END;
$$ language 'plpgsql' SECURITY DEFINER;

-- Trigger for new user registration
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Function to update user stats on download completion
CREATE OR REPLACE FUNCTION public.update_user_stats()
RETURNS TRIGGER AS $$
BEGIN
    -- Only update when job is completed successfully
    IF NEW.status = 'completed' AND OLD.status != 'completed' THEN
        INSERT INTO public.usage_stats (user_id, date, downloads_count, total_file_size, processing_time_ms)
        VALUES (NEW.user_id, CURRENT_DATE, 1, COALESCE(NEW.file_size, 0), COALESCE(NEW.processing_time_ms, 0))
        ON CONFLICT (user_id, date) 
        DO UPDATE SET
            downloads_count = public.usage_stats.downloads_count + 1,
            total_file_size = public.usage_stats.total_file_size + COALESCE(NEW.file_size, 0),
            processing_time_ms = public.usage_stats.processing_time_ms + COALESCE(NEW.processing_time_ms, 0),
            updated_at = NOW();
            
        -- Also insert into download history
        INSERT INTO public.download_history (
            user_id, job_id, url, title, platform, format, quality, 
            file_size, success, processing_time_ms
        ) VALUES (
            NEW.user_id, NEW.id, NEW.url, NEW.title, NEW.platform, 
            NEW.format, NEW.quality, NEW.file_size, true, NEW.processing_time_ms
        );
    END IF;
    
    RETURN NEW;
END;
$$ language 'plpgsql' SECURITY DEFINER;

-- Trigger for download completion
CREATE TRIGGER on_download_completed
    AFTER UPDATE ON public.download_jobs
    FOR EACH ROW EXECUTE FUNCTION public.update_user_stats();

-- =====================================================
-- 10. INITIAL DATA
-- =====================================================

-- Insert default subscription plans
INSERT INTO public.subscription_plans (name, display_name, description, price_monthly, price_yearly, features, limits) VALUES
('free', 'Free Plan', 'Basic video downloading with limitations', 0.00, 0.00, 
 '["Basic video downloads", "480p max quality", "Community support"]'::jsonb,
 '{"max_downloads_per_day": 10, "max_quality": "480p", "concurrent_downloads": 1}'::jsonb),
 
('premium', 'Premium Plan', 'Unlimited downloads with high quality', 9.99, 99.99,
 '["Unlimited downloads", "4K max quality", "Audio extraction", "Subtitle downloads", "Priority support", "No ads"]'::jsonb,
 '{"max_downloads_per_day": -1, "max_quality": "4k", "concurrent_downloads": 5}'::jsonb),
 
('enterprise', 'Enterprise Plan', 'For businesses and power users', 29.99, 299.99,
 '["Everything in Premium", "API access", "Bulk downloads", "Custom integrations", "Dedicated support", "Analytics dashboard"]'::jsonb,
 '{"max_downloads_per_day": -1, "max_quality": "8k", "concurrent_downloads": 20, "api_access": true}'::jsonb);

-- Insert supported platforms
INSERT INTO public.supported_platforms (name, display_name, domain, supports_video, supports_audio, supports_subtitles, max_quality) VALUES
('youtube', 'YouTube', 'youtube.com', true, true, true, '4k'),
('tiktok', 'TikTok', 'tiktok.com', true, true, false, '1080p'),
('instagram', 'Instagram', 'instagram.com', true, true, false, '1080p'),
('twitter', 'Twitter/X', 'twitter.com', true, true, false, '1080p'),
('facebook', 'Facebook', 'facebook.com', true, true, false, '1080p'),
('vimeo', 'Vimeo', 'vimeo.com', true, true, true, '4k'),
('twitch', 'Twitch', 'twitch.tv', true, true, false, '1080p');

-- =====================================================
-- 11. VIEWS FOR COMMON QUERIES
-- =====================================================

-- User dashboard view
CREATE VIEW public.user_dashboard AS
SELECT 
    p.id,
    p.username,
    p.display_name,
    p.plan,
    p.trial_ends_at,
    COALESCE(us.downloads_count, 0) as downloads_today,
    COALESCE(total_downloads.count, 0) as total_downloads,
    COALESCE(total_downloads.total_size, 0) as total_file_size
FROM public.profiles p
LEFT JOIN public.usage_stats us ON p.id = us.user_id AND us.date = CURRENT_DATE
LEFT JOIN (
    SELECT 
        user_id, 
        COUNT(*) as count,
        SUM(file_size) as total_size
    FROM public.download_history 
    WHERE success = true 
    GROUP BY user_id
) total_downloads ON p.id = total_downloads.user_id;

-- Recent downloads view
CREATE VIEW public.recent_downloads AS
SELECT 
    dj.id,
    dj.user_id,
    dj.url,
    dj.title,
    dj.platform,
    dj.format,
    dj.quality,
    dj.status,
    dj.progress,
    dj.file_size,
    dj.created_at,
    dj.completed_at,
    p.username
FROM public.download_jobs dj
JOIN public.profiles p ON dj.user_id = p.id
ORDER BY dj.created_at DESC;

-- Admin analytics view
CREATE VIEW public.admin_analytics AS
SELECT 
    DATE_TRUNC('day', created_at) as date,
    COUNT(*) as total_downloads,
    COUNT(*) FILTER (WHERE status = 'completed') as successful_downloads,
    COUNT(*) FILTER (WHERE status = 'failed') as failed_downloads,
    AVG(processing_time_ms) as avg_processing_time,
    SUM(file_size) FILTER (WHERE status = 'completed') as total_data_transferred
FROM public.download_jobs
GROUP BY DATE_TRUNC('day', created_at)
ORDER BY date DESC;