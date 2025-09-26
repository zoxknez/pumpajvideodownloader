"use client";
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (client) return client;
  if (typeof window === 'undefined') {
    // Avoid creating the client during SSR/SSG build steps
    throw new Error('Supabase client is only available in the browser');
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY');
  }
  client = createClient(url, anon, { auth: { persistSession: true, autoRefreshToken: true } });
  return client;
}
