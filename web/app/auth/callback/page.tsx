'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getSupabase } from '../../../lib/supabaseClient';

export default function AuthCallback() {
  const router = useRouter();
  const [status, setStatus] = useState('Processing...');

  useEffect(() => {
    const handleCallback = async () => {
      const supabase = getSupabase();
      if (!supabase) {
        setStatus('❌ Supabase not configured');
        setTimeout(() => router.push('/?error=supabase_not_configured'), 2000);
        return;
      }

      try {
        console.log('🔍 OAuth callback started');
        console.log('🔍 Full URL:', window.location.href);
        
        setStatus('🔄 Processing authentication...');

        // Let Supabase handle the OAuth callback automatically
        // It will parse the URL hash/query and set the session
        const { data, error } = await supabase.auth.getSession();

        if (error) {
          console.error('❌ Session error:', error);
          setStatus(`❌ ${error.message}`);
          setTimeout(() => router.push(`/?error=${encodeURIComponent(error.message)}`), 2000);
          return;
        }

        if (data.session) {
          console.log('✅ Session found:', data.session.user.email);
          setStatus(`✅ Logged in as ${data.session.user.email}`);
          
          // Give time for session to propagate to AuthProvider
          setTimeout(() => {
            console.log('🔄 Redirecting to home...');
            router.push('/?auth=success');
          }, 1500);
          return;
        }

        // No session yet - this might be normal, the auth state change will trigger
        console.log('⏳ Waiting for session...');
        setStatus('⏳ Completing authentication...');
        
        // Wait a bit and check again
        setTimeout(async () => {
          const { data: sessionData } = await supabase.auth.getSession();
          if (sessionData.session) {
            console.log('✅ Session created:', sessionData.session.user.email);
            setStatus(`✅ Logged in as ${sessionData.session.user.email}`);
            setTimeout(() => router.push('/?auth=success'), 500);
          } else {
            console.log('⚠️ No session created, redirecting...');
            setStatus('⚠️ Authentication incomplete');
            setTimeout(() => router.push('/'), 1500);
          }
        }, 2000);

      } catch (err: any) {
        console.error('❌ Auth callback error:', err);
        setStatus(`❌ ${err.message || 'Authentication failed'}`);
        setTimeout(() => router.push('/?error=authentication_failed'), 2000);
      }
    };

    handleCallback();
  }, [router]);

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '20px'
    }}>
      <div style={{
        background: 'white',
        borderRadius: '16px',
        padding: '40px',
        maxWidth: '500px',
        textAlign: 'center',
        boxShadow: '0 20px 60px rgba(0,0,0,0.3)'
      }}>
        <h1 style={{ color: '#667eea', marginBottom: '20px', fontSize: '32px' }}>
          🔐 Authentication
        </h1>
        <p style={{ fontSize: '18px', color: '#666' }}>
          {status}
        </p>
        <div style={{
          marginTop: '30px',
          fontSize: '14px',
          color: '#999'
        }}>
          Please wait...
        </div>
      </div>
    </div>
  );
}
