import Link from 'next/link';
import { TriangleAlertIcon } from 'lucide-react';
import { GAP_SENTENCE, type DataGap } from '@/modules/reports/client';

/**
 * One plain-language notice for an incomplete month. It replaces the raw reason
 * codes at the top of the dashboard; the codes stay in "Calculation details".
 * It never claims completeness: if the calculation is incomplete it is shown.
 */
export function DataStatusBanner({periodLabel,gaps,attendanceMissing,canRecordAttendance,historyFrom}:{
  periodLabel: string;
  gaps: readonly DataGap[];
  attendanceMissing: { missing: number; total: number } | null;
  canRecordAttendance: boolean;
  historyFrom: string | null;
}) {
  return (
    <section role="status" aria-label="Data status" className="border-attention-border bg-attention-subtle text-attention-foreground rounded-2xl border px-4 py-3.5 sm:px-5">
      <h2 className="flex items-center gap-2 text-sm font-bold">
        <TriangleAlertIcon className="size-4 shrink-0" aria-hidden="true" />
        {periodLabel} figures are not final
      </h2>
      <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm">
        {gaps.map(gap => (
          <li key={gap}>
            {GAP_SENTENCE[gap]}
            {gap === 'attendance' && attendanceMissing && attendanceMissing.missing > 0
              ? ` ${attendanceMissing.missing} of ${attendanceMissing.total} members have days without attendance.`
              : ''}
          </li>
        ))}
        {gaps.length === 0 ? <li>Some required inputs are not available yet.</li> : null}
        {historyFrom ? <li>Detailed history is only available from {historyFrom}.</li> : null}
      </ul>
      <p className="mt-1.5 text-sm">
        Scores, rankings and awards stay unavailable until then. Partial figures below are labelled.
      </p>
      <div className="mt-2 flex flex-wrap gap-3 text-sm font-medium">
        {canRecordAttendance && gaps.includes('attendance') ? (
          <Link href="/attendance" className="underline underline-offset-2">Record attendance</Link>
        ) : null}
        <a href="#calculation-details" className="underline underline-offset-2">What&apos;s missing</a>
      </div>
    </section>
  );
}
