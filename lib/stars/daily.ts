import { computeChecklistProgress } from '@/lib/checklists/progress';
import { createClient } from '@/lib/supabase/server';
import { mapUser, USER_COLUMNS } from '@/lib/supabase/mappers';
import { TASK_COLUMNS, mapTasks } from '@/lib/tasks/mappers';
import {
  attendanceIsValidForDailyStar,
  scoreDailyStarCandidate,
  selectDailyStarWinner,
  type DailyStarCandidateInput,
  type DailyStarCandidateScore,
} from '@/lib/stars/scoring';
import type {
  AttendanceRecordRow,
  ChecklistNodeRow,
  DailyTaskLogRow,
  TaskChecklistRow,
} from '@/types/database';
import type { DailyStarRecord } from '@/types/tracker';

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

export interface DailyStarCalculation {
  readonly starDate: string;
  readonly candidates: readonly DailyStarCandidateScore[];
  readonly winner: DailyStarCandidateScore | null;
}

export async function calculateDailyStar(
  starDate: string,
): Promise<DailyStarCalculation> {
  const supabase = await createClient();
  const [userRows, logRows, taskRows, attendanceRows] = await Promise.all([
    selectOrEmpty(supabase.from('users').select(USER_COLUMNS).eq('is_active', true)),
    selectOrEmpty(
      supabase
        .from('daily_task_logs')
        .select('id, task_id, user_id, log_date, hours_worked, progress_delta, update_notes, raw_links, log_source, source_timer_id, created_at')
        .eq('log_date', starDate),
    ),
    selectOrEmpty(supabase.from('tasks').select(TASK_COLUMNS)),
    selectOrEmpty(
      supabase
        .from('attendance_records')
        .select('id, user_id, attendance_date, status, check_in_at, check_out_at, attendance_hours, off_hours, holiday_name, notes, recorded_by, created_at, updated_at')
        .eq('attendance_date', starDate),
    ),
  ]);

  const users = userRows.map(mapUser);
  const tasks = mapTasks(taskRows);
  const taskById = new Map(tasks.map((task) => [task.id, task]));
  const attendanceByUserId = new Map(
    attendanceRows.map((row) => [row.user_id, row]),
  );
  const checklistProgressByTaskId = await loadChecklistProgressByTaskId(
    supabase,
    [...new Set(logRows.map((row) => row.task_id))],
  );

  const candidateInputs: DailyStarCandidateInput[] = users.map((user) => {
    const userLogs = logRows.filter((log) => log.user_id === user.id);
    const loggedTasks = userLogs
      .map((log) => taskById.get(log.task_id))
      .filter((task): task is NonNullable<typeof task> => task !== undefined);
    const hoursLogged = userLogs.reduce(
      (total, log) => total + log.hours_worked,
      0,
    );
    const scaledProgress = userLogs.reduce((total, log) => {
      const task = taskById.get(log.task_id);
      return total + (task?.taskScale ?? 0) * ((log.progress_delta ?? 0) / 100);
    }, 0);
    const checklistCompletionPercentage =
      loggedTasks.length === 0
        ? 0
        : average(
            loggedTasks.map(
              (task) => checklistProgressByTaskId.get(task.id) ?? 0,
            ),
          );
    const freshnessPercentage =
      loggedTasks.length === 0
        ? 0
        : average(loggedTasks.map((task) => freshnessValue(task.freshness)));
    const attendance = attendanceByUserId.get(user.id);

    return {
      userId: user.id,
      fullName: user.fullName,
      hoursLogged,
      scaledProgress,
      checklistCompletionPercentage,
      freshnessPercentage,
      attendanceValid: attendance
        ? attendanceIsValidForDailyStar({
            status: attendance.status,
            attendanceHours: attendance.attendance_hours,
            offHours: attendance.off_hours,
          })
        : false,
    };
  });

  const candidates = candidateInputs.map(scoreDailyStarCandidate);

  return {
    starDate,
    candidates,
    winner: selectDailyStarWinner(candidateInputs),
  };
}

export async function storeDailyStarCalculation({
  starDate,
  overrideUserId,
  overrideReason,
  overrideBy,
}: {
  readonly starDate: string;
  readonly overrideUserId?: string;
  readonly overrideReason?: string;
  readonly overrideBy?: string;
}): Promise<DailyStarRecord | null> {
  const supabase = await createClient();
  const calculation = await calculateDailyStar(starDate);
  const selected =
    overrideUserId === undefined
      ? calculation.winner
      : calculation.candidates.find((candidate) => candidate.userId === overrideUserId) ??
        null;

  await replaceScoreComponents(supabase, calculation);

  if (!selected) return null;

  if (overrideUserId === undefined) {
    const existing = await readExistingStar(supabase, starDate);
    if (existing?.isOverride) return existing;
  }

  const { data, error } = await supabase
    .from('daily_star_records')
    .upsert(
      {
        star_date: starDate,
        user_id: selected.userId,
        score: selected.score,
        productivity_component: selected.productivityComponent,
        progress_component: selected.progressComponent,
        checklist_component: selected.checklistComponent,
        freshness_component: selected.freshnessComponent,
        attendance_component: selected.attendanceComponent,
        reason:
          overrideUserId === undefined
            ? automaticReason(selected)
            : overrideReason ?? 'Manager override due to corrected data.',
        is_override: overrideUserId !== undefined,
        override_by: overrideBy ?? null,
      },
      { onConflict: 'star_date' },
    )
    .select('id, star_date, user_id, score, productivity_component, progress_component, checklist_component, freshness_component, attendance_component, reason, is_override, override_by, created_at, updated_at')
    .single();

  if (error) throw new Error(`Failed to store daily star: ${error.message}`);

  return {
    id: data.id,
    starDate: data.star_date,
    userId: data.user_id,
    score: data.score,
    productivityComponent: data.productivity_component,
    progressComponent: data.progress_component,
    checklistComponent: data.checklist_component,
    freshnessComponent: data.freshness_component,
    attendanceComponent: data.attendance_component,
    reason: data.reason,
    isOverride: data.is_override,
    overrideBy: data.override_by,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
  };
}

