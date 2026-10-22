import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { bearerMatches } from '@/shared/security/bearer';
import type { Database } from '@/types/database';

/**
 * Service-role client for background workers. With an organization id, every
 * request carries x-taskpulse-organization, and the database scopes all reads
 * and writes to that company (migration 40). The header is honoured only for
 * the service role; signed-in users can never choose a company with it.
 */
export function workerClient(url: string, key: string, organizationId?: string | null): SupabaseClient<Database> {
  return createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: organizationId ? { headers: { 'x-taskpulse-organization': organizationId } } : undefined,
  });
}

/** Builds the per-company client for one job, or keeps the unscoped one. */
export type ForOrganization = (organizationId: string) => SupabaseClient<Database>;

/** `sandbox` for test environments, `production` for the scheduled live run; anything else is off. */
const ENABLED_MODES = new Set(['sandbox', 'production']);

/**
 * The guard every internal worker endpoint runs first: the workers' switch
 * (TASKPULSE_AWARD_WORKER_ENABLED) must be on and the request must carry the
 * workers' bearer token (TASKPULSE_AWARD_WORKER_TOKEN), compared in constant
 * time. Returns the refusal to send, or null to continue.
 */
export function authorizeWorkerRequest(request: Request, worker = 'Award worker'): Response | null {
  const token = process.env.TASKPULSE_AWARD_WORKER_TOKEN;
  if (!token || !ENABLED_MODES.has(process.env.TASKPULSE_AWARD_WORKER_ENABLED ?? '')) {
    return Response.json({ status: 'unavailable', reason: `${worker} is not configured.` }, { status: 503 });
  }
  if (!bearerMatches(request, token)) {
    return Response.json({ status: 'forbidden' }, { status: 403 });
  }
  return null;
}

/** The service-role connection settings, or null when they are not configured. */
export function workerConnection(): { url: string; key: string } | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return url && key ? { url, key } : null;
}
