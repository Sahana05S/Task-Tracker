import { codeLabel } from '@/shared/tracker/labels';

type Row = Record<string, unknown>;

/** Keys that identify rather than describe; people read names and tags instead. */
const HIDDEN = /(^id$|_id$|Id$|^version$|_version$|Version$|^organization|^operation|watermark)/;

const shown = (value: unknown) => value === null || ['string', 'number', 'boolean'].includes(typeof value);

/** A cell: codes become words, booleans Yes/No, empty a dash. */
function cell(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'string' && /^[a-z]+(_[a-z0-9]+)+$/.test(value)) return codeLabel(value);
  return String(value);
}

/**
 * Kept evidence rows as a readable table instead of a JSON dump: plain columns
 * only (no ids, no nested objects), headed by their words.
 */
export function EvidenceTable({ rows, label, limit = 50 }: { rows: readonly Row[]; label: string; limit?: number }) {
  if (!rows.length) return <p className="text-muted-foreground text-sm">No {label.toLowerCase()} recorded.</p>;
  const keys = [...new Set(rows.flatMap(row => Object.keys(row)))].filter(key => !HIDDEN.test(key) && rows.some(row => shown(row[key]) && row[key] !== null));
  return (
    <div className="border-border overflow-x-auto rounded-xl border">
      <table className="sheet-grid w-full text-xs">
        <caption className="sr-only">{label}</caption>
        <thead><tr>{keys.map(key => <th key={key} scope="col">{codeLabel(key)}</th>)}</tr></thead>
        <tbody>{rows.slice(0, limit).map((row, index) => <tr key={String(row.id ?? index)}>{keys.map(key => <td key={key} className="max-w-xs break-words">{shown(row[key]) ? cell(row[key]) : '—'}</td>)}</tr>)}</tbody>
      </table>
      {rows.length > limit ? <p className="text-muted-foreground px-3 py-2 text-xs">Showing {limit} of {rows.length}. Download the report for every row.</p> : null}
    </div>
  );
}
