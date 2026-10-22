import { codeLabel } from '@/shared/tracker/labels';
import type { Json } from '@/types/database';

/** Pure mapping of `dated_record_history` rows into readable revisions. PRIVATE. */

export interface RecordRevision {
  version: string;
  /** What happened, in words ("Recorded", "Corrected", …). */
  action: string;
  /** When the revision was observed (ISO timestamp), or null when unknown. */
  recordedAt: string | null;
  /** The business date the record is about (YYYY-MM-DD), or null. */
  businessDate: string | null;
  author: string;
  reviewState: string;
  validator: string;
  validatedAt: string | null;
  text: string | null;
  attendance: { hours: number | string | null; offHours: number | string | null; measured: boolean } | null;
  reason: string | null;
  /** The baseline captured when history began; earlier timing is unknown. */
  isLegacyBaseline: boolean;
}

type JsonObject = Record<string, Json | undefined>;

const ACTIONS: Record<string, string> = {
  save: 'Recorded',
  correct: 'Corrected',
  validate: 'Reviewed',
  withdraw: 'Withdrawn',
  legacy_current_baseline: 'Carried over from before history began',
};


const BUSINESS_DATE_KEYS = ['attendance_date', 'fact_date', 'idea_date', 'suggestion_date', 'sale_date', 'meeting_date'] as const;
const AUTHOR_KEYS = ['user_id', 'posted_by', 'sales_by'] as const;
const TEXT_KEYS = ['fact', 'idea', 'suggestion', 'point', 'notes'] as const;

const asObject = (value: Json | undefined): JsonObject =>
  value && typeof value === 'object' && !Array.isArray(value) ? value : {};
const asText = (value: Json | undefined): string | null => (typeof value === 'string' && value ? value : null);
const firstText = (source: JsonObject, keys: readonly string[]) => keys.map(key => asText(source[key])).find(Boolean) ?? null;
const hoursValue = (value: Json | undefined) => (typeof value === 'number' || typeof value === 'string' ? value : null);

/** Words for a stored code: a known label, or the code made readable. */
function label(map: Record<string, string>, code: string | null, fallback: string): string {
  if (!code) return fallback;
  return map[code] ?? code.replaceAll('_', ' ').replace(/^\w/, letter => letter.toUpperCase());
}

export function mapRecordRevision(entry: Json, kind: string, names: ReadonlyMap<string, string>): RecordRevision {
  const revision = asObject(entry);
  const source = asObject(revision.source);
  const command = asText(revision.command);
  const authorId = firstText(source, AUTHOR_KEYS);
  const validatorId = asText(source.validated_by);
  return {
    version: String(revision.version ?? '—'),
    action: label(ACTIONS, command, 'Changed'),
    recordedAt: asText(revision.recordedAt),
    businessDate: firstText(source, BUSINESS_DATE_KEYS),
    author: (authorId && names.get(authorId)) ?? 'Not recorded',
    reviewState: codeLabel(asText(source.validation_state) ?? asText(source.record_state), 'Not recorded'),
    validator: (validatorId && names.get(validatorId)) ?? 'Not recorded',
    validatedAt: asText(source.validation_at),
    text: firstText(source, TEXT_KEYS),
    attendance: kind === 'attendance'
      ? { hours: hoursValue(source.attendance_hours), offHours: hoursValue(source.off_hours), measured: source.hours_confirmed === true }
      : null,
    reason: asText(revision.reason),
    isLegacyBaseline: command === 'legacy_current_baseline',
  };
}