async function replaceScoreComponents(
  supabase: SupabaseServerClient,
  calculation: DailyStarCalculation,
): Promise<void> {
  const { error: deleteError } = await supabase
    .from('performance_score_components')
    .delete()
    .eq('score_date', calculation.starDate)
    .eq('source_table', 'daily_star_calculation');

  if (deleteError) {
    throw new Error(`Failed to reset score components: ${deleteError.message}`);
  }

  const rows = calculation.candidates.flatMap((candidate) => [
    componentRow(calculation.starDate, candidate.userId, 'progress', candidate.progressComponent),
    componentRow(calculation.starDate, candidate.userId, 'productivity', candidate.productivityComponent),
    componentRow(calculation.starDate, candidate.userId, 'checklist', candidate.checklistComponent),
    componentRow(calculation.starDate, candidate.userId, 'freshness', candidate.freshnessComponent),
    componentRow(calculation.starDate, candidate.userId, 'attendance', candidate.attendanceComponent),
    componentRow(calculation.starDate, candidate.userId, 'daily_star_total', candidate.score),
  ]);

  if (rows.length === 0) return;

  const { error } = await supabase.from('performance_score_components').insert(rows);

  if (error) {
    throw new Error(`Failed to store score components: ${error.message}`);
  }
}

function componentRow(
  scoreDate: string,
  userId: string,
  metricKey: string,
  metricValue: number,
) {
  return {
    user_id: userId,
    score_date: scoreDate,
    metric_key: metricKey,
    metric_value: metricValue,
    source_table: 'daily_star_calculation',
    source_id: null,
  };
}

async function readExistingStar(
  supabase: SupabaseServerClient,
  starDate: string,
): Promise<DailyStarRecord | null> {
  const { data, error } = await supabase
    .from('daily_star_records')
    .select('id, star_date, user_id, score, productivity_component, progress_component, checklist_component, freshness_component, attendance_component, reason, is_override, override_by, created_at, updated_at')
    .eq('star_date', starDate)
    .maybeSingle();

  if (error) throw new Error(`Failed to read daily star: ${error.message}`);
  if (!data) return null;

  return {
    id: data.id,
    starDate: data.star_date,
    userId: data.user_id,
    score: data.score,
    productivityComponent: data.productivity_component,
    progressComponent: data.progress_component,
    checklistComponent: data.checklist_component,
    freshnessComponent: data.freshness_component,
    attendanceComponent: data.attendance_component,
    reason: data.reason,
    isOverride: data.is_override,
    overrideBy: data.override_by,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
  };
}

async function loadChecklistProgressByTaskId(
  supabase: SupabaseServerClient,
  taskIds: readonly string[],
): Promise<ReadonlyMap<string, number>> {
  if (taskIds.length === 0) return new Map();

  const checklistRows = await selectOrEmpty<TaskChecklistRow>(
    supabase
      .from('task_checklists')
      .select('id, task_id, template_id, title, sync_progress_to_task, created_by, created_at, updated_at')
      .in('task_id', taskIds),
  );
  if (checklistRows.length === 0) return new Map();

  const nodes = await selectOrEmpty<ChecklistNodeRow>(
    supabase
      .from('checklist_nodes')
      .select('*')
      .in(
        'checklist_id',
        checklistRows.map((row) => row.id),
      ),
  );

  const nodesByChecklistId = new Map<string, ChecklistNodeRow[]>();
  for (const node of nodes) {
    const entries = nodesByChecklistId.get(node.checklist_id) ?? [];
    entries.push(node);
    nodesByChecklistId.set(node.checklist_id, entries);
  }

  return new Map(
    checklistRows.map((checklist) => {
      const progress = computeChecklistProgress(
        (nodesByChecklistId.get(checklist.id) ?? []).map((node) => ({
          id: node.id,
          parentNodeId: node.parent_node_id,
          isComplete: node.is_complete,
        })),
      );

      return [checklist.task_id, progress.overallProgressPercentage];
    }),
  );
}

function freshnessValue(freshness: string): number {
  switch (freshness) {
    case 'Fresh':
      return 100;
    case 'Stale':
      return 50;
    case 'Rotten':
    default:
      return 0;
  }
}

function automaticReason(winner: DailyStarCandidateScore): string {
  return [
    `Automatic daily star for ${winner.fullName}.`,
    `Score ${winner.score}.`,
    `Progress ${winner.progressComponent}, productivity ${winner.productivityComponent}, checklist ${winner.checklistComponent}, freshness ${winner.freshnessComponent}, attendance ${winner.attendanceComponent}.`,
  ].join(' ');
}

function average(values: readonly number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((total, value) => total + value, 0) / values.length;
}

async function selectOrEmpty<T>(
  query: PromiseLike<{
    data: T[] | null;
    error: { code?: string; message: string } | null;
  }>,
): Promise<T[]> {
  const { data, error } = await query;
  if (error) {
    if (error.code === '42P01') return [];
    throw new Error(error.message);
  }
  return data ?? [];
}
