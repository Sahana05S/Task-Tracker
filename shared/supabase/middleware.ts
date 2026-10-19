import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import type { JwtPayload } from '@supabase/supabase-js';

import type { Database } from '@/types/database';

/**
 * Result of a session refresh pass.
 *
 * `claims` is returned alongside the response so that role guards added in
 * Phase 2 can authorize the request without issuing a second `getUser()`
 * Auth server call.
 */
export interface SessionRefreshResult {
  /**
   * The response carrying the refreshed auth cookies. Callers must return this
   * object, or copy its cookies onto any replacement response.
   */
  response: NextResponse;
  /** Verified token claims (`sub` is the auth user id), or `null` when signed out. */
  claims: JwtPayload | null;
}

/**
 * Refreshes the Supabase auth session on the edge and propagates the rotated
 * tokens in both directions:
 *
 * - `request.cookies.set` hands the fresh token to Server Components, so they
 *   do not each try to refresh the same token.
 * - `response.cookies.set` hands the fresh token to the browser, replacing the
 *   expired one.
 *
 * Server Components cannot write cookies, which is why this refresh has to
 * happen in middleware. Without it the access token cookie goes stale and the
 * user appears randomly signed out.
 *
 * @example
 * ```ts
 * // middleware.ts (project root)
 * export async function middleware(request: NextRequest) {
 *   const { response } = await updateSession(request);
 *   return response;
 * }
 * ```
 */
export async function updateSession(
  request: NextRequest,
): Promise<SessionRefreshResult> {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => {
            request.cookies.set(name, value);
          });

          supabaseResponse = NextResponse.next({ request });

          cookiesToSet.forEach(({ name, value, options }) => {
            supabaseResponse.cookies.set(name, value, options);
          });
        },
      },
    },
  );

  // Do not insert code between createServerClient and getClaims(). Anything that
  // touches cookies in between is a common cause of users being logged out at
  // random. getClaims() refreshes an expired session, then verifies the token
  // signature locally against the project's published signing keys (cached),
  // instead of an Auth server round trip on each of the ~20 prefetches per page.
  // Projects on legacy symmetric keys fall back to the Auth server. The
  // workspace layout (getUser) and RLS remain the authorization checks.
  const { data } = await supabase.auth.getClaims();

  return { response: supabaseResponse, claims: data?.claims ?? null };
}
