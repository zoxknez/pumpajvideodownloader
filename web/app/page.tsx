"use client";
import { useEffect, useState } from 'react';
import NextDynamic from 'next/dynamic';
import { getSupabase } from '@/lib/supabaseClient';
import type { Session } from '@supabase/supabase-js';
import { useRouter } from 'next/navigation';

const DownloaderDemo = NextDynamic(() => import('@/components/DownloaderDemo'), { ssr: false });

export default function Home() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const nextParam = '/';

  useEffect(() => {
    const supabase = getSupabase();
    supabase.auth.getSession().then(({ data }) => {
      const sess = data.session;
      setSession(sess || null);
      setLoading(false);
      if (!sess) {
        router.replace(`/login?next=${encodeURIComponent(nextParam)}`);
      }
    });
    const { data: subscription } = supabase.auth.onAuthStateChange((_event, sess) => {
      setSession(sess || null);
      if (!sess) {
        router.replace(`/login?next=${encodeURIComponent(nextParam)}`);
      }
    });
    return () => subscription.subscription.unsubscribe();
  }, [router]);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center text-sm text-gray-500">
        Učitavanje…
      </div>
    );
  }

  if (!session) {
    return (
      <div className="flex h-screen items-center justify-center text-sm text-gray-500">
        Preusmeravanje na prijavu…
      </div>
    );
  }

  return <DownloaderDemo />;
}
