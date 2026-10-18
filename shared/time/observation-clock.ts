import { createClient } from '@/shared/supabase/server';

/** How far behind "now" a live read looks when the database clock is unavailable. */
export const LIVE_AS_OF_LAG_MS = 10_000;

type ClockClient = { rpc: (name: 'observation_clock') => PromiseLike<{ data: unknown; error: unknown }> };
export interface ObservationInstant { readonly instant: Date; readonly source: 'database' | 'margin' }

/**
 * Default as-of for live reads and workers, taken from the database clock so it
 * is never later than the database's own nonfuture boundary and includes every
 * record committed before the call. Fractional microseconds are truncated to
 * milliseconds, so the instant never exceeds the database clock. Without the
 * migration-30 function it falls back to the app clock minus the margin.
 */
export async function observationInstant(db?: ClockClient): Promise<ObservationInstant> {
  const client = db ?? (await createClient()) as unknown as ClockClient;
  const { data, error } = await client.rpc('observation_clock');
  const match = typeof data === 'string' ? /^(.+?\d{2}:\d{2}:\d{2})(?:\.(\d+))?(.*)$/.exec(data) : null;
  const instant = match && !error ? new Date(`${match[1]}.${(match[2] ?? '').padEnd(3, '0').slice(0, 3)}${match[3]}`) : null;
  if (instant && Number.isFinite(instant.getTime())) return { instant, source: 'database' };
  return { instant: new Date(Date.now() - LIVE_AS_OF_LAG_MS), source: 'margin' };
}
