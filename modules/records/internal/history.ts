import { USER_COLUMNS } from '@/shared/supabase/mappers';
import { createClient } from '@/shared/supabase/server';
import { mapRecordRevision, type RecordRevision } from './revisions';

/** Retained revision history of one dated record. PRIVATE. */

export const RECORD_KINDS = ['attendance', 'fact', 'idea', 'suggestion', 'sale', 'meeting'] as const;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** True when `kind` and `id` can name a dated record. */
export function isRecordReference(kind: string, id: string): boolean {
  return (RECORD_KINDS as readonly string[]).includes(kind) && UUID.test(id);
}

/** Loads a record's revisions, oldest first. Throws when either read fails. */
export async function getRecordHistory(kind: string, id: string): Promise<RecordRevision[]> {
  const db = await createClient();
  const [{ data, error }, members] = await Promise.all([
    db.rpc('dated_record_history', { p_kind: kind, p_id: id }),
    db.from('users').select(USER_COLUMNS),
  ]);
  if (error) throw new Error(`Record history unavailable: ${error.message}`);
  if (members.error) throw new Error(`History attribution unavailable: ${members.error.message}`);
  if (!Array.isArray(data)) throw new Error('Record history unavailable: invalid response.');
  const names = new Map(members.data.map((member) => [member.id, member.full_name]));
  return data.map((entry) => mapRecordRevision(entry, kind, names));
}
