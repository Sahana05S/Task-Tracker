'use client';

import * as React from 'react';

import { cn } from '@/lib/utils';

/**
 * Product preview frame.
 *
 * Deliberately built from the same utility classes the real workspace uses —
 * `sheet-grid`, `badge-soft`, `task-progress`, `task-tag` — so the preview cannot
 * drift away from the product's actual appearance. Changing a status tint in
 * `globals.css` changes it here too.
 *
 * The data is fixed sample content, not a live query: the landing page is public
 * and has no session to read from.
 */

type MockupView = 'grid' | 'analytics';

interface MockRow {
  tag: string;
  title: string;
  category: string;
  assignee: string;
  priorityLabel: string;
  priorityClass: string;
  statusLabel: string;
  statusClass: string;
  freshnessLabel: string;
  freshnessClass: string;
  scale: string;
  progress: number;
  scaled: string;
  hours: string;
  rate: string;
}

const ROWS: readonly MockRow[] = [
  {
    tag: 'Sep26_T5',
    title: 'Structural load calculations',
    category: 'PJT',
    assignee: 'AL',
    priorityLabel: 'Focus',
    priorityClass: 'badge-priority-focus',
    statusLabel: 'In Progress',
    statusClass: 'badge-status-in-progress',
    freshnessLabel: 'Fresh',
    freshnessClass: 'freshness-fresh',
    scale: '40.00',
    progress: 25,
    scaled: '10.00',
    hours: '6.08',
    rate: '1.64',
  },
  {
    tag: 'Sep26_T8',
    title: 'Site inspection report',
    category: 'QAC',
    assignee: 'BK',
    priorityLabel: 'High',
    priorityClass: 'badge-priority-high',
    statusLabel: 'In Progress',
    statusClass: 'badge-status-in-progress',
    freshnessLabel: 'Stale',
    freshnessClass: 'freshness-stale',
    scale: '18.00',
    progress: 60,
    scaled: '10.80',
    hours: '9.50',
    rate: '1.14',
  },
  {
    tag: 'Sep26_T2',
    title: 'Client outreach deck',
    category: 'MKT',
    assignee: 'CM',
    priorityLabel: 'Medium',
    priorityClass: 'badge-priority-medium',
    statusLabel: 'Done',
    statusClass: 'badge-status-done',
    freshnessLabel: 'Fresh',
    freshnessClass: 'freshness-fresh',
    scale: '12.00',
    progress: 100,
    scaled: '12.00',
    hours: '7.25',
    rate: '1.66',
  },
  {
    tag: 'Sep26_T11',
    title: 'Drawing register cleanup',
    category: 'AD',
    assignee: 'AL',
    priorityLabel: 'Low',
    priorityClass: 'badge-priority-low',
    statusLabel: 'Not Started',
    statusClass: 'badge-status-not-started',
    freshnessLabel: 'Rotten',
    freshnessClass: 'freshness-rotten',
    scale: '6.00',
    progress: 0,
    scaled: '0.00',
    hours: '0.00',
    rate: '\u2014',
  },
];

interface MockMember {
  initials: string;
  name: string;
  rate: number;
  allocation: number;
  diff: number;
}

const MEMBERS: readonly MockMember[] = [
  { initials: 'AL', name: 'Ada L.', rate: 1.64, allocation: 50, diff: 0.5 },
  { initials: 'CM', name: 'Cleo M.', rate: 1.66, allocation: 30, diff: 0.52 },
  { initials: 'BK', name: 'Brian K.', rate: 1.14, allocation: 20, diff: -0.5 },
];

const MEDIAN_RATE = 1.64;
const MAX_RATE = 2;

