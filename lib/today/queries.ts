import { createClient } from '@/shared/supabase/server';
import { kolkataDate } from '@/shared/time/kolkata';
import { PRIORITY_SORT_ORDER } from '@/shared/tracker/enums';
import type { AwardReadModel } from '@/lib/stars/read-model';
import type { TaskPriority, TaskStatus } from '@/types/tracker';

/**
 * Data for the personal Today page. Read-only, using only existing tables and
 * RPCs under the caller's own permissions. Each section loads independently: a
 * failed query yields an explicit "unavailable" section, never a zero.
 */
export type Section<T> = { status: 'ready'; data: T } | { status: 'unavailable' };

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

async function settle<T>(load: () => Promise<T>): Promise<Section<T>> {
  try {
    return { status: 'ready', data: await load() };
  } catch {
    return { status: 'unavailable' };
  }
}

export async function getTodayData(userId: string, now = new Date()): Promise<TodayData> {
  const db = await createClient();
  const today = kolkataDate(now);
  const weekStart = weekStartOf(today);
  const monthStart = `${today.slice(0, 8)}01`;
  const nextMonth = new Date(`${monthStart}T00:00:00Z`);
  nextMonth.setUTCMonth(nextMonth.getUTCMonth() + 1);
  const monthEndExclusive = nextMonth.toISOString().slice(0, 10);

  const myTaskIds = async (): Promise<string[]> => {
    const [owned, assigned] = await Promise.all([
      db.from('tasks').select('id').eq('assignee_id', userId),
      db.from('task_assignees').select('task_id').eq('user_id', userId),
    ]);
    if (owned.error || assigned.error) throw new Error('Assigned missions unavailable');
    return [...new Set([...owned.data.map((r) => r.id), ...assigned.data.map((r) => r.task_id)])];
  };
  const idsPromise = myTaskIds();

  const namesResult = await db.from('users').select('id,full_name');
  const names: Record<string, string> = Object.fromEntries((namesResult.data ?? []).map((u) => [u.id, u.full_name]));

  const [focus, week, awards, validated] = await Promise.all([
    settle(async () => {
      const ids = await idsPromise;
      if (ids.length === 0) return { missions: [], openCount: 0 };
      const { data, error } = await db
        .from('tasks')
        .select('id,task_tag,title,priority,status,due_date,progress_percentage')
        .in('id', ids)
        .not('status', 'in', '("Done","Discarded")')
        .is('archived_effective_date', null);
      if (error) throw error;
      const missions = data
        .map((t) => ({ id: t.id, taskTag: t.task_tag, title: t.title, priority: t.priority as TaskPriority,
          status: t.status as TaskStatus, dueDate: t.due_date, progress: t.progress_percentage }))
        .sort((a, b) => (a.dueDate ?? '9999-12-31').localeCompare(b.dueDate ?? '9999-12-31')
          || PRIORITY_SORT_ORDER[b.priority] - PRIORITY_SORT_ORDER[a.priority]
          || a.taskTag.localeCompare(b.taskTag));
      return { missions: missions.slice(0, 3), openCount: missions.length };
    }),
    settle(async () => {
      const ids = await idsPromise;
      const [logs, completed, facts, ideas, suggestions, awardDays] = await Promise.all([
        db.from('daily_task_logs').select('log_date').eq('user_id', userId)
          .gte('log_date', weekStart).lte('log_date', today).is('reversed_at', null),
        ids.length
          ? db.from('tasks').select('id', { count: 'exact', head: true }).in('id', ids).eq('status', 'Done')
            .gte('completed_date', weekStart).lte('completed_date', today)
          : Promise.resolve({ count: 0, error: null }),
        db.from('daily_facts').select('validation_state').eq('posted_by', userId).gte('fact_date', weekStart).lte('fact_date', today),
        db.from('ideas').select('validation_state').eq('posted_by', userId).gte('idea_date', weekStart).lte('idea_date', today),
        db.from('suggestions').select('validation_state').eq('posted_by', userId).gte('suggestion_date', weekStart).lte('suggestion_date', today),
        db.rpc('award_read_model', { p_from: weekStart, p_to_exclusive: addDays(today, 1), p_employee: null }),
      ]);
      for (const r of [logs, completed, facts, ideas, suggestions, awardDays]) if (r.error) throw r.error;
      // Withdrawn and rejected entries are not counted as recorded contributions.
      const live = (rows: { validation_state?: string | null }[] | null) =>
        (rows ?? []).filter((r) => !['withdrawn', 'rejected'].includes(r.validation_state ?? '')).length;
      const days = ((awardDays.data as { days?: AwardDay[] } | null)?.days ?? []);
      return {
        activeDays: new Set((logs.data ?? []).map((l) => l.log_date)).size,
        missionsCompleted: completed.count ?? 0,
        contributionsRecorded: live(facts.data) + live(ideas.data) + live(suggestions.data),
        dailyStarsEarned: days.filter((d) => d.date >= weekStart && d.date <= today && d.certified
          && d.status === 'completed_winner' && d.winnerId === userId).length,
      };
    }),
    settle(async () => {
      const result = await db.rpc('award_read_model', { p_from: monthStart, p_to_exclusive: monthEndExclusive, p_employee: null });
      if (result.error) throw result.error;
      const model = result.data as unknown as Pick<AwardReadModel, 'days' | 'policy' | 'policyApproved'> | null;
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
      const [facts, ideas, suggestions] = await Promise.all([
        db.from('daily_facts').select('id,posted_by,fact,validation_at').eq('validation_state', 'validated')
          .order('validation_at', { ascending: false }).limit(3),
        db.from('ideas').select('id,posted_by,idea,validation_at').eq('validation_state', 'validated')
          .order('validation_at', { ascending: false }).limit(3),
        db.from('suggestions').select('id,posted_by,suggestion,validation_at').eq('validation_state', 'validated')
          .order('validation_at', { ascending: false }).limit(3),
      ]);
      for (const r of [facts, ideas, suggestions]) if (r.error) throw r.error;
      const entries: ValidatedContribution[] = [
        ...(facts.data ?? []).map((r) => ({ id: r.id, kind: 'fact' as const, author: r.posted_by, content: r.fact, at: r.validation_at })),
        ...(ideas.data ?? []).map((r) => ({ id: r.id, kind: 'idea' as const, author: r.posted_by, content: r.idea, at: r.validation_at })),
        ...(suggestions.data ?? []).map((r) => ({ id: r.id, kind: 'suggestion' as const, author: r.posted_by, content: r.suggestion, at: r.validation_at })),
      ].filter((r) => r.at).map((r) => ({ id: r.id, kind: r.kind, authorName: r.author ? names[r.author] ?? 'Team member' : 'Attribution needs review',
        content: r.content, validatedAt: r.at! }));
      return entries.sort((a, b) => b.validatedAt.localeCompare(a.validatedAt)).slice(0, 3);
    }),
  ]);

  return { today, weekStart, monthStart, focus, week, awards, validated, names };
}
