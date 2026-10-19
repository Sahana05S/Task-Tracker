import { settle } from '@/shared/async/settle';
import { kolkataDate } from '@/shared/time/kolkata';

import { readTeamAwardModel } from '@/modules/scoring';
import type { AwardReadModel } from '@/modules/scoring/client';
import { getMemberContributionStates, getRecentValidatedContributions } from '@/modules/support';
import { countAssignedMissionsCompletedBetween, getAssignedMissionBatch } from '@/modules/tasks';
import { getMemberNames } from '@/modules/team';
import { getMemberLogDates } from '@/modules/time-tracking';
import type { TaskPriority, TaskStatus } from '@/types/tracker';

/**
 * Data for the personal Today page. Read-only, using only existing tables and
 * RPCs under the caller's own permissions. Each section loads independently: a
 * failed query yields an explicit "unavailable" section, never a zero.
 */
import type { Section } from '@/shared/async/settle';

export type { Section };

export interface FocusMission {
  id: string;
  taskTag: string;
  title: string;
  priority: TaskPriority;
  status: TaskStatus;
  dueDate: string | null;
  progress: number | null;
}

export interface WeekSummary {
  activeDays: number;
  missionsCompleted: number;
  contributionsRecorded: number;
  dailyStarsEarned: number;
}

type AwardDay = AwardReadModel['days'][number];
export interface AwardSnapshot {
  days: readonly AwardDay[];
  policyApproved: boolean;
  cutoff: { hour: number; minute: number } | null;
}

export interface ValidatedContribution {
  id: string;
  kind: 'fact' | 'idea' | 'suggestion';
  authorName: string;
  content: string;
  validatedAt: string;
}

export interface TodayData {
  today: string;
  weekStart: string;
  monthStart: string;
  focus: Section<{ missions: FocusMission[]; openCount: number }>;
  week: Section<WeekSummary>;
  awards: Section<AwardSnapshot>;
  validated: Section<ValidatedContribution[]>;
  names: Record<string, string>;
}

function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Monday of the Asia/Kolkata week containing `date`. */
export function weekStartOf(date: string): string {
  const day = new Date(`${date}T00:00:00Z`).getUTCDay();
  return addDays(date, -((day + 6) % 7));
}

export async function getTodayData(userId: string, now = new Date(), includeFocus = true): Promise<TodayData> {
  const today = kolkataDate(now);
  const weekStart = weekStartOf(today);
  const monthStart = `${today.slice(0, 8)}01`;
  const nextMonth = new Date(`${monthStart}T00:00:00Z`);
  nextMonth.setUTCMonth(nextMonth.getUTCMonth() + 1);
  const monthEndExclusive = nextMonth.toISOString().slice(0, 10);

  const namesPromise = getMemberNames();



  const [focus, week, awards, validated] = await Promise.all([
    settle(async () => {
      if (!includeFocus) throw new Error('Focus is streamed separately by the roadmap');
      const batch = await getAssignedMissionBatch(userId, {}, now);
      return { missions: batch.missions, openCount: batch.missions.length };
    }),
    settle(async () => {

      const [logDates, completed, contributions, awardDays] = await Promise.all([
        getMemberLogDates(userId, weekStart, today),
        countAssignedMissionsCompletedBetween(userId, weekStart, today),
        getMemberContributionStates(userId, weekStart, today),
        readTeamAwardModel(weekStart, addDays(today, 1)),
      ]);
      // Withdrawn and rejected entries are not counted as recorded contributions.
      const live = (rows: { validation_state?: string | null }[] | null) =>
        (rows ?? []).filter((r) => !['withdrawn', 'rejected'].includes(r.validation_state ?? '')).length;
      const days = ((awardDays as { days?: AwardDay[] } | null)?.days ?? []);
      return {
        activeDays: new Set(logDates).size,
        missionsCompleted: completed,
        contributionsRecorded: live(contributions.facts) + live(contributions.ideas) + live(contributions.suggestions),
        dailyStarsEarned: days.filter((d) => d.date >= weekStart && d.date <= today && d.certified
          && d.status === 'completed_winner' && d.winnerId === userId).length,
      };
    }),
    settle(async () => {
      const model = (await readTeamAwardModel(monthStart, monthEndExclusive)) as Pick<AwardReadModel, 'days' | 'policy' | 'policyApproved'> | null;
      if (!model || !Array.isArray(model.days)) throw new Error('Award read model unavailable');
      const policy = model.policy as unknown as { cutoffHour?: number; cutoffMinute?: number } | null;
      return {
        days: model.days,
        policyApproved: model.policyApproved,
        cutoff: policy && typeof policy.cutoffHour === 'number'
          ? { hour: policy.cutoffHour, minute: policy.cutoffMinute ?? 0 } : null,
      };
    }),
    settle(async () => {
      const [recent, names] = await Promise.all([getRecentValidatedContributions(), namesPromise]);
      const entries: ValidatedContribution[] = recent
        .filter((r) => r.at).map((r) => ({ id: r.id, kind: r.kind, authorName: r.author ? names[r.author] ?? 'Team member' : 'Attribution needs review',
          content: r.content, validatedAt: r.at! }));
      return entries.sort((a, b) => b.validatedAt.localeCompare(a.validatedAt)).slice(0, 3);
    }),
  ]);

  return { today, weekStart, monthStart, focus, week, awards, validated, names: await namesPromise };
}
