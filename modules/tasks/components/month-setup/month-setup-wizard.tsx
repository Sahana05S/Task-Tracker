'use client';

import * as React from 'react';
import Link from 'next/link';
import { ArrowLeftIcon, ArrowRightIcon, CalendarRangeIcon, CheckIcon, LoaderCircleIcon } from 'lucide-react';

import { CommitResult, PreviewTable } from '@/modules/tasks/components/tools/operation-drawer';
import { missionCount } from '@/modules/tasks/components/tools/operations';
import { useToolOperation, type OperationActions, type ToolOperationState } from '@/modules/tasks/components/tools/use-tool-operation';
import { PhasesCalendar } from '@/modules/tasks/components/month-setup/phases-calendar';
import { PreviousMissions } from '@/modules/tasks/components/month-setup/previous-missions';
import { StandingGrid } from '@/modules/tasks/components/month-setup/standing-grid';
import { STEPS, useMonthSetup, type MonthSetupState, type StepIndex } from '@/modules/tasks/components/month-setup/use-month-setup';
import { formatDay, monthBounds, type MonthKey } from '@/modules/tasks/internal/tools/month-setup';
import type { MonthSetupContext } from '@/modules/tasks/internal/tools/month-setup-commands';
import { commitMonthSetup, previewMonthSetup } from '@/modules/tasks/tool-actions';
import { Button } from '@/shared/ui/button';
import { FormError } from '@/shared/ui/form-field';
import { MissionNotice, MissionPanel } from '@/shared/ui/mission-ui';
import { cn } from '@/shared/utils';
import type { Json } from '@/types/database';

const ACTIONS: OperationActions<'month_setup'> = {
  preview: (_command, payload) => previewMonthSetup(payload as Record<string, Json>),
  commit: commitMonthSetup,
};

/**
 * Month setup wizard (DECISIONS "Month setup wizard - 21 October 2026"):
 * month, standing missions, weekly phases, last month's missions, then one
 * database preview committed as a single batch. The month choice re-keys the
 * steps, so each month starts from its own defaults.
 */
export function MonthSetupWizard({ contexts, initialMonth }: { contexts: readonly MonthSetupContext[]; initialMonth: MonthKey }) {
  const [month, setMonth] = React.useState(initialMonth);
  const context = contexts.find((item) => item.month === month) ?? contexts[0];
  const choose = React.useCallback((next: MonthKey) => {
    setMonth(next);
    // A reload or shared link opens the same month.
    window.history.replaceState(null, '', `?month=${next}`);
  }, []);
  return <SetupSteps key={context.month} context={context} contexts={contexts} onMonthChange={choose} />;
}

