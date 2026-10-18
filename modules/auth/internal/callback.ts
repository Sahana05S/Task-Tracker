// PRIVATE. The /auth/callback route handler.
import { NextResponse } from 'next/server';

import { exchangeCodeForSession } from './commands';
import { DEFAULT_REDIRECT, safeRedirectPath } from './redirects';

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
export async function handleAuthCallback(request: Request): Promise<NextResponse> {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const next = safeRedirectPath(searchParams.get('next') ?? DEFAULT_REDIRECT);

  if (code && (await exchangeCodeForSession(code))) {
    return NextResponse.redirect(`${callbackOrigin(request, origin)}${next}`);
  }

  // If code exchange failed or was not provided, redirect back to login with notice
  return NextResponse.redirect(
    `${origin}/login?error=Authentication%20verification%20failed.%20Please%20try%20signing%20in%20again.`,
  );
}

/** Behind a proxy outside development, the forwarded host is the public one. */
function callbackOrigin(request: Request, origin: string): string {
  const forwardedHost = request.headers.get('x-forwarded-host');
  const isLocalEnv = process.env.NODE_ENV === 'development';

  if (!isLocalEnv && forwardedHost) return `https://${forwardedHost}`;
  return origin;
}
