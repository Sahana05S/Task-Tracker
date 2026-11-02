import { createServerClient } from '@supabase/ssr';
import { createClient as createDetachedSupabaseClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';

import type { Database } from '@/types/database';

/**
 * Supabase client for server-only runtimes: React Server Components,
 * Server Actions, and Route Handlers.
 *
 * Must be created per-request. Never hoist the result into a module-level
 * constant — the cookie store is request-scoped, and sharing one client across
 * requests would leak sessions between users.
 *
 * `cookies()` is asynchronous in the Next.js App Router, so this function is
 * async and every call site must await it:
 *
 * ```ts
 * const supabase = await createClient();
 * ```
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(
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
          } catch {
            // Server Components cannot write cookies. Swallowing this is safe
            // because `updateSession` in ./middleware.ts already refreshes the
            // session on every matched request.
          }
        },
      },
    },
  );
}

/**
 * An anon-key client that keeps nothing: no cookies, no storage, no refresh.
 * Used to check an emailed token before deciding whether this browser may
 * adopt the session it yields (modules/auth callback).
 */
export function createDetachedClient() {
  return createDetachedSupabaseClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } },
  );
}
