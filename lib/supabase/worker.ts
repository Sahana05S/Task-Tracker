import { createClient, type SupabaseClient } from '@supabase/supabase-js';

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