export function TrackerMockup() {
  const [view, setView] = React.useState<MockupView>('grid');

  return (
    /*
      The shell floats: a soft tinted halo behind it, then the framed window on
      top. This is the one place on the site where elevation is right — the frame
      is standing in for a screen in front of the page, not for a panel sitting in
      it, and the halo is what stops a white window on a white section from
      disappearing.
    */
    <div className="relative">
      {/* A flat tint, blurred — not a gradient. The project has no gradients, and
          one soft forest wash is enough to lift the frame off the section. */}
      <div
        aria-hidden="true"
        className="bg-primary/10 absolute -inset-2 rounded-[1.5rem] blur-2xl"
      />

      <div className="border-border relative overflow-hidden rounded-2xl border bg-white shadow-soft-lg">
        {/* Window chrome */}
        <div className="border-border bg-muted flex items-center gap-2 border-b px-3 py-2">
          <span className="flex gap-1.5" aria-hidden="true">
            <span className="size-2.5 rounded-full bg-slate-300" />
            <span className="size-2.5 rounded-full bg-slate-300" />
            <span className="size-2.5 rounded-full bg-slate-300" />
          </span>

          <span className="border-border text-muted-foreground ml-1 hidden rounded border bg-white px-2 py-0.5 font-mono text-[10px] sm:inline">
            app.taskpulse.example/{view === 'grid' ? 'tasks' : 'dashboard'}
          </span>

          {/* View switch. The interactive part of the preview. */}
          <div
            role="tablist"
            aria-label="Preview"
            className="border-border ml-auto flex gap-1 rounded-md border bg-white p-0.5"
          >
            {(
              [
                { id: 'grid', label: 'Task grid' },
                { id: 'analytics', label: 'Analytics' },
              ] satisfies readonly { id: MockupView; label: string }[]
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={view === tab.id}
                onClick={() => setView(tab.id)}
                className={cn(
                  'rounded px-2 py-1 text-[11px] font-medium transition-colors',
                  'focus-visible:ring-primary/30 focus-visible:ring-2 focus-visible:outline-none',
                  view === tab.id
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        <div className="bg-background p-2 sm:p-3">
          {view === 'grid' ? <GridPreview /> : <AnalyticsPreview />}
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Grid preview                                                               */
/* -------------------------------------------------------------------------- */

function GridPreview() {
  return (
    <div className="border-border overflow-x-auto rounded-lg border bg-white">
      <table className="sheet-grid text-[11px]">
        <caption className="sr-only">
          Sample task grid showing tag, category, assignee, priority, status,
          freshness, scale, progress, scaled progress, hours and productivity
        </caption>
        <thead>
          <tr>
            <th scope="col" className="sheet-grid-frozen">
              Tag
            </th>
            <th scope="col">Title</th>
            <th scope="col">Cat</th>
            <th scope="col">Who</th>
            <th scope="col">Priority</th>
            <th scope="col">Status</th>
            <th scope="col">Freshness</th>
            <th scope="col" className="text-right">
              Scale
            </th>
            <th scope="col" className="text-right">
              Progress
            </th>
            <th scope="col" className="text-right">
              Scaled
            </th>
            <th scope="col" className="text-right">
              Hours
            </th>
            <th scope="col" className="text-right">
              Prod/h
            </th>
          </tr>
        </thead>
        <tbody>
          {ROWS.map((row) => (
            <tr key={row.tag}>
              <td className="sheet-grid-frozen">
                <span className="task-tag">{row.tag}</span>
              </td>
              <td className="max-w-44">
                <span className="block truncate">{row.title}</span>
              </td>
              <td>
                <span className="badge-soft badge-category">{row.category}</span>
              </td>
              <td>
                <span className="bg-muted text-foreground flex size-6 items-center justify-center rounded font-mono text-[9px] font-semibold">
                  {row.assignee}
                </span>
              </td>
              <td>
                <span className={cn('badge-soft', row.priorityClass)}>
                  {row.priorityLabel}
                </span>
              </td>
              <td>
                <span className={cn('badge-soft', row.statusClass)}>
                  {row.statusLabel}
                </span>
              </td>
              <td>
                <span className={cn('freshness-indicator', row.freshnessClass)}>
                  <span className="freshness-dot" aria-hidden="true" />
                  {row.freshnessLabel}
                </span>
              </td>
              <td className="sheet-numeric">{row.scale}</td>
              <td className="w-20">
                <span className="flex flex-col gap-1">
                  <span className="sheet-numeric">{row.progress}%</span>
                  <progress
                    className="task-progress"
                    value={row.progress}
                    max={100}
                    data-complete={row.progress >= 100 ? 'true' : 'false'}
                    aria-label={`${row.tag} progress`}
                  />
                </span>
              </td>
              <td className="sheet-numeric font-medium">{row.scaled}</td>
              <td className="sheet-numeric">{row.hours}</td>
              <td className="sheet-numeric font-medium">{row.rate}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Analytics preview                                                          */
/* -------------------------------------------------------------------------- */

/**
 * Analytics preview.
 *
 * The bars are drawn as a plain table with width utilities rather than with
 * Recharts: the real charts need client measurement to size themselves, and
 * pulling the whole charting library into a public marketing page to render four
 * static bars is not a trade worth making.
 */
function AnalyticsPreview() {
  return (
    <div className="flex flex-col gap-2">
      {/* Star performer strip. Forest fill, matching the real hero metric card. */}
      <div className="bg-primary text-primary-foreground border-primary flex items-center gap-3 rounded-lg border px-3 py-2.5">
        <span className="text-primary flex size-9 shrink-0 items-center justify-center rounded bg-white font-mono text-[11px] font-semibold">
          CM
        </span>
        <span className="flex min-w-0 flex-col">
          <span className="text-[10px] font-semibold tracking-[0.12em] text-white/70 uppercase">
            Star performer
          </span>
          <span className="truncate text-sm font-semibold">
            Cleo Marchetti
          </span>
        </span>
        <span className="ml-auto flex flex-col items-end">
          <span className="text-[10px] tracking-[0.12em] text-white/70 uppercase">
            Score
          </span>
          <span className="tabular text-lg font-semibold">3.74</span>
        </span>
      </div>

      {/* Key figures */}
      <dl className="grid grid-cols-3 gap-2">
        {[
          { label: 'Avg rate', value: '1.48' },
          { label: 'Scaled progress', value: '32.80' },
          { label: 'Hours', value: '22.83' },
        ].map((stat) => (
          <div
            key={stat.label}
            className="border-border rounded-lg border bg-white px-2.5 py-2"
          >
            <dt className="text-muted-foreground text-[10px] tracking-[0.12em] uppercase">
              {stat.label}
            </dt>
            <dd className="text-foreground tabular text-base font-semibold">
              {stat.value}
            </dd>
          </div>
        ))}
      </dl>

      {/* Productivity against the median */}
      <div className="border-border rounded-lg border bg-white px-3 py-2.5">
        <p className="text-foreground text-[11px] font-semibold">
          Productivity differentials
        </p>
        <p className="text-muted-foreground text-[10px]">
          Median <span className="tabular">{MEDIAN_RATE.toFixed(2)}</span> scaled
          progress per hour
        </p>

        <table className="mt-2 w-full text-[10px]">
          <caption className="sr-only">
            Productivity rate and allocation share per member
          </caption>
          <tbody>
            {MEMBERS.map((entry) => (
              <tr key={entry.initials}>
                <th
                  scope="row"
                  className="text-muted-foreground w-16 py-1 text-left font-normal"
                >
                  {entry.name}
                </th>
                <td className="py-1">
                  {/* Width comes from a fixed step class, not an inline style. */}
                  <span className="bg-muted flex h-2 w-full overflow-hidden rounded-full">
                    <span
                      className={cn(
                        'h-full rounded-full',
                        entry.diff >= 0 ? 'bg-primary' : 'bg-rose-500',
                        barWidthClass(entry.rate / MAX_RATE),
                      )}
                    />
                  </span>
                </td>
                <td className="text-foreground tabular w-10 py-1 text-right font-medium">
                  {entry.rate.toFixed(2)}
                </td>
                <td
                  className={cn(
                    'tabular w-12 py-1 text-right font-medium',
                    entry.diff >= 0 ? 'text-emerald-700' : 'text-rose-700',
                  )}
                >
                  {entry.diff >= 0 ? '+' : ''}
                  {entry.diff.toFixed(2)}
                </td>
                <td className="text-muted-foreground tabular w-10 py-1 text-right">
                  {entry.allocation}%
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/**
 * Maps a 0–1 ratio onto one of a fixed set of width utilities.
 *
 * Tailwind generates classes by scanning source text, so a computed class name
 * would never be emitted. Snapping to ten steps keeps every class literal and
 * avoids an inline style, at a visual cost of at most five percent.
 */
function barWidthClass(ratio: number): string {
  const steps = [
    'w-[10%]',
    'w-[20%]',
    'w-[30%]',
    'w-[40%]',
    'w-[50%]',
    'w-[60%]',
    'w-[70%]',
    'w-[80%]',
    'w-[90%]',
    'w-full',
  ] as const;

  const clamped = Math.min(1, Math.max(0, ratio));
  const index = Math.max(0, Math.round(clamped * steps.length) - 1);
  return steps[index] ?? steps[0];
}
