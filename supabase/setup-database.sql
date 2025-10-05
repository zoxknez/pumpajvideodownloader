-- ============================================================
-- Supabase Database Setup for Pumpaj Video Downloader
-- ============================================================

-- 1. Enable necessary extensions
create extension if not exists "uuid-ossp";

-- 2. Create profiles table (extends auth.users)
create table if not exists public.profiles (
  id uuid references auth.users on delete cascade primary key,
  email text unique not null,
  full_name text,
  avatar_url text,
  role text default 'user' check (role in ('user', 'admin')),
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 3. Create download_history table
create table if not exists public.download_history (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references auth.users on delete cascade not null,
  url text not null,
  title text,
  format text,
  quality text,
  file_size bigint,
  duration integer,
  thumbnail_url text,
  status text default 'pending' check (status in ('pending', 'processing', 'completed', 'failed')),
  error_message text,
  downloaded_at timestamp with time zone default timezone('utc'::text, now()) not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 4. Create user_settings table
create table if not exists public.user_settings (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references auth.users on delete cascade unique not null,
  preferred_quality text default '720p',
  preferred_format text default 'mp4',
  auto_download boolean default false,
  theme text default 'light' check (theme in ('light', 'dark', 'system')),
  language text default 'en',
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 5. Enable Row Level Security (RLS)
alter table public.profiles enable row level security;
alter table public.download_history enable row level security;
alter table public.user_settings enable row level security;

-- 6. Create RLS Policies for profiles
create policy "Public profiles are viewable by everyone"
  on public.profiles for select
  using ( true );

create policy "Users can insert their own profile"
  on public.profiles for insert
  with check ( auth.uid() = id );

create policy "Users can update own profile"
  on public.profiles for update
  using ( auth.uid() = id );

-- 7. Create RLS Policies for download_history
create policy "Users can view own download history"
  on public.download_history for select
  using ( auth.uid() = user_id );

create policy "Users can insert own download history"
  on public.download_history for insert
  with check ( auth.uid() = user_id );

create policy "Users can update own download history"
  on public.download_history for update
  using ( auth.uid() = user_id );

create policy "Users can delete own download history"
  on public.download_history for delete
  using ( auth.uid() = user_id );

-- 8. Create RLS Policies for user_settings
create policy "Users can view own settings"
  on public.user_settings for select
  using ( auth.uid() = user_id );

create policy "Users can insert own settings"
  on public.user_settings for insert
  with check ( auth.uid() = user_id );

create policy "Users can update own settings"
  on public.user_settings for update
  using ( auth.uid() = user_id );

-- 9. Create function to handle new user signup
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, full_name, avatar_url)
  values (
    new.id,
    new.email,
    new.raw_user_meta_data->>'full_name',
    new.raw_user_meta_data->>'avatar_url'
  );
  
  insert into public.user_settings (user_id)
  values (new.id);
  
  return new;
end;
$$ language plpgsql security definer;

-- 10. Create trigger for new user signup
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- 11. Create function to update updated_at timestamp
create or replace function public.handle_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- 12. Create triggers for updated_at
drop trigger if exists on_profiles_updated on public.profiles;
create trigger on_profiles_updated
  before update on public.profiles
  for each row execute procedure public.handle_updated_at();

drop trigger if exists on_user_settings_updated on public.user_settings;
create trigger on_user_settings_updated
  before update on public.user_settings
  for each row execute procedure public.handle_updated_at();

-- 13. Create indexes for performance
create index if not exists idx_download_history_user_id on public.download_history(user_id);
create index if not exists idx_download_history_created_at on public.download_history(created_at desc);
create index if not exists idx_download_history_status on public.download_history(status);
create index if not exists idx_profiles_email on public.profiles(email);

-- 14. Grant permissions
grant usage on schema public to anon, authenticated;
grant all on public.profiles to anon, authenticated;
grant all on public.download_history to anon, authenticated;
grant all on public.user_settings to anon, authenticated;

-- ============================================================
-- Setup Complete!
-- ============================================================
