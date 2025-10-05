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
                  cookieStore.set(name, value, options);
                });
              } catch (error) {
                // Handle cookies in Server Components
                console.error('Error setting cookies:', error);
              }
            },
          },
        }
      );

      const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);

      if (exchangeError) {
        console.error('Code exchange error:', exchangeError);
        return NextResponse.redirect(
          new URL(`/?error=${encodeURIComponent(exchangeError.message)}`, requestUrl.origin)
        );
      }

      // Successful authentication - redirect to home with success flag
      console.log('✅ OAuth successful, redirecting to home');
      return NextResponse.redirect(new URL('/?auth=success', requestUrl.origin));
    } catch (err) {
      console.error('Auth callback error:', err);
      return NextResponse.redirect(
        new URL(`/?error=authentication_failed`, requestUrl.origin)
      );
    }
  }

  // No code provided - redirect to home
  return NextResponse.redirect(new URL('/', requestUrl.origin));
}
