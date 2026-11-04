import { createClient } from '@/shared/supabase/server';

/** One stretch of timed work on a mission: a stopped timer's segment, or a timer still running (`end` null). */
export interface DaySession {
  readonly taskId: string;
  readonly taskTag: string;
  readonly taskTitle: string;
  /** ISO timestamps. */
  readonly start: string;
  readonly end: string | null;
  readonly notes: string | null;
}

/** Time logged on a day without start and end (manual or imported entries). */
export interface DayManualEntry {
  readonly taskId: string;
  readonly taskTag: string;
  readonly taskTitle: string;
  readonly hours: number;
  readonly notes: string | null;
}

export interface MemberDaySessions {
  sessions: DaySession[];
  manual: DayManualEntry[];
}

type TaskJoin = { task_tag: string; title: string } | { task_tag: string; title: string }[] | null;
const taskOf = (join: TaskJoin) => (Array.isArray(join) ? join[0] : join) ?? null;

/**
 * One member's day for the check-out report (migration 119's time blocks):
 * the unreversed timer segments logged on that India date with their mission,
 * start, end and session note, the member's timers still running, and the
 * manual entries (no times) listed separately. Several timers may overlap
 * (migration 118); the caller merges. Throws on a read error so the caller can
 * leave the report out rather than show an empty day. PRIVATE.
 */
export async function getMemberDaySessions(userId: string, date: string): Promise<MemberDaySessions> {
  const db = await createClient();
  const [logs, running] = await Promise.all([
    db.from('daily_task_logs')
      .select('id, task_id, hours_worked, timer_segment_start, timer_segment_end, update_notes, tasks!inner(task_tag,title)')
      .eq('user_id', userId).eq('log_date', date).is('reversed_at', null)
      .order('timer_segment_start', { ascending: true, nullsFirst: false }).limit(500),
    db.from('task_timers')
      .select('id, task_id, started_at, notes, tasks!inner(task_tag,title)')
      .eq('user_id', userId).eq('status', 'Running').limit(20),
  ]);
  if (logs.error) throw new Error(`Day sessions unavailable: ${logs.error.message}`);
  if (running.error) throw new Error(`Running timers unavailable: ${running.error.message}`);
  const sessions: DaySession[] = [];
  const manual: DayManualEntry[] = [];
  for (const row of logs.data) {
    const task = taskOf(row.tasks as unknown as TaskJoin);
    const mission = { taskId: row.task_id, taskTag: task?.task_tag ?? 'Unknown mission', taskTitle: task?.title ?? '' };
    if (row.timer_segment_start && row.timer_segment_end) {
      sessions.push({ ...mission, start: row.timer_segment_start, end: row.timer_segment_end, notes: row.update_notes });
    } else {
      manual.push({ ...mission, hours: Number(row.hours_worked), notes: row.update_notes });
    }
  }
  for (const row of running.data) {
    const task = taskOf(row.tasks as unknown as TaskJoin);
    sessions.push({ taskId: row.task_id, taskTag: task?.task_tag ?? 'Unknown mission', taskTitle: task?.title ?? '', start: row.started_at, end: null, notes: row.notes });
  }
  return { sessions, manual };
}