function SetupSteps({ context, contexts, onMonthChange }: {
  context: MonthSetupContext;
  contexts: readonly MonthSetupContext[];
  onMonthChange: (month: MonthKey) => void;
}) {
  const [step, setStep] = React.useState<StepIndex>(0);
  const operation = useToolOperation({ actions: ACTIONS });
  const state = useMonthSetup(context, operation.invalidate);
  const names = React.useMemo(() => new Map(context.members.map((member) => [member.id, member.name])), [context.members]);
  const bounds = monthBounds(context.month);
  const headingRef = React.useRef<HTMLHeadingElement>(null);

  const go = (next: StepIndex) => {
    setStep(next);
    // Entering the last step asks the database for the plan.
    if (next === 4 && state.counts.total > 0 && !operation.preview && !operation.result) operation.prepare('month_setup', state.payload());
    requestAnimationFrame(() => headingRef.current?.focus());
  };

  if (operation.result) {
    return (
      <MissionPanel icon={CheckIcon} title={`${bounds.label} is set up`} subtitle="Every mission was created in one batch.">
        <div className="grid gap-4">
          <CommitResult items={operation.result.items} />
          <div className="flex flex-wrap gap-2">
            <Button asChild><Link href="/tasks">Open Missions</Link></Button>
          </div>
        </div>
      </MissionPanel>
    );
  }

  return (
    <div className="grid gap-5">
      <Stepper step={step} onStep={go} />

      <section aria-labelledby="month-setup-step" className="soft-card min-w-0 p-5 sm:p-6">
        <h2 id="month-setup-step" ref={headingRef} tabIndex={-1} className="text-foreground mb-1 text-lg font-bold tracking-tight outline-none">
          {STEP_TITLES[step](bounds.label)}
        </h2>
        <p className="text-muted-foreground mb-5 max-w-prose text-sm">{STEP_HINTS[step](bounds.name)}</p>

        {step === 0 ? <MonthChoice contexts={contexts} value={context.month} onChange={onMonthChange} /> : null}
        {step === 1 ? <StandingGrid context={context} state={state} /> : null}
        {step === 2 ? <PhasesCalendar context={context} state={state} /> : null}
        {step === 3 ? <PreviousMissions context={context} state={state} /> : null}
        {step === 4 ? <PreviewStep state={state} operation={operation} names={names} onPreview={() => operation.prepare('month_setup', state.payload())} /> : null}
      </section>

      <footer className="bg-card/95 border-border sticky bottom-3 z-10 flex flex-wrap items-center gap-3 rounded-2xl border px-4 py-3 shadow-(--shadow-card) backdrop-blur-sm sm:px-5">
        <p className="text-sm">
          <span className="text-foreground font-semibold tabular-nums">{missionCount(state.counts.total)}</span>
          <span className="text-muted-foreground"> planned for {bounds.label}</span>
        </p>
        <div className="ml-auto flex gap-2">
          {step > 0 ? (
            <Button type="button" variant="outline" onClick={() => go((step - 1) as StepIndex)} disabled={operation.pending}>
              <ArrowLeftIcon aria-hidden="true" /> Back
            </Button>
          ) : null}
          {step < 4 ? (
            <Button type="button" onClick={() => go((step + 1) as StepIndex)} disabled={step === 0 && !context.allowed}>
              {step === 3 ? 'Preview' : 'Next'} <ArrowRightIcon aria-hidden="true" />
            </Button>
          ) : (
            <Button type="button" onClick={operation.commit} disabled={operation.pending || !operation.preview?.ready}>
              {operation.pending ? <LoaderCircleIcon className="animate-spin" aria-hidden="true" /> : null}
              {operation.pending ? 'Working…' : `Create ${missionCount(operation.preview?.items.length ?? 0)}`}
            </Button>
          )}
        </div>
      </footer>
    </div>
  );
}

const STEP_TITLES: Record<StepIndex, (label: string) => string> = {
  0: () => 'Which month?',
  1: (label) => `Standing missions for ${label}`,
  2: () => 'Weekly Tasks Review phases',
  3: () => 'Last month’s missions',
  4: (label) => `Review and create ${label}`,
};
const STEP_HINTS: Record<StepIndex, (name: string) => string> = {
  0: (name) => `Missions are dated from the 1st to the end of ${name}, so they stay out of this month’s reports until then.`,
  1: () => 'Every active member gets the full set; untick anything a person does not need. Inactive members are left out.',
  2: () => 'Seven-day phases from the 1st; the last one ends with the month.',
  3: (name) => `Repeat a mission as a fresh copy for ${name}, carry its unfinished part over, or skip it. Missions the steps before already recreate are hidden.`,
  4: () => 'Nothing is created until you confirm. If any mission cannot be created, none are.',
};

