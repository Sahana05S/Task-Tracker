import 'server-only';

import { fileViewHref } from '@/modules/files/client';
import { createClient } from '@/shared/supabase/server';
import { isMissingFunctionError } from '@/shared/supabase/schema-errors';

import { mapPersonalRecords, mapRecordsSummary, type PersonalRecords, type RecordsSummaryRow } from './mappers';
import { RECORDS_BUCKET } from './rules';

/**
 * Personal records reads (migration 78). PRIVATE. `personal_records` gives a
 * member their own and the managing director anyone's; `unavailable` means the
 * database predates 78.
 */

export type RecordsRead<T> = { ok: true; data: T } | { ok: false; reason: 'unavailable' | 'forbidden' | 'not_found'; error: string };

function failure(error: { code?: string; message: string }): RecordsRead<never> {
  if (isMissingFunctionError(error)) return { ok: false, reason: 'unavailable', error: 'Personal records need the latest database update (migration 78).' };
  if (error.code === '42501') return { ok: false, reason: 'forbidden', error: 'Only the person and the managing director can see these records.' };
  if (error.code === 'P0002') return { ok: false, reason: 'not_found', error: error.message };
  throw new Error(`Personal records could not be loaded: ${error.message}`);
}

export interface PersonalRecordsView extends PersonalRecords {
  /** Viewing links by record id: the app's file route, which checks permission on every open (migration 100). */
  readonly links: Readonly<Record<string, string>>;
}

export async function readPersonalRecords(userId: string): Promise<RecordsRead<PersonalRecordsView>> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('personal_records', { p_user: userId });
  if (error) return failure(error);
  const records = mapPersonalRecords(data);
  const links: Record<string, string> = {};
  for (const document of records.documents) links[document.id] = fileViewHref(RECORDS_BUCKET, document.path);
  return { ok: true, data: { ...records, links } };
}

/** Every active member's uploaded kinds (managing director only); null when it can't be read. */
export async function readRecordsSummary(): Promise<RecordsSummaryRow[] | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('personal_records_summary');
  return error ? null : mapRecordsSummary(data);
}

/** The kinds the signed-in member has uploaded; null before migration 78 or when it can't be read. */
export async function readOwnRecordKinds(userId: string): Promise<string[] | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('personal_records', { p_user: userId });
  if (error) return null;
  return [...new Set(mapPersonalRecords(data).documents.map(document => document.kind))];
}
