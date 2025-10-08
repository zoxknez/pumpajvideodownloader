"use client";
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database.types';

let client: SupabaseClient<Database> | null = null;

export function isSupabaseConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}

export function getSupabase(): SupabaseClient<Database> | null {
  if (!isSupabaseConfigured()) return null;
  if (client) return client;
  if (typeof window === 'undefined') return null;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  client = createClient(url, anon, { auth: { persistSession: true, autoRefreshToken: true } });
  return client;
}
