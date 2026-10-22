import { HistoryIcon } from 'lucide-react';

import { EmptyState } from '@/shared/ui/mission-ui';
import { formatDate, formatDateTime, formatHours } from '@/shared/tracker/format';
import type { RecordRevision } from '../internal/revisions';

/** A record's retained revisions, newest first, each as a small fact sheet. */
export function RecordHistory({ revisions }: { revisions: readonly RecordRevision[] }) {
  if (!revisions.length) return <EmptyState>No revisions are recorded for this record.</EmptyState>;
  return (
    <ol className="grid gap-3">
      {[...revisions].reverse().map((revision, index) => (
        <li key={`${revision.version}:${index}`} className="soft-card grid gap-3 p-5">
          <h2 className="text-foreground flex flex-wrap items-center gap-2 text-base font-bold tracking-tight">
            <HistoryIcon className="text-primary size-4" aria-hidden="true" />
            Revision {revision.version} · {revision.action}
          </h2>
          <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
            <Fact label="Saved" value={formatDateTime(revision.recordedAt)} />
            <Fact label="For the day" value={formatDate(revision.businessDate)} />
            <Fact label="Attributed to" value={revision.author} />
            <Fact label="Review" value={revision.reviewState} />
            <Fact label="Reviewed by" value={revision.validator} />
            <Fact label="Reviewed at" value={formatDateTime(revision.validatedAt)} />
            {revision.attendance ? (
              <>
                <Fact label="Attendance" value={`${formatHours(revision.attendance.hours)} h`} />
                <Fact label="Off hours" value={`${formatHours(revision.attendance.offHours)} h${revision.attendance.measured ? '' : ' · not confirmed as measured'}`} />
              </>
            ) : null}
          </dl>
          {revision.text ? <p className="text-foreground text-sm whitespace-pre-wrap">{revision.text}</p> : null}
          {revision.reason ? <p className="text-muted-foreground text-sm">Reason: {revision.reason}</p> : null}
          {revision.isLegacyBaseline ? (
            <p className="text-muted-foreground text-sm">This copies the record as it stood when history began; when it was first reviewed or corrected is not known.</p>
          ) : null}
        </li>
      ))}
    </ol>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <dt className="text-muted-foreground text-xs font-medium">{label}</dt>
      <dd className="text-foreground break-words">{value}</dd>
    </div>
  );
}
