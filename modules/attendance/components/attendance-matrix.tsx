'use client';

import { useMemo, useState } from 'react';

import type { AttendanceMatrixModel, MatrixCell, MatrixRow } from '@/modules/attendance/client';
import { ATTENDANCE_STATUSES } from '@/shared/tracker/enums';
import { formatHours } from '@/shared/tracker/format';
import { codeLabels } from '@/shared/tracker/labels';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/shared/ui/sheet';
import { cn } from '@/shared/utils';
import { AttendanceCellEditor } from './attendance-cell-editor';
import { STATUS_STYLE } from './attendance-status-style';

const LONG_DATE = new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
const longDate = (date: string) => LONG_DATE.format(new Date(`${date}T00:00:00Z`));
/** 8 rather than 8.00 inside a small cell. */
const compactHours = (hours: number) => String(Number(hours.toFixed(2)));

/** What a cell says, for its accessible name and the editor's description. */
function cellSummary(cell: MatrixCell): string {
  if (cell.kind === 'future') return 'Not yet';
  if (!cell.status) return cell.withdrawn ? 'Withdrawn, needs a record' : 'Not recorded';
  const hours = cell.attendanceHours === null ? 'hours need confirming'
    : `${formatHours(cell.attendanceHours)} h${cell.offHours ? ` + ${formatHours(cell.offHours)} h off-hours` : ''}`;
  const check = cell.check === 'fails' ? `. ${codeLabels(cell.reasons)}` : '';
  return `${cell.status}, ${hours}${check}`;
}

function Cell({ cell, name, editable, onOpen }: { cell: MatrixCell; name: string; editable: boolean; onOpen: () => void }) {
  const style = cell.status ? STATUS_STYLE[cell.status] : null;
  const hours = cell.status === 'Present' || cell.status === 'Half Day' ? cell.attendanceHours : cell.status === 'Off Hours' || cell.status === 'Holiday' ? cell.offHours || null : null;
  const missing = cell.kind === 'past' && !cell.status;
  const open = cell.kind === 'today' && !cell.status;
  const content = (
    <>
      {style ? <span className="text-[10px] leading-none font-bold tracking-wide">{style.mark}</span> : <span aria-hidden="true">{missing ? '–' : open ? '+' : ''}</span>}
      {hours !== null && hours !== undefined ? <span className="text-xs leading-none font-semibold tabular-nums">{compactHours(hours)}</span> : null}
      {cell.check === 'fails' ? <span className="bg-danger absolute top-1 right-1 size-1.5 rounded-full" aria-hidden="true" /> : null}
      {cell.status && cell.attendanceHours === null ? <span className="bg-recognition absolute top-1 right-1 size-1.5 rounded-full" aria-hidden="true" /> : null}
    </>
  );
  const className = cn(
    'relative grid h-11 w-full min-w-9 place-content-center justify-items-center gap-0.5 rounded-lg text-center',
    style?.cell,
    missing && 'border-danger-border text-muted-foreground border border-dashed bg-white',
    open && 'border-primary/40 text-primary border border-dashed bg-white',
    cell.kind === 'future' && 'bg-muted/40',
    cell.check === 'fails' && 'ring-danger/60 ring-1 ring-inset',
  );
  if (!editable || cell.kind === 'future') {
    return <div className={className} aria-label={`${name}, ${longDate(cell.date)}: ${cellSummary(cell)}`} role="img">{content}</div>;
  }
  return (
    <button type="button" onClick={onOpen} className={cn(className, 'hover:ring-primary/50 focus-visible:ring-ring cursor-pointer outline-none hover:ring-2 focus-visible:ring-2')}
      aria-label={`${name}, ${longDate(cell.date)}: ${cellSummary(cell)}. Edit`}>
      {content}
    </button>
  );
}

/**
 * Members by days for one month: status colour and mark, hours, and a red dot
 * where logged time is more than attendance. Click a day to record or correct
 * it. One person (a member viewing their own) sees a calendar instead.
 */
