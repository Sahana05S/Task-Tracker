import { cache } from 'react';

import { createClient } from '@/shared/supabase/server';
import { callAwardReadModel } from './read-model';
import { kolkataDate } from '@/shared/time/kolkata';

function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** First day of the month after `date`'s. */
function nextMonthStart(date: string): string {
  const d = new Date(`${date.slice(0, 7)}-01T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + 1);
  return d.toISOString().slice(0, 10);
}

/**
 * One award read per request for a window, without the per-member
 * calculations (`p_candidates` false, migration 86): those were 3.96 MB of a
 * 4 MB month and Today's readers never use them (28 October 2026).
 */
const readWindow = cache(async (from: string, toExclusive: string): Promise<Record<string, unknown>> => {
  const db = await createClient();
  const result = await callAwardReadModel(db, { p_from: from, p_to_exclusive: toExclusive, p_employee: null }, false);
  if (result.error) throw result.error;
  return result.data as Record<string, unknown>;
});

const inRange = (from: string, toExclusive: string) => (row: unknown) => {
  const date = (row as { date?: unknown })?.date;
  return typeof date === 'string' && date >= from && date < toExclusive;
};

/**
 * Team-wide `award_read_model` days (winner, status, last decided; candidates
 * left out) for a date range. Ranges near today (Today's week, its month and the
 * daily star's month back) share one read of the window that covers them all,
 * cut to the range asked for. Throws on an RPC error so the caller can show it
 * as unavailable; callers validate the shape themselves. PRIVATE.
 */
export async function readTeamAwardModel(from: string, toExclusive: string): Promise<unknown> {
  const today = kolkataDate(new Date());
  const windowFrom = [from, `${today.slice(0, 7)}-01`, addDays(today, -31)].sort()[0];
  const windowTo = [toExclusive, nextMonthStart(today)].sort().at(-1)!;
  const shared = windowFrom <= from && toExclusive <= windowTo && windowTo > windowFrom;
  const model = await (shared ? readWindow(windowFrom, windowTo) : readWindow(from, toExclusive));
  if (!model || !Array.isArray(model.days)) return model;
  const keep = inRange(from, toExclusive);
  return {
    ...model,
    days: model.days.filter(keep),
    legacy: Array.isArray(model.legacy) ? model.legacy.filter(keep) : model.legacy,
  };
}
