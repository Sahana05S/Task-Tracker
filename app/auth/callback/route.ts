import { NextResponse } from 'next/server';

import { DEFAULT_REDIRECT, safeRedirectPath } from '@/lib/auth/redirects';
import { createClient } from '@/lib/supabase/server';

/**
 * Universal Authentication Callback Route
 *
 * Handles:
 * 1. Email verification confirmation links clicked from the user's inbox
 * 2. OAuth provider redirects (Google OAuth token exchange)
 *
 * Exchanges the temporary authorization `code` for an authenticated session
 * and securely redirects the user to their target destination.
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const next = safeRedirectPath(searchParams.get('next') ?? DEFAULT_REDIRECT);

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      const forwardedHost = request.headers.get('x-forwarded-host');
      const isLocalEnv = process.env.NODE_ENV === 'development';

      if (isLocalEnv) {
        return NextResponse.redirect(`${origin}${next}`);
      } else if (forwardedHost) {
        return NextResponse.redirect(`https://${forwardedHost}${next}`);
      } else {
        return NextResponse.redirect(`${origin}${next}`);
      }
    }
  }

  // If code exchange failed or was not provided, redirect back to login with notice
  return NextResponse.redirect(
    `${origin}/login?error=Authentication%20verification%20failed.%20Please%20try%20signing%20in%20again.`,
  );
}
