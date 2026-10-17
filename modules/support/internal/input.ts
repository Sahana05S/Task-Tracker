import {
  ISO_DATE_PATTERN,
  readNullableString,
  readString,
  UUID_PATTERN,
} from '@/shared/forms/form-data';
import type { ReportStatus } from '@/types/tracker';

export type Parsed<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: string };

/** Report snapshot fields from the report form; `id` is null for a new report. */
export interface ReportSnapshotInput {
  readonly id: string | null;
  readonly title: string;
  readonly reportType: string;
  readonly status: ReportStatus;
  readonly periodStart: string | null;
  readonly periodEnd: string | null;
  readonly employeeId: string | null;
  readonly summary: string | null;
  readonly folderUrl: string | null;
}

export function parseReportSnapshotInput(formData: FormData): Parsed<ReportSnapshotInput> {
  const id = readUuid(formData, 'id');
  const title = readString(formData, 'title');
  const reportType = readString(formData, 'reportType');
  const status = readReportStatus(formData);
  if (title.length < 2 || reportType.length < 2) {
    return { ok: false, error: 'Enter a report title and type.' };
  }
  if (!status) return { ok: false, error: 'Select a valid report status.' };

  return {
    ok: true,
    value: {
      id,
      title,
      reportType,
      status,
      periodStart: readNullableDate(formData, 'periodStart'),
      periodEnd: readNullableDate(formData, 'periodEnd'),
      employeeId: readUuid(formData, 'employeeId'),
      summary: readNullableString(formData, 'summary'),
      folderUrl: readNullableString(formData, 'folderUrl'),
    },
  };
}

export function parseReportSnapshotId(formData: FormData): Parsed<string> {
  const id = readUuid(formData, 'id');
  return id ? { ok: true, value: id } : { ok: false, error: 'Missing report.' };
}

function readUuid(formData: FormData, key: string): string | null {
  const value = readString(formData, key);
  return UUID_PATTERN.test(value) ? value : null;
}

function readNullableDate(formData: FormData, key: string): string | null {
  const value = readString(formData, key);
  return value === '' ? null : ISO_DATE_PATTERN.test(value) ? value : null;
}

function readReportStatus(formData: FormData): ReportStatus | null {
  const value = readString(formData, 'status');
  return value === 'Draft' || value === 'Final' ? value : null;
}
