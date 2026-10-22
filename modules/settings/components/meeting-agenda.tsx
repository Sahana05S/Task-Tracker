import Link from 'next/link';
import { ListOrderedIcon } from 'lucide-react';

import { agendaLines } from '@/modules/settings/client';

const NUMBERED = /^(\d+)[.)]\s+(.*)$/;

/**
 * The company's standing meeting agenda, shown on Meeting points (the sheet's
 * "Regular Meeting Agenda" box). Numbered lines render as an ordered list;
 * anything else keeps its own line. Collapsible, so a reader can fold it away.
 */
export function MeetingAgenda({ agenda, canEdit }: { agenda: string; canEdit: boolean }) {
  const lines = agendaLines(agenda);
  if (lines.length === 0) {
    return canEdit ? (
      <p className="text-muted-foreground text-sm">
        No meeting agenda yet.{' '}
        <Link href="/settings?tab=company#agenda" className="link">
          Add one in Settings
        </Link>
      </p>
    ) : null;
  }
  const heading = !NUMBERED.test(lines[0]) && lines[0].endsWith(':') ? lines[0].slice(0, -1) : null;
  const body = heading ? lines.slice(1) : lines;
  return (
    <details open className="soft-card group p-5 sm:p-6" aria-label="Meeting agenda">
      <summary className="flex cursor-pointer list-none items-center gap-2 [&::-webkit-details-marker]:hidden">
        <ListOrderedIcon className="text-primary size-5 shrink-0" aria-hidden="true" />
        <h2 className="text-foreground text-base font-bold tracking-tight">{heading ?? 'Meeting agenda'}</h2>
        <span className="text-muted-foreground ml-auto text-xs group-open:hidden">Show</span>
        <span className="text-muted-foreground ml-auto hidden text-xs group-open:inline">Hide</span>
      </summary>
      <ol className="mt-3 grid gap-1.5 text-sm sm:grid-cols-2 lg:grid-cols-4">
        {body.map((line, index) => {
          const match = NUMBERED.exec(line);
          return (
            <li key={`${index}:${line}`} className="bg-muted/70 text-foreground flex items-baseline gap-2 rounded-xl px-3 py-2">
              {match ? <span className="text-primary font-mono text-xs font-semibold tabular-nums">{match[1]}</span> : null}
              <span className="min-w-0">{match ? match[2] : line}</span>
            </li>
          );
        })}
      </ol>
      {canEdit ? (
        <Link href="/settings?tab=company#agenda" className="link mt-3 inline-block text-xs">
          Edit agenda
        </Link>
      ) : null}
    </details>
  );
}
