// PRIVATE. The /auth/callback route handler.
import { NextResponse } from 'next/server';

import { exchangeCodeForSession, verifyEmailToken } from './commands';
import { DEFAULT_REDIRECT, safeRedirectPath } from './redirects';
import { RESET_PASSWORD_PATH } from './reset-view';
import { publicOrigin } from '@/shared/security/origin';

/**
 * Universal Authentication Callback Route
 *
 * Handles:
 * 1. Email verification confirmation links clicked from the user's inbox
 * 2. Password-recovery links, forwarded by /reset-password as a `code` or a
 *    `token_hash` with `type=recovery`; sign-up confirmations as a
 *    `token_hash` with `type=signup` or `type=email`
 *
 * Exchanges the temporary authorization `code` for an authenticated session
 * and securely redirects the user to their target destination.
 */
export async function handleAuthCallback(request: Request): Promise<NextResponse> {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const tokenHash = searchParams.get('token_hash');
  const next = safeRedirectPath(searchParams.get('next') ?? DEFAULT_REDIRECT);

  const type = searchParams.get('type');
  const verified = code
    ? await exchangeCodeForSession(code)
    : tokenHash === null
      ? false
      : type === 'recovery'
        ? await verifyEmailToken(tokenHash, 'recovery')
        : type === 'signup' || type === 'email'
          ? await verifyEmailToken(tokenHash, 'email')
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
    `${origin}/login?error=callback`,
  );
}

/** The configured public origin, else the request's own. */
function callbackOrigin(request: Request, origin: string): string {
  return publicOrigin((name) => request.headers.get(name), origin);
}
