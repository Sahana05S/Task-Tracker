'use client';

import { useContext, useEffect, useId, useRef, useState, useTransition } from 'react';
import { AppRouterContext } from 'next/dist/shared/lib/app-router-context.shared-runtime';

import { kolkataDate } from '@/shared/time/kolkata';
import { isMonthKey, monthPeriod } from '@/shared/time/period';
import { monthBounds, periodQuery, selectionFromAsOf, selectionInstant, type PeriodSelection, type ReadMode } from '@/shared/time/period-selection';
import { HelpTip } from '@/shared/ui/help-tip';
import { SegmentedControl } from '@/shared/ui/segmented-control';
import { cn } from '@/shared/utils';

const MODES = [
  { value: 'latest', label: 'Latest' },
  { value: 'endOfDay', label: 'End of a day' },
  { value: 'custom', label: 'Custom' },
] as const satisfies readonly { value: ReadMode; label: string }[];

/** Typed fields (month, day, time) apply once typing pauses, so a half-typed date never loads. */
const TYPING_PAUSE_MS = 700;

/**
 * Month plus the moment its figures are read at: latest, the end of a chosen
 * day, or a chosen day and time (India time). Replaces typing an ISO instant.
 * `keep` carries the page's other query parameters (tab, member…) along.
 *
 * Choices apply as soon as they are made (user decision, 28 October 2026: the
 * old "Show figures" button reloaded the same figures with nothing on screen
 * saying so). The line under the fields always says what is shown. Without
 * JavaScript the form still changes the month (a plain GET form; Enter submits).
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
  // Inside the app the router swaps only the page (no full reload of the shell; slow pages, 28 Oct 2026).
  // Outside it (tests, static views) a plain navigation; the context is null there.
  const router = useContext(AppRouterContext);
  const [routing, startRouting] = useTransition();
  const [reloading, setReloading] = useState(false);
  const pending = routing || reloading;
  const [selection, setSelection] = useState<PeriodSelection>(() => selectionFromAsOf(month, asOf));
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const shown = selectionFromAsOf(month, asOf);
  const bounds = monthBounds(isMonthKey(selection.month) ? selection.month : month);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const apply = (next: PeriodSelection) => {
    if (timer.current) clearTimeout(timer.current);
    if (!isMonthKey(next.month)) return;
    const search = `?${periodQuery(next, keep)}`;
    if (search === window.location.search) return;
    if (router) startRouting(() => router.push(search, { scroll: false }));
    else {
      setReloading(true);
      window.location.assign(search);
    }
  };

  /** Updates the fields; `now` applies at once (a click), otherwise after a typing pause. */
  const update = (patch: Partial<PeriodSelection>, now: boolean) => {
    const next = { ...selection, ...patch };
    // Keep the chosen day inside the chosen month.
    if (patch.month || patch.mode) {
      const range = monthBounds(isMonthKey(next.month) ? next.month : month);
      const max = next.mode === 'endOfDay' ? range.lastEnded : range.lastStarted;
      if (next.date < range.first || next.date > max) next.date = max;
    }
    setSelection(next);
    if (timer.current) clearTimeout(timer.current);
    if (now) apply(next);
    else timer.current = setTimeout(() => apply(next), TYPING_PAUSE_MS);
  };

  // A moment that has not happened yet reads as latest (periodQuery drops it); say so rather than silently.
  const instant = selectionInstant(selection);
  const future = instant !== null && new Date(instant).getTime() > Date.now();
  const monthLabel = isMonthKey(month) ? monthPeriod(month).label : month;
  const reading = shown.mode === 'latest' ? `latest${asOfLabel ? `, as of ${asOfLabel}` : ''}` : asOfLabel ? `as of ${asOfLabel}` : 'at the chosen moment';

  return (
    <form
      method="get"
      className={cn('grid gap-3 sm:flex sm:flex-wrap sm:items-end', className)}
      onSubmit={event => {
        event.preventDefault();
        apply(selection);
      }}
    >
      {Object.entries(keep ?? {}).map(([name, value]) => <input key={name} type="hidden" name={name} value={value} />)}
      <label className="field-label" htmlFor={`${id}-month`}>
        Month
        <input id={`${id}-month`} className="field w-48 bg-card" type="month" name="period" value={selection.month} max={kolkataDate().slice(0, 7)} required onChange={event => update({ month: event.target.value }, false)} />
      </label>
      <div className="grid gap-1.5">
        <span className="field-label flex items-center gap-0.5">Figures as of<HelpTip tip="asOf" /></span>
        <SegmentedControl label="Figures as of" value={selection.mode} options={MODES} onValueChange={mode => update({ mode }, true)} />
      </div>
      {selection.mode !== 'latest' ? (
        <label className="field-label" htmlFor={`${id}-date`}>
          Day
          <input id={`${id}-date`} className="field w-44 bg-card" type="date" value={selection.date} min={bounds.first} max={selection.mode === 'endOfDay' ? bounds.lastEnded : bounds.lastStarted} required onChange={event => update({ date: event.target.value }, false)} />
        </label>
      ) : null}
      {selection.mode === 'custom' ? (
        <label className="field-label" htmlFor={`${id}-time`}>
          Time (India)
          <input id={`${id}-time`} className="field w-32 bg-card" type="time" value={selection.time} required onChange={event => update({ time: event.target.value }, false)} />
        </label>
      ) : null}
      {/* Enter (and a page without JavaScript) still submits; choices otherwise apply on their own. */}
      <button type="submit" tabIndex={-1} className="sr-only">Show figures</button>
      <p className="text-muted-foreground basis-full text-xs" role="status" aria-live="polite">
        {pending ? 'Updating the figures…' : <>Showing <span className="text-foreground font-medium">{monthLabel}</span> · {reading}.{future ? ' That moment hasn’t happened yet, so the latest figures are shown.' : ''}</>}
      </p>
    </form>
  );
}
