import { createClient } from '@/lib/supabase/server';
import type { DailyStarCandidateScore } from '@/lib/stars/legacy-scoring';
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
  throw new Error('Live awards require the shared M07/M08 engine; saved awards remain readable.');
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

function automaticReason(winner: DailyStarCandidateScore): string {
  return [
    `Automatic daily star for ${winner.fullName}.`,
    `Score ${winner.score}.`,
    `Progress ${winner.progressComponent}, productivity ${winner.productivityComponent}, checklist ${winner.checklistComponent}, freshness ${winner.freshnessComponent}, attendance ${winner.attendanceComponent}.`,
  ].join(' ');
}
