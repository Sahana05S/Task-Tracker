import 'server-only';

import { createClient } from '@/shared/supabase/server';

import type { MissionPickerOption } from './mission-picker';

interface PickerRow {
  id: string; task_tag: string; title: string; status: string | null; archived_effective_date: string | null;
  is_permanent?: boolean | null; business_id?: string | null;
}

async function readPickerRows(): Promise<PickerRow[]> {
  const db = await createClient();
  const { data, error } = await db.from('tasks')
    .select('id, task_tag, title, status, archived_effective_date, is_permanent, business_id')
    .is('archived_effective_date', null);
  if (error) throw new Error(`Missions unavailable: ${error.message}`);
  return data as unknown as PickerRow[];
}

/**
 * Every unarchived mission for the mission picker, with its parent (a Subtask link: predecessor =
 * parent, migration 68), permanent flag and business. `keepIds` adds missions already chosen (a
 * meeting linked to a mission archived since).
 */
export async function getMissionPickerOptions(keepIds: readonly string[] = []): Promise<MissionPickerOption[]> {
  const db = await createClient();
  const [rows, links, kept] = await Promise.all([
    readPickerRows(),
    db.from('task_dependencies').select('predecessor_task_id, successor_task_id').eq('relation_type', 'Subtask'),
    keepIds.length ? db.from('tasks').select('id, task_tag, title, status, archived_effective_date').in('id', [...keepIds]) : Promise.resolve({ data: [], error: null }),
  ]);
  if (links.error) throw new Error(`Missions unavailable: ${links.error.message}`);
  if (kept.error) throw new Error(`Missions unavailable: ${kept.error.message}`);
  const parents = new Map(links.data.map((link) => [link.successor_task_id, link.predecessor_task_id] as const));
  const all = [...rows, ...((kept.data ?? []) as PickerRow[]).filter((row) => !rows.some((r) => r.id === row.id))];
  return all
    .filter((row) => row.status !== 'Discarded' || keepIds.includes(row.id))
    .map((row) => ({
      id: row.id, tag: row.task_tag, title: row.title, status: row.status,
      parentId: parents.get(row.id) ?? null, isPermanent: row.is_permanent === true, businessId: row.business_id ?? null,
    }));
}
