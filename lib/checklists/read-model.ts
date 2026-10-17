import type { ChecklistRollup } from './progress';
import type { createClient } from '@/shared/supabase/server';
export async function loadChecklistRollups(db: Awaited<ReturnType<typeof createClient>>, ids: readonly string[]): Promise<Map<string,ChecklistRollup>> {
 if(!ids.length) return new Map();
 const {data,error}=await db.rpc('checklist_rollups',{p_task_ids:[...new Set(ids)]});
 if(error) throw new Error(`Checklist evidence unavailable: ${error.message}`);
 if(!data || typeof data!=='object' || Array.isArray(data)) throw new Error('Checklist evidence unavailable: invalid response.');
 const result=new Map<string,ChecklistRollup>();
 for(const id of ids) {
  const row=data[id];
  if(!row || typeof row!=='object' || Array.isArray(row) || row.contract!=='m05-checklist-v1') throw new Error('Checklist evidence unavailable: missing task result.');
  result.set(id,row as unknown as ChecklistRollup);
 }
 return result;
}
