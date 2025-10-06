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
        setStatus('🔄 Processing authentication...');

        // Parse tokens from URL hash
        const hashParams = new URLSearchParams(window.location.hash.substring(1));
        const access_token = hashParams.get('access_token');
        const refresh_token = hashParams.get('refresh_token');
        const error = hashParams.get('error');
        const error_description = hashParams.get('error_description');

        if (error) {
          setStatus(`❌ ${error_description || error}`);
          setTimeout(() => router.push(`/?error=${encodeURIComponent(error_description || error)}`), 2000);
          return;
        }

        if (access_token && refresh_token) {
          // Set the session manually with the tokens from URL
          const { data, error: setError } = await supabase.auth.setSession({
            access_token,
            refresh_token,
          });

          if (setError) {
            setStatus(`❌ ${setError.message}`);
            setTimeout(() => router.push(`/?error=${encodeURIComponent(setError.message)}`), 2000);
            return;
          }

          if (data.session) {
            setStatus(`✅ Logged in as ${data.session.user.email}`);
            
            // Give time for session to propagate to AuthProvider
            setTimeout(() => {
              router.push('/?auth=success');
            }, 1000);
            return;
          }
        }

        // No tokens in URL - check if we already have a session
        const { data: sessionData } = await supabase.auth.getSession();
        if (sessionData.session) {
          setStatus(`✅ Already logged in as ${sessionData.session.user.email}`);
          setTimeout(() => router.push('/'), 1000);
          return;
        }

        // No tokens and no session
        setStatus('⚠️ No authentication data found');
        setTimeout(() => router.push('/'), 2000);

      } catch (err: any) {
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
