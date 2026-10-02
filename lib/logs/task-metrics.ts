import { syncTaskProgressForLinkedTask } from '@/lib/checklists/sync';
import {
  applyProgressDelta,
  computeProductivity,
  computeScaledProgress,
  isMetricsEligible,
  sumHours,
} from '@/lib/logs/metrics';
import { createClient } from '@/lib/supabase/server';

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

export async function recalculateTaskMetrics(
  supabase: SupabaseServerClient,
  taskId: string,
  progressDelta: number,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data: task, error: taskError } = await supabase
    .from('tasks')
    .select('task_scale, progress_percentage, category')
    .eq('id', taskId)
    .maybeSingle();

  if (taskError) return { ok: false, error: taskError.message };
  if (!task) return { ok: false, error: 'That task no longer exists.' };

  const { data: logRows, error: logError } = await supabase
    .from('daily_task_logs')
    .select('hours_worked')
    .eq('task_id', taskId);

  if (logError) return { ok: false, error: logError.message };

  const hoursLogged = sumHours(
    logRows.map((row) => ({ hoursWorked: row.hours_worked })),
  );
  const nextProgress = applyProgressDelta(
    task.progress_percentage,
    progressDelta,
  );
  const scaledProgress = computeScaledProgress(task.task_scale, nextProgress);

  const { error: updateError } = await supabase
    .from('tasks')
    .update({
      progress_percentage: nextProgress,
      task_productivity: computeProductivity(scaledProgress, hoursLogged),
      valid_for_metrics: isMetricsEligible(
        hoursLogged,
        task.task_scale,
        task.category,
      ),
      freshness: 'Fresh',
    })
    .eq('id', taskId);

  if (updateError) return { ok: false, error: updateError.message };

  return syncTaskProgressForLinkedTask(supabase, taskId);
}
