import { createClient } from '@/shared/supabase/server';
import type { Json } from '@/types/database';

/** Legacy participant reconciliation preview (read-only). PRIVATE. */

export interface ReconciliationParticipant {
  userId: string;
  shareUnits: number | null;
}

export interface ReconciliationTask {
  taskId: string;
  taskTag: string;
  mode: string;
  version: string;
  legacyPrimary: string;
  participants: ReconciliationParticipant[];
}

function object(value: Json): { [key: string]: Json | undefined } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid reconciliation response.');
  return value;
}

function toTask(value: Json): ReconciliationTask {
  const row = object(value);
  if (typeof row.task_id !== 'string' || typeof row.task_tag !== 'string' || typeof row.legacy_primary !== 'string' || !Array.isArray(row.participants)) {
    throw new Error('Invalid reconciliation task.');
  }
  const participants = row.participants.map(object).map((participant) => {
    if (typeof participant.user_id !== 'string') throw new Error('Invalid participant identity.');
    return {
      userId: participant.user_id,
      shareUnits: typeof participant.share_units === 'number' ? participant.share_units : null,
    };
  });
  return {
    taskId: row.task_id,
    taskTag: row.task_tag,
    mode: String(row.mode),
    version: String(row.version),
    legacyPrimary: row.legacy_primary,
    participants,
  };
}

/** Tasks whose legacy participants still need converting to explicit shares. Throws on a bad response. */
export async function getParticipantReconciliation(): Promise<ReconciliationTask[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('participant_reconciliation');
  if (error) throw new Error(error.message);
  if (!Array.isArray(data)) throw new Error('Missing participant reconciliation.');
  return data.map(toTask);
}
