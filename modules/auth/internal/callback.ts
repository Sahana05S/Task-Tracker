// PRIVATE. The /auth/callback route handler.
import { NextResponse } from 'next/server';

import { exchangeCodeForSession, verifyRecoveryToken } from './commands';
import { DEFAULT_REDIRECT, safeRedirectPath } from './redirects';
import { RESET_PASSWORD_PATH } from './reset-view';

/**
 * Universal Authentication Callback Route
 *
 * Handles:
 * 1. Email verification confirmation links clicked from the user's inbox
 * 2. OAuth provider redirects (Google OAuth token exchange)
 * 3. Password-recovery links, forwarded by /reset-password as a `code` or,
 *    with a custom email template, a `token_hash` with `type=recovery`
 *
 * Exchanges the temporary authorization `code` for an authenticated session
 * and securely redirects the user to their target destination.
 */
export async function handleAuthCallback(request: Request): Promise<NextResponse> {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const tokenHash = searchParams.get('token_hash');
  const next = safeRedirectPath(searchParams.get('next') ?? DEFAULT_REDIRECT);

  const verified = code
    ? await exchangeCodeForSession(code)
    : tokenHash !== null && searchParams.get('type') === 'recovery'
      ? await verifyRecoveryToken(tokenHash)
      : false;

  if (verified) {
    return NextResponse.redirect(`${callbackOrigin(request, origin)}${next}`);
  }

  // A dead recovery link goes back to the reset page, which offers a new one.
  if (next === RESET_PASSWORD_PATH) {
    return NextResponse.redirect(`${origin}${RESET_PASSWORD_PATH}?error=link`);
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
