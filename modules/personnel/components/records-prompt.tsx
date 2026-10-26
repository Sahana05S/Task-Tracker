import Link from 'next/link';
import { IdCardIcon } from 'lucide-react';

import { readOwnRecordKinds } from '@/modules/personnel/internal/queries';
import { RECORD_KIND_LABELS, recordProgress } from '@/modules/personnel/internal/rules';

/**
 * Today's reminder to set up Personal info: shown until all four records are
 * uploaded. Hidden when the database predates migration 78.
 */
export async function RecordsPrompt({ userId, employeeId }: { userId: string; employeeId: string }) {
  const kinds = await readOwnRecordKinds(userId);
  if (!kinds) return null;
  const progress = recordProgress(kinds);
  if (progress.complete) return null;
  return (
    <div className="border-border bg-card mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-3">
      <div className="flex min-w-0 items-start gap-3">
        <IdCardIcon aria-hidden="true" className="text-primary mt-0.5 size-5 shrink-0" />
        <div className="min-w-0">
          <p className="text-foreground text-sm font-semibold">Set up your personal info</p>
          <p className="text-muted-foreground text-xs">
            {progress.done} of {progress.total} uploaded. Still needed: {progress.missing.map(kind => RECORD_KIND_LABELS[kind]).join(', ')}.
          </p>
        </div>
      </div>
      <Link
        href={`/team/${encodeURIComponent(employeeId)}/personal`}
        className="bg-primary text-primary-foreground hover:bg-primary-hover focus-visible:outline-primary inline-flex min-h-10 items-center rounded-full px-4 text-sm font-semibold"
      >
        Upload records
      </Link>
    </div>
  );
}
