import { ChevronRightIcon, CircleCheckIcon } from 'lucide-react';

import type { GuideSection, GuideStep, GuideVisual } from '@/modules/guide';
import { DEFAULT_WAYPOINTS } from '@/modules/recognition/client';
import { TASK_FRESHNESS_STATES, TASK_PRIORITIES, TASK_STATUSES } from '@/shared/tracker/enums';
import {
  ATTENDANCE_STATUS_MEANINGS,
  TASK_FRESHNESS_MEANINGS,
  TASK_PRIORITY_MEANINGS,
  TASK_STATUS_MEANINGS,
} from '@/shared/tracker/labels';
import { FreshnessIndicator, PriorityBadge, StatusBadge } from '@/shared/ui/tracker-badges';
import { cn } from '@/shared/utils';

import { GuideIconView } from './guide-icon';

/**
 * The picture that leads a guide section. Server-rendered HTML and CSS with
 * design tokens only. Every visual restates the section's own text, and each
 * one carries its words as real text (lists, labels), so nothing depends on
 * seeing the shapes or the colours.
 */
export function GuideVisualView({ visual, section }: { visual: GuideVisual; section: GuideSection }) {
  switch (visual.kind) {
    case 'flow': return <Flow steps={visual.steps} />;
    case 'parts': return <Parts items={visual.items} />;
    case 'badges': return <Badges set={visual.set} />;
    case 'formula': return <Formula parts={visual.parts} note={visual.note} />;
    case 'checks': return <Checks items={visual.items} />;
    case 'median': return <Median />;
    case 'waypoints': return <Waypoints />;
    case 'factors': return <Factors terms={section.terms ?? []} />;
    case 'streak': return <Streak />;
  }
}

