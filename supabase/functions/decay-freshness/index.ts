/**
 * TaskPulse — Freshness Decay Edge Function
 *
 * Invokes `public.decay_task_freshness()` (calendar contract replaced by migration 16) via a
 * Supabase RPC call. Runs as `service_role` so the SECURITY DEFINER function
 * can write `tasks.freshness` regardless of RLS.
 *
 * Deploy
 * ──────
 *   supabase functions deploy decay-freshness
 *
 * Schedule (Supabase Dashboard → Edge Functions → decay-freshness → Schedule)
 *   Cron expression: 0 * * * *   (every hour, on the hour)
 *
 * The function is intentionally separate from pg_cron so it works on all
 * Supabase plans including Free. If your project is on Pro and pg_cron was
 * already scheduled by migration 05, deploying this function is redundant but
 * harmless — calling decay_task_freshness() twice in quick succession is a
 * no-op because the second call finds no rows whose freshness has changed.
 *
 * Environment variables required (set in Supabase Dashboard → Settings → Edge
 * Functions, or via `supabase secrets set`):
 *   SUPABASE_URL           your project URL  (auto-injected on Supabase)
 *   SUPABASE_SERVICE_ROLE_KEY  service-role key  (auto-injected on Supabase)
 */

import { createClient } from 'jsr:@supabase/supabase-js@2';

interface DecayResult {
  updated_count: number;
  rotten_count: number;
  stale_count: number;
}

Deno.serve(async (req: Request): Promise<Response> => {
  // Only accept POST (the scheduler sends POST) or GET (for manual testing).
  if (req.method !== 'POST' && req.method !== 'GET') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  if (!supabaseUrl || !serviceRoleKey) {
    console.error('decay-freshness: missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    return new Response(
      JSON.stringify({ error: 'Server misconfiguration: environment variables missing.' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    );
  }

  // service_role key bypasses RLS, which is required because
  // decay_task_freshness() is SECURITY DEFINER but the RPC call itself still
  // needs a caller that is permitted to invoke the function.
  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  const startedAt = Date.now();

  const { data, error } = await supabase
    .rpc('decay_task_freshness')
    .returns<DecayResult[]>();

  const elapsedMs = Date.now() - startedAt;

  if (error) {
    console.error('decay-freshness: RPC failed', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    );
  }

  // The function returns a single row via RETURN QUERY SELECT.
  const result = data?.[0];

  console.log(
    `decay-freshness: updated=${result?.updated_count ?? 0} ` +
    `rotten=${result?.rotten_count ?? 0} ` +
    `stale=${result?.stale_count ?? 0} ` +
    `elapsed=${elapsedMs}ms`,
  );

  return new Response(
    JSON.stringify({
      ok: true,
      updatedCount: result?.updated_count ?? 0,
      rottenCount: result?.rotten_count ?? 0,
      staleCount: result?.stale_count ?? 0,
      elapsedMs,
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  );
});
