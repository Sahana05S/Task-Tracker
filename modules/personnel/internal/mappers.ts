import type { Json } from '@/types/database';

import { isRecordKind, type RecordKind } from './rules';

/** Personal records rows (migration 78) -> domain model. PRIVATE. */

export interface PersonalDocument {
  readonly id: string;
  readonly kind: RecordKind;
  readonly path: string;
  readonly fileName: string;
  readonly mimeType: string;
  readonly sizeBytes: number;
  readonly uploadedAt: string;
}

export interface PersonalRecords {
  readonly userId: string;
  readonly employeeId: string;
  readonly fullName: string;
  readonly documents: readonly PersonalDocument[];
}

type Row = Record<string, unknown>;
const object = (value: Json | unknown): Row => (typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Row : {});
const list = (value: unknown): Row[] => (Array.isArray(value) ? value.map(object) : []);

export function mapPersonalRecords(data: Json): PersonalRecords {
  const value = object(data);
  return {
    userId: String(value.userId ?? ''),
    employeeId: String(value.employeeId ?? ''),
    fullName: String(value.fullName ?? ''),
    documents: list(value.documents).flatMap(row => {
      const kind = String(row.kind ?? '');
      if (!isRecordKind(kind)) return [];
      return [{
        id: String(row.id),
        kind,
        path: String(row.path),
        fileName: String(row.fileName ?? ''),
        mimeType: String(row.mimeType ?? ''),
        sizeBytes: Number(row.sizeBytes ?? 0),
        uploadedAt: String(row.uploadedAt ?? ''),
      }];
    }),
  };
}

export interface RecordsSummaryRow {
  readonly userId: string;
  readonly employeeId: string;
  readonly fullName: string;
  readonly kinds: readonly string[];
}

/** Every active member with the kinds they have uploaded. */
export function mapRecordsSummary(data: Json): RecordsSummaryRow[] {
  return list(data).map(row => ({
    userId: String(row.userId),
    employeeId: String(row.employeeId ?? ''),
    fullName: String(row.fullName ?? ''),
    kinds: Array.isArray(row.kinds) ? row.kinds.map(String) : [],
  }));
}
