'use client';

import { useId, useState } from 'react';

import { kolkataDate } from '@/shared/time/kolkata';
import { isMonthKey } from '@/shared/time/period';
import { monthBounds, periodQuery, selectionFromAsOf, type PeriodSelection, type ReadMode } from '@/shared/time/period-selection';
import { buttonVariants } from '@/shared/ui/button';
import { HelpTip } from '@/shared/ui/help-tip';
import { SegmentedControl } from '@/shared/ui/segmented-control';
import { cn } from '@/shared/utils';

const MODES = [
  { value: 'latest', label: 'Latest' },
  { value: 'endOfDay', label: 'End of a day' },
  { value: 'custom', label: 'Custom' },
] as const satisfies readonly { value: ReadMode; label: string }[];


/**
 * Month plus the moment its figures are read at: latest, the end of a chosen
 * day, or a chosen day and time (India time). Replaces typing an ISO instant.
 * `keep` carries the page's other query parameters (tab, member…) along.
 * Without JavaScript the form still changes the month (a plain GET form).
 */
export function PeriodPicker({ month, asOf, asOfLabel, keep, className }: {
  /** YYYY-MM being shown. */
  month: string;
  /** The instant the server read, ISO. */
  asOf: string;
  /** That instant in words, formatted on the server so it hydrates unchanged. */
  asOfLabel?: string;
  keep?: Readonly<Record<string, string>>;
  className?: string;
}) {
  const id = useId();
  const [selection, setSelection] = useState<PeriodSelection>(() => selectionFromAsOf(month, asOf));
  const bounds = monthBounds(isMonthKey(selection.month) ? selection.month : month);
  const update = (patch: Partial<PeriodSelection>) => setSelection(current => {
    const next = { ...current, ...patch };
    // Keep the chosen day inside the chosen month.
    if (patch.month || patch.mode) {
      const range = monthBounds(isMonthKey(next.month) ? next.month : month);
      const max = next.mode === 'endOfDay' ? range.lastEnded : range.lastStarted;
      if (next.date < range.first || next.date > max) next.date = max;
    }
    return next;
  });

  return (
    <form
      method="get"
      className={cn('grid gap-3 sm:flex sm:flex-wrap sm:items-end', className)}
      onSubmit={event => {
        event.preventDefault();
        window.location.assign(`?${periodQuery(selection, keep)}`);
      }}
    >
      {Object.entries(keep ?? {}).map(([name, value]) => <input key={name} type="hidden" name={name} value={value} />)}
      <label className="field-label" htmlFor={`${id}-month`}>
        Month
        <input id={`${id}-month`} className="field w-48 bg-white" type="month" name="period" value={selection.month} max={kolkataDate().slice(0, 7)} required onChange={event => update({ month: event.target.value })} />
      </label>
      <div className="grid gap-1.5">
        <span className="field-label flex items-center gap-0.5">Figures as of<HelpTip tip="asOf" /></span>
        <SegmentedControl label="Figures as of" value={selection.mode} options={MODES} onValueChange={mode => update({ mode })} />
      </div>
      {selection.mode !== 'latest' ? (
        <label className="field-label" htmlFor={`${id}-date`}>
          Day
          <input id={`${id}-date`} className="field w-44 bg-white" type="date" value={selection.date} min={bounds.first} max={selection.mode === 'endOfDay' ? bounds.lastEnded : bounds.lastStarted} required onChange={event => update({ date: event.target.value })} />
        </label>
      ) : null}
      {selection.mode === 'custom' ? (
        <label className="field-label" htmlFor={`${id}-time`}>
          Time (India)
          <input id={`${id}-time`} className="field w-32 bg-white" type="time" value={selection.time} required onChange={event => update({ time: event.target.value })} />
        </label>
      ) : null}
      <button type="submit" className={cn(buttonVariants({ variant: 'outline' }), 'justify-self-start')}>Show figures</button>
      {!asOfLabel ? null : <p className="text-muted-foreground basis-full text-xs">Showing figures as of {asOfLabel}.</p>}
    </form>
  );
}
