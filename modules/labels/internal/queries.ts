import 'server-only';

import { createClient } from '@/shared/supabase/server';

import { mapCatalogue, mapLabelled, mapLabelsFor, type Label, type LabelCatalogue, type LabelledRecords, type LabelSubjectKind } from './rules';

/**
 * Label reads (migration 112). PRIVATE. Each returns null (or an empty map)
 * when the database predates 112 or the read fails, so pages render without
 * labels instead of breaking.
 */

export async function getLabelCatalogue(): Promise<LabelCatalogue | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('label_catalogue');
  return error ? null : mapCatalogue(data);
}

/** Labels on readable records of one kind, by record id. */
export async function getLabelsFor(kind: LabelSubjectKind, ids: readonly string[]): Promise<Record<string, Label[]> | null> {
  if (!ids.length) return {};
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('labels_for', { p_kind: kind, p_ids: [...new Set(ids)].slice(0, 1000) });
  return error ? null : mapLabelsFor(data);
}

/** One label and the records carrying it that the caller may read; null when there is no such label. */
export async function getLabelled(slug: string): Promise<LabelledRecords | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('labelled', { p_slug: slug });
  return error ? null : mapLabelled(data);
}
