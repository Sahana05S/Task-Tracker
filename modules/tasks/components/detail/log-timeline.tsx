import { LinkIcon } from 'lucide-react';

import { InitialsAvatar } from '@/shared/ui/mission-ui';
import { formatDate, formatHours } from '@/shared/tracker/format';
import type { DailyTaskLog } from '@/types/tracker';

/** The effort log entries recorded against a mission, newest first. */

export function TaskLogTimeline({
  logs,
  memberNames,
}: {
  logs: readonly DailyTaskLog[];
  memberNames: ReadonlyMap<string, string>;
}) {
  if (logs.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        No effort has been logged for this mission yet.
      </p>
    );
  }

  return (
    <ol className="grid gap-4">
      {logs.map((log, index) => {
        const name = memberNames.get(log.userId) ?? 'Unknown';
        return (
          <li key={log.id} className="flex gap-3">
            <InitialsAvatar name={name} tone={index} />
            <div className="min-w-0 flex-1">
              <p className="text-sm">
                <span className="text-foreground font-semibold">{name}</span>{' '}
                <span className="text-muted-foreground">logged</span>{' '}
                <span className="text-foreground font-semibold tabular-nums">{formatHours(log.hoursWorked)} h</span>
              </p>
              <p className="text-muted-foreground text-xs">
                {formatDate(log.logDate)} · {log.logSource}
              </p>
              {log.updateNotes ? (
                <p className="bg-muted/70 text-foreground mt-2 rounded-xl px-3.5 py-2.5 text-sm whitespace-pre-wrap">
                  {log.updateNotes}
                </p>
              ) : null}
              {log.rawLinks && log.rawLinks.length > 0 ? (
                <p className="mt-1.5 flex flex-wrap gap-3 text-xs">
                  {log.rawLinks.map((rawLink, linkIndex) => (
                    <a
                      key={rawLink}
                      href={rawLink}
                      target="_blank"
                      rel="noreferrer"
                      className="text-primary inline-flex items-center gap-1 font-semibold hover:underline"
                    >
                      <LinkIcon className="size-3" aria-hidden="true" />
                      Link {log.rawLinks!.length > 1 ? linkIndex + 1 : ''}
                    </a>
                  ))}
                </p>
              ) : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
