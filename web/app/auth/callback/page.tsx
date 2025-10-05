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

        // Parse tokens from URL hash
        const hashParams = new URLSearchParams(window.location.hash.substring(1));
        const access_token = hashParams.get('access_token');
        const refresh_token = hashParams.get('refresh_token');
        const error = hashParams.get('error');
        const error_description = hashParams.get('error_description');

        console.log('🔍 Access token found:', access_token ? 'YES' : 'NO');
        console.log('🔍 Refresh token found:', refresh_token ? 'YES' : 'NO');

        if (error) {
          console.error('❌ OAuth error:', error, error_description);
          setStatus(`❌ ${error_description || error}`);
          setTimeout(() => router.push(`/?error=${encodeURIComponent(error_description || error)}`), 2000);
          return;
        }

        if (access_token && refresh_token) {
          console.log('🔄 Setting session with tokens...');
          
          // Set the session manually with the tokens from URL
          const { data, error: setError } = await supabase.auth.setSession({
            access_token,
            refresh_token,
          });

          if (setError) {
            console.error('❌ Set session error:', setError);
            setStatus(`❌ ${setError.message}`);
            setTimeout(() => router.push(`/?error=${encodeURIComponent(setError.message)}`), 2000);
            return;
          }

          if (data.session) {
            console.log('✅ Session set successfully:', data.session.user.email);
            setStatus(`✅ Logged in as ${data.session.user.email}`);
            
            // Give time for session to propagate to AuthProvider
            setTimeout(() => {
              console.log('🔄 Redirecting to home...');
              router.push('/?auth=success');
            }, 1000);
            return;
          }
        }

        // No tokens in URL - check if we already have a session
        const { data: sessionData } = await supabase.auth.getSession();
        if (sessionData.session) {
          console.log('✅ Already have session:', sessionData.session.user.email);
          setStatus(`✅ Already logged in as ${sessionData.session.user.email}`);
          setTimeout(() => router.push('/'), 1000);
          return;
        }

        // No tokens and no session
        console.log('⚠️ No authentication data found');
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
