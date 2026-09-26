import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import type { User } from '@supabase/supabase-js';

import type { Database } from '@/types/database';

/**
 * Result of a session refresh pass.
 *
 * `user` is returned alongside the response so that role guards added in
 * Phase 2 can authorize the request without issuing a second `getUser()`
 * network call.
 */
export interface SessionRefreshResult {
  /**
   * The response carrying the refreshed auth cookies. Callers must return this
   * object, or copy its cookies onto any replacement response.
   */
  response: NextResponse;
  /** The authenticated Supabase auth user, or `null` when signed out. */
  user: User | null;
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

  // Do not insert code between createServerClient and getUser(). Anything that
  // touches cookies in between is a common cause of users being logged out at
  // random. getUser() is what actually performs the refresh, so it must stay.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return { response: supabaseResponse, user };
}
