'use client';

import { useMemo, useState } from 'react';
import { CalendarPlusIcon } from 'lucide-react';

import { fillAttendanceDay } from '@/modules/attendance/actions';
import { emptyCells, type AttendanceMatrixModel, type DayFill } from '@/modules/attendance/client';
import { Button } from '@/shared/ui/button';
import { ExecutionForm } from '@/shared/ui/execution-form';
import { Field } from '@/shared/ui/form-field';
import { SegmentedControl } from '@/shared/ui/segmented-control';
import type { ActionResponse } from '@/types/tracker';

const FILLS = [
  { value: 'Holiday', label: 'Holiday' },
  { value: 'Present', label: 'Present · 8 h' },
  { value: 'Half Day', label: 'Half day · 4 h' },
] as const satisfies readonly { value: DayFill; label: string }[];

/**
 * Managers fill one day in a step: a holiday for everyone, or the usual hours.
 * Only empty cells are filled; days that already have a record keep it and
 * are corrected one by one with a reason.
 */
export function AttendanceDayFill({ model, lastDay }: { model: AttendanceMatrixModel; lastDay: string | null }) {
  const [date, setDate] = useState(lastDay ?? '');
  const [fill, setFill] = useState<DayFill>('Holiday');
  const [holidayName, setHolidayName] = useState('');
  const [message, setMessage] = useState('');
  const targets = useMemo(() => (date ? emptyCells(model, date) : []), [model, date]);
  const names = useMemo(() => new Map(model.rows.map(row => [row.member.id, row.member.fullName])), [model]);
  if (!lastDay) return null;

  return (
    <details className="disclosure">
      <summary className="inline-flex items-center gap-2"><CalendarPlusIcon className="text-primary size-4" aria-hidden="true" />Fill a day for everyone</summary>
      <ExecutionForm
        action={fillAttendanceDay}
        scope={`attendance-fill:${date}:${fill}`}
        className="mt-3 grid gap-3"
        onSuccess={(result: ActionResponse<unknown>) => {
          if (!result.success) return;
          const { saved, skipped } = result.data as { saved: number; skipped: string[] };
          setMessage(`Filled ${saved} ${saved === 1 ? 'day' : 'days'}.${skipped.length ? ` Not saved for ${skipped.map(id => names.get(id) ?? 'one member').join(', ')}; open their day to see why.` : ''}`);
        }}
      >
        <input type="hidden" name="date" value={date} />
        <input type="hidden" name="fill" value={fill} />
        <input type="hidden" name="holidayName" value={fill === 'Holiday' ? holidayName : ''} />
        {targets.map(id => <input key={id} type="hidden" name="memberId" value={id} />)}
        <div className="grid gap-3 sm:flex sm:flex-wrap sm:items-end">
          <Field id="fill-date" label="Day">
            <input id="fill-date" type="date" className="field w-44" required min={model.days[0].date} max={lastDay} value={date} onChange={event => { setDate(event.target.value); setMessage(''); }} />
          </Field>
          <div className="grid gap-1.5">
            <span className="text-foreground text-sm font-medium">Fill with</span>
            <SegmentedControl label="Fill with" value={fill} options={FILLS} onValueChange={setFill} />
          </div>
          {fill === 'Holiday' ? (
            <Field id="fill-holiday" label="Holiday name" required>
              <input id="fill-holiday" className="field w-48" required maxLength={120} value={holidayName} placeholder="Diwali" onChange={event => setHolidayName(event.target.value)} />
            </Field>
          ) : null}
        </div>
        <p className="text-muted-foreground text-sm">
          {targets.length
            ? `${targets.length} of ${model.rows.length} members have nothing recorded that day and will be filled. Days that already have a record are left as they are.`
            : 'Everyone already has a record that day. Open a day to correct it.'}
        </p>
        <Button type="submit" className="justify-self-start" disabled={!targets.length}>
          Fill {targets.length} {targets.length === 1 ? 'day' : 'days'}
        </Button>
        {message ? <p role="status" className="text-sm">{message}</p> : null}
      </ExecutionForm>
    </details>
  );
}
