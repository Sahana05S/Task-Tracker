'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ClockIcon, HistoryIcon } from 'lucide-react';

import { saveAttendanceRecord } from '@/modules/attendance/actions';
import { cellCommand, cellValues, hoursBetween, statusHours, withStatus, type CellValues, type MatrixCell } from '@/modules/attendance/client';
import { ATTENDANCE_STATUSES } from '@/shared/tracker/enums';
import { formatHours } from '@/shared/tracker/format';
import { ATTENDANCE_STATUS_MEANINGS, codeLabel, codeMeaning } from '@/shared/tracker/labels';
import { kolkataTime } from '@/shared/time/kolkata';
import { Button } from '@/shared/ui/button';
import { ExecutionForm } from '@/shared/ui/execution-form';
import { Field } from '@/shared/ui/form-field';
import { HelpTip } from '@/shared/ui/help-tip';
import { cn } from '@/shared/utils';
import { STATUS_STYLE } from './attendance-status-style';
import { CheckInEvidence } from './check-in-evidence';

/**
 * Record or correct one member's day. The visible controls hold state; the
 * hidden fields are exactly `cellCommand`, so what is sent is what the tests
 * check. The database still validates hours against the status and the
 * check-in pair, and refuses a day that already has a record.
 */
export function AttendanceCellEditor({ memberId, cell, onSaved }: { memberId: string; cell: MatrixCell; onSaved: () => void }) {
  const [values, setValues] = useState<CellValues>(() => cellValues(cell));
  const set = (patch: Partial<CellValues>) => setValues(current => ({ ...current, ...patch }));
  // Check times must cover the regular hours, so a pair shorter than the hours lowers them to fit.
  const setTimes = (patch: Pick<Partial<CellValues>, 'checkIn' | 'checkOut'>) => setValues(current => {
    const next = { ...current, ...patch };
    const span = hoursBetween(next.checkIn, next.checkOut);
    return span !== null && Number(next.attendanceHours) > span ? { ...next, attendanceHours: String(span) } : next;
  });
  const timed = hoursBetween(values.checkIn, values.checkOut);
  const { regular: regularAllowed, off: offAllowed } = statusHours(values.status);
  const correcting = Boolean(cell.recordId);
  const id = (name: string) => `attendance-${cell.date}-${name}`;
  // "No attendance recorded" is why the editor is open; only the other reasons need saying.
  const reasons = [...new Set(cell.reasons)].filter(reason => reason !== 'attendance_missing');
  const logged = cell.effortHours ? `${formatHours(cell.effortHours)} h logged on missions this day.` : null;

  return (
    <ExecutionForm action={saveAttendanceRecord} scope={`attendance:${memberId}:${cell.date}`} className="grid gap-4" onSuccess={onSaved}>
      {Object.entries(cellCommand(memberId, cell, values)).map(([name, value]) => <input key={name} type="hidden" name={name} value={value} />)}
      {reasons.length ? (
        <div className="bg-attention-subtle text-attention-foreground grid gap-0.5 rounded-xl px-3 py-2 text-sm">
          {reasons.map(reason => <p key={reason}><span className="font-semibold">{codeLabel(reason)}.</span> {codeMeaning(reason)}</p>)}
          {logged ? <p>{logged}</p> : null}
        </div>
      ) : logged ? <p className="text-muted-foreground text-sm">{logged}</p> : null}
      {cell.checkIns.length ? <CheckInEvidence memberId={memberId} date={cell.date} marks={cell.checkIns} /> : null}
      <fieldset className="grid gap-2">
        <legend className="text-foreground mb-2 text-sm font-medium">Status</legend>
        <div className="grid grid-cols-3 gap-1.5">
          {ATTENDANCE_STATUSES.map(status => (
            <label key={status} className={cn('has-[:focus-visible]:ring-ring flex min-h-11 cursor-pointer items-center justify-center rounded-xl border px-2 text-center text-sm font-semibold has-[:focus-visible]:ring-2',
              values.status === status ? cn(STATUS_STYLE[status].cell, 'border-current') : 'border-border text-muted-foreground hover:bg-muted')}>
              <input type="radio" name={id('status')} value={status} checked={values.status === status} onChange={() => setValues(current => withStatus(current, status))} className="sr-only" />
              {status}
            </label>
          ))}
        </div>
        <p className="text-muted-foreground text-xs">{ATTENDANCE_STATUS_MEANINGS[values.status]}</p>
      </fieldset>
      <div className="grid grid-cols-2 gap-3">
        <Field id={id('in')} label="Check-in">
          <div className="flex gap-1.5">
            <input id={id('in')} type="time" className="field min-w-0 flex-1" value={values.checkIn} onChange={event => setTimes({ checkIn: event.target.value })} />
            {cell.kind === 'today' ? <Button type="button" variant="outline" size="sm" className="h-auto" onClick={() => setTimes({ checkIn: kolkataTime(new Date()) })} aria-label="Check in now">Now</Button> : null}
          </div>
        </Field>
        <Field id={id('out')} label="Check-out">
          <div className="flex gap-1.5">
            <input id={id('out')} type="time" className="field min-w-0 flex-1" value={values.checkOut} onChange={event => setTimes({ checkOut: event.target.value })} />
            {cell.kind === 'today' ? <Button type="button" variant="outline" size="sm" className="h-auto" onClick={() => setTimes({ checkOut: kolkataTime(new Date()) })} aria-label="Check out now">Now</Button> : null}
          </div>
        </Field>
      </div>
      {timed !== null && regularAllowed && String(timed) !== values.attendanceHours ? (
        <button type="button" className="link inline-flex items-center gap-1.5 justify-self-start text-sm" onClick={() => set({ attendanceHours: String(timed) })}>
          <ClockIcon className="size-4" aria-hidden="true" />Use {formatHours(timed)} h from the check times
        </button>
      ) : null}
      <div className="grid grid-cols-2 gap-3">
        <Field id={id('hours')} label="Regular hours" hint={regularAllowed ? 'Usually 8, or 4 for a half day.' : 'Zero for this status.'}>
          <input id={id('hours')} type="number" inputMode="decimal" min={0} max={24} step="any" required className="field" value={values.attendanceHours} disabled={!regularAllowed} onChange={event => set({ attendanceHours: event.target.value })} />
        </Field>
        <div className="flex flex-col gap-1.5">
          <span className="flex items-center"><label htmlFor={id('off')} className="text-foreground text-sm font-medium">Off-hours</label><HelpTip tip="offHours" /></span>
          <input id={id('off')} type="number" inputMode="decimal" min={0} max={24} step="any" required className="field" value={values.offHours} disabled={!offAllowed} onChange={event => set({ offHours: event.target.value })} />
        </div>
      </div>
      {values.status === 'Holiday' ? (
        <Field id={id('holiday')} label="Holiday name">
          <input id={id('holiday')} className="field" value={values.holidayName} maxLength={120} placeholder="Diwali" onChange={event => set({ holidayName: event.target.value })} />
        </Field>
      ) : null}
      <Field id={id('notes')} label="Note" hint="Optional.">
        <textarea id={id('notes')} className="field" rows={2} value={values.notes} onChange={event => set({ notes: event.target.value })} />
      </Field>
      {correcting ? (
        <Field id={id('reason')} label="Why are you changing it?" hint="Kept with the record's history." required>
          <input id={id('reason')} className="field" required maxLength={1000} value={values.reason} onChange={event => set({ reason: event.target.value })} />
        </Field>
      ) : null}
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit">{correcting ? 'Save correction' : 'Save attendance'}</Button>
        {cell.recordId ? (
          <Link href={`/records/attendance/${cell.recordId}/history`} className="link inline-flex items-center gap-1.5 text-sm">
            <HistoryIcon className="size-4" aria-hidden="true" />History
          </Link>
        ) : null}
      </div>
    </ExecutionForm>
  );
}
