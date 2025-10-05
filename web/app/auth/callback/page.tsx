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
        // Get the code from URL hash or query params
        const hashParams = new URLSearchParams(window.location.hash.substring(1));
        const queryParams = new URLSearchParams(window.location.search);
        
        const code = hashParams.get('code') || queryParams.get('code');
        const error = hashParams.get('error') || queryParams.get('error');
        const errorDescription = hashParams.get('error_description') || queryParams.get('error_description');

        if (error) {
          console.error('❌ OAuth error:', error, errorDescription);
          setStatus(`❌ Error: ${errorDescription || error}`);
          setTimeout(() => router.push(`/?error=${encodeURIComponent(errorDescription || error)}`), 2000);
          return;
        }

        if (code) {
          console.log('🔄 Exchanging code for session...');
          setStatus('🔄 Exchanging code for session...');

          const { data, error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);

          if (exchangeError) {
            console.error('❌ Code exchange error:', exchangeError);
            setStatus(`❌ ${exchangeError.message}`);
            setTimeout(() => router.push(`/?error=${encodeURIComponent(exchangeError.message)}`), 2000);
            return;
          }

          if (data.session) {
            console.log('✅ Session created for:', data.session.user.email);
            console.log('✅ Access token:', data.session.access_token.substring(0, 20) + '...');
            setStatus(`✅ Logged in as ${data.session.user.email}`);
            
            // Give time for session to propagate
            setTimeout(() => {
              console.log('🔄 Redirecting to home...');
              router.push('/?auth=success');
            }, 1000);
            return;
          }
        }

        // Check if we already have a session (direct navigation)
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
          console.log('✅ Already have session:', session.user.email);
          setStatus(`✅ Already logged in as ${session.user.email}`);
          setTimeout(() => router.push('/'), 1000);
          return;
        }

        // No code and no session
        console.log('⚠️ No code or session found, redirecting...');
        setStatus('⚠️ No authentication data found');
        setTimeout(() => router.push('/'), 2000);

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
