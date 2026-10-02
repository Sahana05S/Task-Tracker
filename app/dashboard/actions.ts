'use server';

import { revalidatePath } from 'next/cache';
import type { PostgrestError } from '@supabase/supabase-js';

import {
  currentPeriod,
  resolvePeriod,
  type MemberPerformance,
} from '@/lib/analytics/engine';
import { getTeamAnalytics } from '@/lib/analytics/queries';
import { getCurrentProfile } from '@/lib/auth/profile';
import { createClient } from '@/lib/supabase/server';
import type { ActionResponse, User } from '@/types/tracker';

/**
 * Performance snapshot Server Action.
 *
 * Freezes a month's computed statistics into `monthly_performance_snapshots`, so
 * the figures a review was based on remain readable after the underlying tasks
 * and logs have moved on.
 *
 * Restricted to `managing_director`, matching the "Directors can write
 * performance snapshots" RLS policy. As elsewhere, the check here exists for a
 * useful error message; the policy is the real boundary.
 */

export interface SnapshotSummary {
  periodLabel: string;
  /** Number of member rows written. */
  memberCount: number;
  /** Star performer's name, if the month had one. */
  starPerformer: string | null;
}

export type SnapshotActionState = ActionResponse<SnapshotSummary>;

/**
 * Earliest year the schema accepts.
 *
 * `monthly_performance_snapshots` carries `CHECK (snapshot_year >= 2026)`, so an
 * earlier year would be rejected by the database with an opaque constraint
 * error. Caught here instead.
 */
const MIN_SNAPSHOT_YEAR = 2026;

function describeDatabaseError(error: PostgrestError): string {
  switch (error.code) {
    case '23514':
      return 'A computed value fell outside the range the snapshot table allows.';
    case '42501':
      return 'Only a managing director can write performance snapshots.';
    default:
      return error.message;
  }
}

type Actor =
  | { readonly ok: true; readonly profile: User }
  | { readonly ok: false; readonly error: string };

async function resolveActor(): Promise<Actor> {
  const profile = await getCurrentProfile();

  if (!profile) return { ok: false, error: 'You are not signed in.' };
  if (!profile.isActive) {
    return { ok: false, error: 'Your account is deactivated.' };
  }

  return { ok: true, profile };
}

/**
 * Builds the row for one member.
 *
 * `productivity_score` is written as NULL, not 0, when no hours were logged. The
 * column permits NULL and the distinction matters: a stored zero would later be
 * read back as a real measured rate and pull a historical median down.
 */
function toSnapshotRow(
  member: MemberPerformance,
  year: number,
  month: number,
) {
  return {
    user_id: member.userId,
    snapshot_month: month,
    snapshot_year: year,
    total_logged_hours: member.hoursLogged,
    total_progress: member.scaledProgress,
    productivity_score: member.productivity,
    loading_percentage_diff: member.loadingDiff,
    criticality_score: member.criticalityScore,
    freshness_score: member.freshnessScore,
    attendance_hours: member.attendance.attendanceHours,
    payable_days: member.attendance.payableDays,
    absent_days: member.attendance.absentDays,
    leave_days: member.attendance.leaveDays,
    is_star_performer: member.isStarPerformer,
  };
}

/**
 * Computes and stores the snapshot for a month.
 *
 * Defaults to the current month. Re-running is safe: the write is an upsert
 * keyed on the table's `UNIQUE(user_id, snapshot_month, snapshot_year)`
 * constraint, so a month can be recomputed after late log entries arrive rather
 * than being frozen wrong forever.
 */
export async function freezeMonthlySnapshot(
  year?: number,
  month?: number,
): Promise<SnapshotActionState> {
  const actor = await resolveActor();
  if (!actor.ok) return { success: false, error: actor.error };

  if (actor.profile.role !== 'managing_director') {
    return {
      success: false,
      error: 'Only a managing director can freeze a performance snapshot.',
    };
  }

  const fallback = currentPeriod();
  const targetYear = year ?? fallback.year;
  const targetMonth = month ?? fallback.month;

  if (!Number.isInteger(targetYear) || targetYear < MIN_SNAPSHOT_YEAR) {
    return {
      success: false,
      error: `Snapshots are only supported from ${MIN_SNAPSHOT_YEAR} onward.`,
    };
  }
  if (!Number.isInteger(targetMonth) || targetMonth < 1 || targetMonth > 12) {
    return { success: false, error: 'Select a month between 1 and 12.' };
  }

  const period = resolvePeriod(targetYear, targetMonth);

  let analytics;
  try {
    analytics = await getTeamAnalytics(period);
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : 'Could not compute the snapshot.',
    };
  }

  if (analytics.members.length === 0) {
    return {
      success: false,
      error: 'There are no active members to snapshot.',
    };
  }

  const rows = analytics.members.map((member) =>
    toSnapshotRow(member, period.year, period.month),
  );

  const supabase = await createClient();
  const { error } = await supabase
    .from('monthly_performance_snapshots')
    .upsert(rows, { onConflict: 'user_id,snapshot_month,snapshot_year' });

  if (error) {
    return { success: false, error: describeDatabaseError(error) };
  }

  revalidatePath('/dashboard');

  return {
    success: true,
    data: {
      periodLabel: period.label,
      memberCount: rows.length,
      starPerformer: analytics.starPerformer?.fullName ?? null,
    },
  };
}
