import { createClient } from '@/shared/supabase/server';

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

export async function recalculateTaskMetrics(
  supabase: SupabaseServerClient,
  taskId: string,
  progressDelta: number,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await supabase.rpc('recalculate_task_metrics', {
    p_task_id: taskId, p_progress_delta: progressDelta,
  });
  if (error) return { ok: false, error: error.message };

  return { ok: true };
}
