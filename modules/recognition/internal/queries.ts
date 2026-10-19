// PRIVATE. Only files inside this module may import from internal/.
import { createClient } from '@/shared/supabase/server';

export interface ActivityDaysModel {
  asOf: string;
  from: string;
  timezone: 'Asia/Kolkata';
  policy: unknown;
  members: { userId: string; days: string }[];
}

/**
 * Day codes for the caller (or, for managers, a named member or everyone).
 * The database decides who may see whom; a refusal surfaces as an error.
 */
export async function readActivityDays(employee?: string, asOf?: string): Promise<ActivityDaysModel> {
  const db = await createClient();
  const { data, error } = await db.rpc('recognition_activity_days', { p_as_of: asOf ?? null, p_employee: employee ?? null });
  if (error) throw new Error(`Activity days read failed: ${error.message}`);
  const model = data as unknown as ActivityDaysModel | null;
  if (!model || typeof model.asOf !== 'string' || typeof model.from !== 'string' || !Array.isArray(model.members)) {
    throw new Error('Activity days unavailable.');
  }
  return model;
}