export function AttendanceMatrix({ model, editable }: { model: AttendanceMatrixModel; editable: readonly string[] }) {
  const canEdit = (memberId: string) => editable.includes(memberId);
  const [open, setOpen] = useState<{ row: MatrixRow; cell: MatrixCell } | null>(null);
  const counts = useMemo(() => {
    const tally = new Map<string, number>();
    for (const row of model.rows) for (const cell of row.cells) if (cell.status) tally.set(cell.status, (tally.get(cell.status) ?? 0) + 1);
    return tally;
  }, [model]);
  const missing = model.rows.reduce((sum, row) => sum + row.missing, 0);
  const single = model.rows.length === 1;

  return (
    <>
      <ul className="flex flex-wrap gap-1.5 text-xs" aria-label="Legend and counts this month">
        {ATTENDANCE_STATUSES.map(status => (
          <li key={status} className={cn('inline-flex items-center gap-1.5 rounded-full py-1 pr-2.5 pl-1', STATUS_STYLE[status].cell)}>
            <span className="grid min-w-6 place-items-center rounded-full bg-white/70 px-1 text-[10px] font-bold">{STATUS_STYLE[status].mark}</span>
            {status}<span className="font-semibold tabular-nums">{counts.get(status) ?? 0}</span>
          </li>
        ))}
        <li className="border-danger-border text-danger-foreground inline-flex items-center gap-1.5 rounded-full border border-dashed bg-white px-2.5 py-1">
          Not recorded<span className="font-semibold tabular-nums">{missing}</span>
        </li>
        <li className="text-muted-foreground inline-flex items-center gap-1.5 px-1 py-1">
          <span className="bg-danger size-1.5 rounded-full" aria-hidden="true" />More time logged than attended
        </li>
      </ul>

      {single ? (
        <CalendarView row={model.rows[0]} model={model} editable={canEdit(model.rows[0].member.id)} onOpen={cell => setOpen({ row: model.rows[0], cell })} />
      ) : (
        <div className="border-border overflow-x-auto rounded-xl border" tabIndex={0} role="region" aria-label={`Attendance for ${model.rows.length} members`}>
          <table className="w-max min-w-full border-separate border-spacing-0 text-sm">
            <thead>
              <tr>
                <th scope="col" className="bg-card border-border sticky left-0 z-10 min-w-36 border-r border-b px-3 py-2 text-left text-xs font-semibold">Member</th>
                {model.days.map(day => (
                  <th key={day.date} scope="col" className={cn('border-border border-b px-0.5 py-1.5 text-center text-[11px] font-medium', day.weekend && 'bg-muted/60', day.kind === 'today' && 'bg-primary-subtle text-primary-subtle-foreground')}>
                    <abbr title={longDate(day.date)} className="no-underline">
                      <span className="text-muted-foreground block">{day.weekday.slice(0, 2)}</span>
                      <span className="block font-semibold tabular-nums">{day.day}</span>
                    </abbr>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {model.rows.map(row => (
                <tr key={row.member.id}>
                  <th scope="row" className="bg-card border-border sticky left-0 z-10 border-r border-b px-3 py-1.5 text-left font-medium">
                    <span className="block max-w-40 truncate">{row.member.fullName}</span>
                    <span className={cn('block text-xs font-normal', row.missing ? 'text-danger-foreground' : 'text-muted-foreground')}>{row.missing ? `${row.missing} not recorded` : 'All recorded'}</span>
                  </th>
                  {row.cells.map((cell, index) => (
                    <td key={cell.date} className={cn('border-border border-b p-0.5', model.days[index].weekend && 'bg-muted/40')}>
                      <Cell cell={cell} name={row.member.fullName} editable={canEdit(row.member.id)} onOpen={() => setOpen({ row, cell })} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Sheet open={open !== null} onOpenChange={next => { if (!next) setOpen(null); }}>
        <SheetContent side="right" className="w-full gap-0 overflow-y-auto sm:max-w-md">
          {open ? (
            <>
              <SheetHeader className="pr-12">
                <SheetTitle className="text-foreground text-lg font-bold tracking-tight">{open.row.member.fullName}</SheetTitle>
                <SheetDescription className="text-muted-foreground">{longDate(open.cell.date)} · {cellSummary(open.cell)}</SheetDescription>
              </SheetHeader>
              <div className="px-5 py-5">
                <AttendanceCellEditor key={`${open.row.member.id}:${open.cell.date}:${open.cell.version}`} memberId={open.row.member.id} cell={open.cell} onSaved={() => setOpen(null)} />
              </div>
            </>
          ) : null}
        </SheetContent>
      </Sheet>
    </>
  );
}

/** One person's month as a Monday-first calendar. */
function CalendarView({ row, model, editable, onOpen }: { row: MatrixRow; model: AttendanceMatrixModel; editable: boolean; onOpen: (cell: MatrixCell) => void }) {
  const lead = (new Date(`${model.days[0].date}T00:00:00Z`).getUTCDay() + 6) % 7;
  return (
    <div className="grid grid-cols-7 gap-1.5" role="grid" aria-label={`${row.member.fullName}'s attendance`}>
      {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(day => <div key={day} role="columnheader" className="text-muted-foreground text-center text-xs font-medium">{day}</div>)}
      {Array.from({ length: lead }, (_, index) => <div key={`lead-${index}`} aria-hidden="true" />)}
      {row.cells.map((cell, index) => (
        <div key={cell.date} role="gridcell" className="grid gap-0.5">
          <span className={cn('text-center text-[11px] tabular-nums', model.days[index].kind === 'today' ? 'text-primary font-bold' : 'text-muted-foreground')}>{model.days[index].day}</span>
          <Cell cell={cell} name={row.member.fullName} editable={editable} onOpen={() => onOpen(cell)} />
        </div>
      ))}
    </div>
  );
}
