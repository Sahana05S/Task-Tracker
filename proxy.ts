import { NextResponse, type NextRequest } from 'next/server';

import { isProtectedPath } from '@/lib/auth/protected-routes';
import { updateSession } from '@/lib/supabase/middleware';

/**
 * Edge request guard.
 *
 * Named `proxy.ts` because Next.js 16 renamed the `middleware` file convention
 * to `proxy` and the exported function from `middleware` to `proxy`. The old
 * name still runs in 16 but is deprecated. On Next.js 15 or earlier, rename
 * this file to `middleware.ts` and export `middleware` instead.
 *
 * Two responsibilities, in order:
 *
 *  1. Refresh the Supabase auth session on every matched request. Server
 *     Components cannot write cookies, so this is the only place the rotated
 *     access token can be persisted.
 *  2. Turn anonymous requests away from workspace routes.
 *
 * This is a first line of defence, not the only one. It keeps unauthenticated
 * traffic out cheaply, at the edge, without a database read. Authorisation
 * proper — that a `public.users` profile exists, and that its role permits the
 * action — is enforced in `app/(workspace)/layout.tsx` and ultimately by the
 * RLS policies in the database.
 */

export async function proxy(request: NextRequest): Promise<NextResponse> {
  const { response, user } = await updateSession(request);

  const { pathname, search } = request.nextUrl;

  if (!user && isProtectedPath(pathname)) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = '/login';
    loginUrl.search = '';
    // Preserve the destination so the login action can return the user to it.
    loginUrl.searchParams.set('redirectTo', `${pathname}${search}`);

    const redirectResponse = NextResponse.redirect(loginUrl);

    // Carry over the refreshed auth cookies. Dropping them here would discard
    // the token rotation that just happened and log the user out on the next
    // request.
    for (const cookie of response.cookies.getAll()) {
      redirectResponse.cookies.set(cookie);
    }

    return redirectResponse;
  }

  return response;
}

export const config = {
  /**
   * Runs on everything except Next's own static output and common image
   * requests, so the session refresh covers all real navigations without
   * burning work on assets.
   */
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
};
