import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get('code');
  const error = requestUrl.searchParams.get('error');
  const errorDescription = requestUrl.searchParams.get('error_description');

  // Handle OAuth errors
  if (error) {
    console.error('OAuth error:', error, errorDescription);
    return NextResponse.redirect(
      new URL(`/?error=${encodeURIComponent(errorDescription || error)}`, requestUrl.origin)
    );
  }

  // Exchange code for session
  if (code) {
    try {
      const cookieStore = await cookies();
      const response = NextResponse.redirect(new URL('/?auth=success', requestUrl.origin));
      
      const supabase = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
          cookies: {
            getAll() {
              return cookieStore.getAll();
            },
            setAll(cookiesToSet) {
              try {
                cookiesToSet.forEach(({ name, value, options }) => {
                  // Set cookies on the response object
                  response.cookies.set(name, value, {
                    ...options,
                    httpOnly: true,
                    secure: process.env.NODE_ENV === 'production',
                    sameSite: 'lax',
                    path: '/',
                  });
                });
              } catch (error) {
                console.error('Error setting cookies:', error);
              }
            },
          },
        }
      );

      const { data, error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);

      if (exchangeError) {
        console.error('❌ Code exchange error:', exchangeError);
        return NextResponse.redirect(
          new URL(`/?error=${encodeURIComponent(exchangeError.message)}`, requestUrl.origin)
        );
      }

      if (data.session) {
        console.log('✅ OAuth successful! Session created for:', data.session.user.email);
        console.log('✅ Access token:', data.session.access_token.substring(0, 20) + '...');
      }

      // Return response with cookies set
      return response;
    } catch (err) {
      console.error('❌ Auth callback error:', err);
      return NextResponse.redirect(
        new URL(`/?error=authentication_failed`, requestUrl.origin)
      );
    }
  }

  // No code provided - redirect to home
  return NextResponse.redirect(new URL('/', requestUrl.origin));
}
