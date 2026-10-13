import type { Json } from '@/types/database';
export function parseTaskCredits(value: Json): Map<string, Record<string, number>> {
 if (!Array.isArray(value)) throw new Error('Missing prospective credit summary.');
 const byTask=new Map<string,Record<string,number>>();
 for (const row of value) {
  if (!row || typeof row !== 'object' || Array.isArray(row) || typeof row.task_id!=='string' || typeof row.user_id!=='string' || typeof row.scaled_credit!=='number' || !Number.isFinite(row.scaled_credit)) throw new Error('Invalid prospective credit summary.');
  const credits=byTask.get(row.task_id) ?? {}; credits[row.user_id]=row.scaled_credit; byTask.set(row.task_id,credits);
 }
 return byTask;
}