/** Numbered steps: a vertical rail on phones, a row with arrows from `sm`. The last step is the outcome. */
export function Flow({ steps }: { steps: readonly GuideStep[] }) {
  return (
    <ol className="grid sm:flex sm:items-stretch sm:gap-6">
      {steps.map((step, index) => {
        const last = index === steps.length - 1;
        return (
          <li
            key={step.label}
            className="relative flex gap-3 pb-4 last:pb-0 sm:flex-1 sm:flex-col sm:gap-2 sm:rounded-xl sm:border sm:border-border sm:bg-card sm:p-3"
          >
            {!last ? <span aria-hidden="true" className="bg-border absolute top-8 bottom-0 left-4 w-px sm:hidden" /> : null}
            {!last ? (
              <ChevronRightIcon aria-hidden="true" className="text-muted-foreground absolute top-1/2 -right-5 hidden size-4 -translate-y-1/2 sm:block" />
            ) : null}
            <span
              className={cn(
                'relative flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-bold',
                last ? 'bg-success-subtle text-success-strong' : 'bg-primary-subtle text-primary-subtle-foreground',
              )}
            >
              <span className="sr-only">Step </span>{index + 1}<span className="sr-only"> of {steps.length}:</span>
            </span>
            <span className="grid min-w-0 gap-0.5 pt-1 sm:pt-0">
              <span className="text-foreground flex items-start gap-1.5 text-sm font-semibold text-balance">
                <GuideIconView name={step.icon} className={cn('mt-0.5 size-4 shrink-0', last ? 'text-success-strong' : 'text-primary')} />
                {step.label}
              </span>
              {step.note ? <span className="text-muted-foreground text-xs text-pretty">{step.note}</span> : null}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

/** Things that belong together, in no order. */
function Parts({ items }: { items: readonly GuideStep[] }) {
  return (
    <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
      {items.map(item => (
        <li key={item.label} className="border-border bg-card flex items-start gap-3 rounded-xl border p-3">
          <span className="bg-primary-subtle text-primary-subtle-foreground flex size-8 shrink-0 items-center justify-center rounded-lg">
            <GuideIconView name={item.icon} className="size-4" />
          </span>
          <span className="grid min-w-0 gap-0.5">
            <span className="text-foreground text-sm font-semibold">{item.label}</span>
            {item.note ? <span className="text-muted-foreground text-xs text-pretty">{item.note}</span> : null}
          </span>
        </li>
      ))}
    </ul>
  );
}

/** The app's own badges beside one line each, so readers learn what they will see. */
function Badges({ set }: { set: 'status' | 'priority' | 'freshness' | 'attendance' }) {
  const rows: { key: string; badge: React.ReactNode; meaning: string }[] =
    set === 'status' ? TASK_STATUSES.map(status => ({ key: status, badge: <StatusBadge status={status} />, meaning: TASK_STATUS_MEANINGS[status] }))
    : set === 'priority' ? TASK_PRIORITIES.map(priority => ({ key: priority, badge: <PriorityBadge priority={priority} />, meaning: TASK_PRIORITY_MEANINGS[priority] }))
    : set === 'freshness' ? TASK_FRESHNESS_STATES.map(state => ({ key: state, badge: <FreshnessIndicator freshness={state} />, meaning: TASK_FRESHNESS_MEANINGS[state] }))
    : Object.entries(ATTENDANCE_STATUS_MEANINGS).map(([status, meaning]) => ({ key: status, badge: <span className="badge-soft badge-neutral">{status}</span>, meaning }));
  return (
    <dl className="grid gap-2 sm:grid-cols-2">
      {rows.map(row => (
        <div key={row.key} className="border-border bg-card grid gap-1.5 rounded-xl border p-3">
          <dt className="justify-self-start">{row.badge}</dt>
          <dd className="text-muted-foreground text-xs text-pretty">{row.meaning}</dd>
        </div>
      ))}
    </dl>
  );
}

const OPERATORS = new Set(['×', '÷', '+', '−', '=', '≤']);

/** Terms and operators in a row; the term after "=" or "≤" is the result. */
function Formula({ parts, note }: { parts: readonly string[]; note?: string }) {
  const resultFrom = Math.max(parts.lastIndexOf('='), parts.lastIndexOf('≤'));
  return (
    <div className="soft-inset grid gap-2 p-3 sm:p-4">
      <p className="flex flex-wrap items-center gap-2">
        {parts.map((part, index) => OPERATORS.has(part) ? (
          <span key={index} className="text-muted-foreground text-lg leading-none font-bold">{part}</span>
        ) : (
          <span
            key={index}
            className={cn(
              'rounded-lg border px-3 py-1.5 text-sm font-semibold',
              resultFrom >= 0 && index > resultFrom
                ? 'border-primary/25 bg-primary-subtle text-primary-subtle-foreground'
                : 'border-border bg-card text-foreground',
            )}
          >
            {part}
          </span>
        ))}
      </p>
      {note ? <p className="text-muted-foreground text-xs text-pretty">{note}</p> : null}
    </div>
  );
}

/** Conditions that must all hold. */
function Checks({ items }: { items: readonly string[] }) {
  return (
    <ul className="soft-inset grid gap-2 p-3 sm:p-4">
      {items.map(item => (
        <li key={item} className="text-foreground flex items-start gap-2 text-sm">
          <CircleCheckIcon aria-hidden="true" className="text-success-strong mt-0.5 size-4 shrink-0" />
          {item}
        </li>
      ))}
    </ul>
  );
}

/** Team values on a line, the middle one marked, and your difference from it. */
function Median() {
  const team = [10, 28, 50, 66, 88];
  return (
    <figure className="soft-inset grid gap-3 p-4">
      <div aria-hidden="true" className="relative mx-2 h-24">
        <span className="bg-border absolute inset-x-0 top-14 h-0.5 rounded-full" />
        <span className="bg-primary absolute top-6 h-12 w-0.5 -translate-x-1/2" style={{ left: '50%' }} />
        <span className="text-primary absolute top-0 -translate-x-1/2 text-xs font-semibold whitespace-nowrap" style={{ left: '50%' }}>Team median</span>
        <span className="bg-success absolute top-[3.25rem] h-1.5 rounded-full" style={{ left: '50%', width: '26%' }} />
        <span className="text-success-strong absolute top-[2.25rem] text-xs font-semibold whitespace-nowrap" style={{ left: '56%' }}>+ difference</span>
        {team.map(left => (
          <span key={left} className="bg-muted-foreground/50 border-card absolute top-[3.25rem] size-3 -translate-x-1/2 -translate-y-[0.0625rem] rounded-full border-2" style={{ left: `${left}%` }} />
        ))}
        <span className="bg-primary border-card absolute top-[3.1rem] size-4 -translate-x-1/2 rounded-full border-2" style={{ left: '76%' }} />
        <span className="text-foreground absolute top-[4.5rem] -translate-x-1/2 text-xs font-semibold" style={{ left: '76%' }}>You</span>
        <span className="text-muted-foreground absolute top-[4.5rem] left-0 text-xs">Lower</span>
        <span className="text-muted-foreground absolute top-[4.5rem] right-0 text-xs">Higher</span>
      </div>
      <figcaption className="text-muted-foreground text-xs text-pretty">
        Your difference is your value minus the median: above the middle is positive, below is negative.
      </figcaption>
    </figure>
  );
}

/** The five waypoints on a progress ruler, named from the recognition rules. */
function Waypoints() {
  return (
    <figure className="soft-inset grid gap-4 p-4">
      <div aria-hidden="true" className="relative mx-2 h-3">
        <span className="bg-border absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 rounded-full" />
        {DEFAULT_WAYPOINTS.map(waypoint => (
          <span
            key={waypoint.key}
            className={cn('bg-card border-success absolute top-1/2 size-3 -translate-y-1/2 rounded-full border-2', waypoint.percent >= 100 ? '-translate-x-full' : '-translate-x-1/2')}
            style={{ left: `${waypoint.percent}%` }}
          />
        ))}
      </div>
      <ol className="grid gap-2 sm:grid-cols-5">
        {DEFAULT_WAYPOINTS.map(waypoint => (
          <li key={waypoint.key} className="border-border bg-card grid gap-0.5 rounded-lg border px-3 py-2">
            <span className="text-success-strong text-xs font-bold tabular-nums">{waypoint.percent}%</span>
            <span className="text-foreground text-sm font-semibold">{waypoint.label}</span>
          </li>
        ))}
      </ol>
    </figure>
  );
}

/** The ten factors as tiles with their weights, from the section's own list. */
function Factors({ terms }: { terms: readonly { term: string; meaning: string }[] }) {
  return (
    <ul className="grid gap-2 sm:grid-cols-2">
      {terms.map(({ term, meaning }) => {
        const match = /^(.*?)\s*\((×[^)]*)\)$/.exec(term);
        const name = match?.[1] ?? term;
        const weight = match?.[2];
        return (
          <li key={term} className="border-border bg-card grid gap-1 rounded-xl border p-3">
            <span className="flex items-start justify-between gap-2">
              <span className="text-foreground text-sm font-semibold">{name}</span>
              {weight ? <span className="badge-soft badge-accent shrink-0 tabular-nums"><span className="sr-only">Weight </span>{weight}</span> : null}
            </span>
            <span className="text-muted-foreground text-xs text-pretty">{meaning}</span>
          </li>
        );
      })}
    </ul>
  );
}

/** A sample run of days: shape carries the state, as on the profile's streak strip. */
function Streak() {
  const days = ['active', 'active', 'skipped', 'active', 'active', 'active', 'broken', 'active'] as const;
  const legend = [
    { state: 'active', label: 'Counted: worked and logged time or posted an entry' },
    { state: 'skipped', label: 'Skipped: holiday, leave or off-hours' },
    { state: 'broken', label: 'Ends the streak: absent, or nothing logged' },
  ] as const;
  return (
    <figure className="soft-inset grid gap-3 p-4">
      <ol aria-label="Example days" className="flex flex-wrap items-center gap-2">
        {days.map((state, index) => (
          <li key={index} className={cn('streak-dot size-4', `streak-dot-${state}`)}>
            <span className="sr-only">Day {index + 1}: {legend.find(entry => entry.state === state)!.label}</span>
          </li>
        ))}
      </ol>
      <ul className="grid gap-1.5">
        {legend.map(entry => (
          <li key={entry.state} className="text-muted-foreground flex items-center gap-2 text-xs">
            <span aria-hidden="true" className={cn('streak-dot shrink-0', `streak-dot-${entry.state}`)} />
            {entry.label}
          </li>
        ))}
      </ul>
    </figure>
  );
}
