// PRIVATE. Server-side ceremony read and publish. The official ceremony is the
// latest revision retained by migration 50; before it is published the page
// shows the same rule over the live shared calculation and the live monthly
// winner (`getAwards().monthly`), which needs no certified month archive.
import { nextDate } from '@/modules/reports/client';
import { getAwards, selectMonthly, type AwardReadModel, type CalculationResult, type MonthlySelection } from '@/modules/scoring';
import { canManageTasks } from '@/modules/tasks/client';
import { createClient } from '@/shared/supabase/server';
import { isMissingSchemaError } from '@/shared/supabase/schema-errors';
import { kolkataDate } from '@/shared/time/kolkata';
import type { AnalyticsPeriod } from '@/shared/time/period';
import type { Json } from '@/types/database';
import type { User } from '@/types/tracker';

import {
  monthlyStarAct, projectCategories, selectCategoryWinners,
  type CategoryAward, type CeremonyModel,
} from './ceremony-rules';
import { loadMonth } from './leaderboard';

type Db = Awaited<ReturnType<typeof createClient>>;

interface StoredCeremony {
  period: string;
  published: boolean;
  revisionNumber: number;
  canPublish: boolean;
  ceremonyId?: string;
  publishedAt?: string;
  reason?: string | null;
  asOf?: string;
  monthlyStar?: { status: string; winnerId: string | null; counts?: Record<string, number>; tiedIds?: string[]; reasons?: string[] };
  awards?: CategoryAward[];
  names?: Record<string, string>;
}

/** The published ceremony, or null when the database has no migration 50 yet. */
async function readStored(db: Db, period: AnalyticsPeriod): Promise<StoredCeremony | null> {
  const { data, error } = await db.rpc('recognition_ceremony_read', { p_period: period.startDate });
  if (error) {
    if (isMissingSchemaError(error.message)) return null;
    throw new Error(`Ceremony read failed: ${error.message}`);
  }
  return data as unknown as StoredCeremony;
}

/** Every date of the month whose daily star cutoff has passed by `now`. */
function monthDates(period: AnalyticsPeriod, today: string): string[] {
  const dates: string[] = [];
  for (let d = period.startDate; d <= period.endDate && d < today; d = nextDate(d)) dates.push(d);
  return dates;
}

/**
 * The live monthly winner: `getAwards().monthly` when the award ledger and the
 * calculation share a source context; otherwise (a past month read as of its
 * end, or a closed month) the same `selectMonthly` over the ledger's days.
 */
async function liveMonthly(db: Db, period: AnalyticsPeriod, calculation: CalculationResult, today: string): Promise<AwardReadModel['monthly']> {
  let awards: AwardReadModel;
  try {
    awards = await getAwards(db, period, calculation);
    if (awards.monthly.status !== 'closed' && !awards.monthly.reasons.includes('shared_monthly_context_unavailable')) return awards.monthly;
  } catch (error) {
    if (!(error instanceof Error) || !error.message.startsWith('Award and performance sources changed')) throw error;
    awards = await getAwards(db, period);
  }
  const ended = period.endDate < today;
  return selectMonthly(awards.days, monthDates(period, today), calculation, awards.policy, ended);
}

export async function getCeremony(viewer: Pick<User, 'id' | 'role' | 'isActive'>, period: AnalyticsPeriod): Promise<CeremonyModel> {
  const db = await createClient();
  const today = kolkataDate();
  const ended = period.endDate < today;
  const manager = viewer.isActive && canManageTasks(viewer.role);
  const director = viewer.isActive && viewer.role === 'managing_director';
  const stored = await readStored(db, period);
  const publishingAvailable = stored !== null;
  const base = {
    month: period.startDate,
    publishingAvailable,
    canPublish: publishingAvailable && ended && director,
    expectedRevision: stored?.revisionNumber ?? 0,
  };
  if (stored?.published && stored.monthlyStar && stored.awards) {
    return {
      ...base, status: 'official', names: stored.names ?? {}, asOf: stored.asOf!,
      categories: stored.awards.map((a) => ({ ...a, winningRaw: a.winningRaw ?? null, tiedIds: a.tiedIds ?? [], reasons: a.reasons ?? [] })),
      monthlyStar: monthlyStarAct({
        status: stored.monthlyStar.status as MonthlySelection['status'], winnerId: stored.monthlyStar.winnerId,
        counts: stored.monthlyStar.counts ?? {}, tiedIds: stored.monthlyStar.tiedIds ?? [], reasons: stored.monthlyStar.reasons ?? [],
      }),
      publication: { ceremonyId: stored.ceremonyId!, revisionNumber: stored.revisionNumber, publishedAt: stored.publishedAt!, reason: stored.reason ?? null },
    };
  }
  const { sources, calculation, asOf } = await loadMonth(db, period);
  const names = Object.fromEntries(sources.members.map((m) => [m.id, m.fullName]));
  const monthly = await liveMonthly(db, period, calculation, today);
  return {
    ...base, status: ended ? 'ready' : 'provisional', names, asOf,
    categories: projectCategories(selectCategoryWinners(calculation), viewer.id, manager),
    monthlyStar: monthlyStarAct(monthly),
    publication: null,
  };
}

/**
 * Publishes (or republishes) an elapsed month as the director. The database
 * recomputes the winners from the calculation, checks it is current and that
 * the monthly star matches the daily evidence, and keeps every revision.
 */
export async function publishCeremony(period: AnalyticsPeriod, input: { reason: string; operationId: string; expectedRevision: number }) {
  const db = await createClient();
  const { calculation } = await loadMonth(db, period, { live: true });
  const monthly = await liveMonthly(db, period, calculation, kolkataDate());
  const { data, error } = await db.rpc('recognition_ceremony_command', {
    p_period: period.startDate,
    p_operation: input.operationId,
    p_expected_revision: input.expectedRevision,
    p_payload: { reason: input.reason, calculation: calculation as unknown as Json, monthlySelection: monthly as unknown as Json },
  });
  if (error) throw new Error(error.message);
  return data as unknown as { revisionNumber: number };
}
