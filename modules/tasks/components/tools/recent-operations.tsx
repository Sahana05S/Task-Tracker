import Link from 'next/link';
import { ArrowRightIcon, HistoryIcon } from 'lucide-react';

import type { RecentOperationKind, RecentToolOperation } from '@/modules/tasks/internal/tools/recent';
import { EmptyState } from '@/shared/ui/mission-ui';
import { formatDate, formatDateTime } from '@/shared/tracker/format';
import { missionCount } from '@/modules/tasks/components/tools/operations';

const KIND_LABELS: Record<RecentOperationKind, string> = {
  copy: 'Copy',
  support: 'Support split',
  carryover: 'Carryover',
  archive: 'Archive',
};

const TAGS_SHOWN = 8;

/** Copies carry a timestamp; archives only the IST date they took effect. */
function when(operation: RecentToolOperation): string {
  return operation.kind === 'archive' ? formatDate(operation.at) : formatDateTime(operation.at);
}

function tagHref(taskTag: string): string {
  return `/tasks/${encodeURIComponent(taskTag)}`;
}

/**
 * Recent Task Tools operations, newest first, each linking to the missions it
 * created or archived. Server-rendered; the operations themselves run from the
 * Missions page.
 */
export function RecentOperations({ operations }: { operations: readonly RecentToolOperation[] | null }) {
  if (operations === null) {
    return (
      <p role="status" className="text-danger text-sm">
        Recent operations could not be loaded. Reload the page to try again.
      </p>
    );
  }
  if (operations.length === 0) {
    return (
      <EmptyState icon={HistoryIcon} title="No copies or archives yet">
        Select missions in the Missions table, or open a mission&apos;s menu, to run one.
      </EmptyState>
    );
  }
  return (
    <ol className="divide-border grid divide-y">
      {operations.map((operation) => (
        <li key={operation.key} className="grid gap-1.5 py-3 first:pt-0 last:pb-0">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-sm">
            <span className="badge-soft badge-neutral">{KIND_LABELS[operation.kind]}</span>
            {operation.source ? (
              <>
                <Link href={tagHref(operation.source.taskTag)} className="task-tag link" title={operation.source.title}>
                  {operation.source.taskTag}
                </Link>
                <ArrowRightIcon className="text-muted-foreground size-3.5 self-center" aria-hidden="true" />
                <span className="sr-only">created</span>
              </>
            ) : null}
            <span className="text-foreground font-medium">{missionCount(operation.tasks.length)}</span>
            <span className="text-muted-foreground ml-auto text-xs whitespace-nowrap">
              {when(operation)}
              {operation.actorName ? ` · ${operation.actorName}` : ''}
            </span>
          </div>
          <ul className="flex flex-wrap gap-1.5" aria-label={operation.kind === 'archive' ? 'Archived missions' : 'Created missions'}>
            {operation.tasks.slice(0, TAGS_SHOWN).map((task) => (
              <li key={task.taskTag}>
                <Link href={tagHref(task.taskTag)} className="badge-soft badge-accent task-tag hover:underline" title={task.title}>
                  {task.taskTag}
                </Link>
              </li>
            ))}
            {operation.tasks.length > TAGS_SHOWN ? (
              <li className="text-muted-foreground self-center text-xs">+{operation.tasks.length - TAGS_SHOWN} more</li>
            ) : null}
          </ul>
          {operation.reason ? <p className="text-muted-foreground text-xs">Reason: {operation.reason}</p> : null}
        </li>
      ))}
    </ol>
  );
}
