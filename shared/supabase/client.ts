import { createBrowserClient } from '@supabase/ssr';

import type { Database } from '@/types/database';

/**
 * Supabase client for Client Components (browser runtime).
 *
 * Session state is persisted in cookies so that it stays in sync with the
 * server-side clients in `./server.ts` and the session refresh in
 * `./middleware.ts`.
 *
 * Per `reference/steering/tech-stack.md`, this client is for reads and realtime
 * subscriptions only. Client components must never write to the database
 * directly — route all mutations through Server Actions.
 */
export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