function Stepper({ step, onStep }: { step: StepIndex; onStep: (step: StepIndex) => void }) {
  return (
    <nav aria-label="Setup steps">
      <ol className="flex flex-wrap gap-1.5">
        {STEPS.map((label, index) => {
          const current = index === step;
          return (
            <li key={label}>
              <button
                type="button"
                onClick={() => onStep(index as StepIndex)}
                aria-current={current ? 'step' : undefined}
                className={cn(
                  'focus-visible:ring-ring inline-flex h-9 items-center gap-2 rounded-full px-3 text-sm font-medium transition-colors outline-none focus-visible:ring-2',
                  current ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                )}
              >
                <span
                  className={cn(
                    'grid size-5 place-items-center rounded-full text-xs tabular-nums',
                    current ? 'bg-primary-foreground/20' : index < step ? 'bg-primary-subtle text-primary' : 'bg-muted',
                  )}
                  aria-hidden="true"
                >
                  {index < step ? <CheckIcon className="size-3" /> : index + 1}
                </span>
                <span className={cn(!current && 'sr-only sm:not-sr-only')}>{label}</span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

function MonthChoice({ contexts, value, onChange }: { contexts: readonly MonthSetupContext[]; value: MonthKey; onChange: (month: MonthKey) => void }) {
  const current = contexts.find((item) => item.month === value);
  return (
    <div className="grid gap-4">
      <fieldset className="grid gap-3 sm:grid-cols-2">
        <legend className="sr-only">Month to set up</legend>
        {contexts.map((item) => {
          const bounds = monthBounds(item.month);
          const range = `${formatDay(bounds.start)} – ${formatDay(bounds.end)}`;
          return (
            <label
              key={item.month}
              className={cn(
                'border-border has-[:checked]:border-primary has-[:checked]:bg-primary-subtle/50 has-[:focus-visible]:ring-ring flex cursor-pointer items-start gap-3 rounded-2xl border p-4 transition-colors has-[:focus-visible]:ring-2',
              )}
            >
              <input type="radio" name="setup-month" value={item.month} checked={item.month === value} onChange={() => onChange(item.month)} className="accent-primary mt-1 size-4" />
              <span className="grid gap-1">
                <span className="text-foreground flex items-center gap-2 font-semibold">
                  <CalendarRangeIcon className="text-primary size-4" aria-hidden="true" />
                  {bounds.label}
                </span>
                <span className="text-muted-foreground text-xs tabular-nums">{range}</span>
                <span className="text-sm">{monthStatus(item)}</span>
              </span>
            </label>
          );
        })}
      </fieldset>
      {current && current.setUpCount > 0 ? (
        <MissionNotice tone="info" role="status">
          An earlier setup created {missionCount(current.setUpCount)} for {monthBounds(current.month).label}; those are left out below, so you can add what is missing.
        </MissionNotice>
      ) : null}
    </div>
  );
}

function monthStatus(context: MonthSetupContext): string {
  if (context.setUpCount > 0) return `Set up · ${missionCount(context.existingCount)} dated`;
  if (context.existingCount > 0) return `${missionCount(context.existingCount)} already dated, not set up`;
  return 'No missions yet';
}

function PreviewStep({ state, operation, names, onPreview }: {
  state: MonthSetupState;
  operation: ToolOperationState<'month_setup'>;
  names: ReadonlyMap<string, string>;
  onPreview: () => void;
}) {
  if (state.counts.total === 0) {
    return <MissionNotice tone="attention" role="status">Nothing is selected yet. Go back and tick the missions to create.</MissionNotice>;
  }
  return (
    <div className="grid gap-4">
      <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
        {([
          ['Standing', state.counts.standing],
          ['Weekly phases', state.counts.phases],
          ['Repeated', state.counts.repeats],
          ['Carried over', state.counts.carries],
        ] as const).map(([label, count]) => (
          <div key={label} className="bg-muted/60 rounded-xl px-3 py-2">
            <dt className="text-muted-foreground text-xs">{label}</dt>
            <dd className="text-foreground text-lg font-semibold tabular-nums">{count}</dd>
          </div>
        ))}
      </dl>
      {state.counts.waiting > 0 ? (
        <p className="text-muted-foreground text-xs">
          {missionCount(state.counts.waiting)} marked Carry over {state.counts.waiting === 1 ? 'waits' : 'wait'} for the month to start and {state.counts.waiting === 1 ? 'is' : 'are'} not included.
        </p>
      ) : null}
      {operation.preview ? (
        <>
          <PreviewTable preview={operation.preview} names={names} copy={false} />
          <p className="text-muted-foreground text-xs">Standing missions and phases get their tags when they are created, in this order.</p>
        </>
      ) : operation.pending ? (
        <p className="text-muted-foreground flex items-center gap-2 text-sm" role="status">
          <LoaderCircleIcon className="size-4 animate-spin" aria-hidden="true" /> Preparing the preview…
        </p>
      ) : null}
      <FormError message={operation.message || undefined} />
      {!operation.pending && (!operation.preview || operation.message) ? (
        <div>
          {/* A refused commit (expired, something changed) needs a fresh preview. */}
          <Button type="button" variant="outline" onClick={onPreview}>{operation.preview ? 'Preview again' : 'Preview'}</Button>
        </div>
      ) : null}
    </div>
  );
}
