import Link from 'next/link';
import {
  ArrowRightIcon,
  ClipboardCheckIcon } from 'lucide-react';

import { MissionProgress } from '@/shared/ui/mission-ui';
import { SectionStateIcon } from '@/modules/checklists/components/section-state-icon';
import type { ChecklistRollup, ChecklistSection, SectionProgress } from '@/modules/checklists/client';
import { formatPercent } from '@/shared/tracker/format';
import { Button } from '@/shared/ui/button';

/** The master checklist summary on a mission: one card with a block per phase. */

const SECTION_LABELS: Record<ChecklistSection, string> = {
  setup: 'Setup',
  activity: 'Activity',
  closure: 'Closure' };

const SECTION_ORDER: readonly ChecklistSection[] = ['setup', 'activity', 'closure'];

function sectionStateLabel(section: SectionProgress): string {
  switch (section.state) {
    case 'complete': return 'Complete';
    case 'partial': return 'In progress';
    case 'not_applicable': return 'No rows (N/A)';
    case 'uninitialized': return 'Not initialized';
    case 'missing': return 'Not set up';
    case 'invalid': return 'Needs attention';
  }
}


/**
 * The mission's checklist at a glance: its title and one block per phase
 * (state, progress, a link into it), with one primary action. Activity is the
 * phase that drives progress; Setup and Closure are the gates before and after.
 */
export function ChecklistHero({
  href,
  title,
  itemCount,
  rollup }: {
  href: string;
  title: string | null;
  itemCount: number;
  rollup?: ChecklistRollup;
}) {
  return (
    <section aria-labelledby="phases-heading" className="hero-card relative grid gap-4 p-5 sm:p-6">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        <div className="min-w-0 flex-1">
          <span className="text-primary-subtle-foreground inline-flex items-center gap-1.5 rounded-full bg-card px-2.5 py-1 text-[11px] font-bold tracking-[0.06em] uppercase">
            <ClipboardCheckIcon className="size-3.5" aria-hidden="true" />
            Master checklist
          </span>
          <h2 id="phases-heading" className="text-foreground mt-2.5 text-xl font-bold tracking-tight">
            {title ?? 'No checklist yet'}
          </h2>
          <p className="text-muted-foreground mt-0.5 text-sm">
            {title
              ? `${itemCount} row${itemCount === 1 ? '' : 's'} across Setup, Activity and Closure.`
              : 'Create one to track this mission row by row.'}
          </p>
        </div>
        <Button asChild className="h-11 px-5 max-sm:w-full">
          <Link href={href}>
            {title ? 'Open checklist' : 'Set up checklist'}
            <ArrowRightIcon aria-hidden="true" />
          </Link>
        </Button>
      </div>
      {rollup && title ? (
        <ol className="grid gap-2.5 sm:grid-cols-3">
          {SECTION_ORDER.map((key, index) => {
            const section = rollup.sections[key];
            const value = section.state === 'not_applicable' ? 'N/A' : formatPercent(section.progressPercentage);
            return (
              <li key={key}>
                <Link
                  href={`${href}#${key}`}
                  className="bg-card/85 hover:bg-card focus-visible:ring-ring grid gap-2 rounded-2xl p-3.5 shadow-(--shadow-card) transition-colors outline-none focus-visible:ring-2"
                >
                  <span className="flex items-center gap-2 text-sm">
                    <SectionStateIcon section={section} className="size-4 shrink-0" />
                    <span className="text-foreground font-semibold">{index + 1}. {SECTION_LABELS[key]}</span>
                    <span className="text-foreground ml-auto text-sm font-bold tabular-nums">{value}</span>
                  </span>
                  <MissionProgress value={section.state === 'not_applicable' ? null : section.progressPercentage} label={`${SECTION_LABELS[key]} progress`} className="h-1.5" />
                  <span className="text-muted-foreground text-xs">
                    {sectionStateLabel(section)}{key === 'activity' ? ' · drives progress' : ' · gates Done'}
                  </span>
                </Link>
              </li>
            );
          })}
        </ol>
      ) : null}
    </section>
  );
}
