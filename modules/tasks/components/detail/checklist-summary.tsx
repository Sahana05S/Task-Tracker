import Link from 'next/link';
import {
  ArrowRightIcon,
  CheckCircle2Icon,
  CircleDashedIcon,
  CircleDotIcon,
  ClipboardCheckIcon,
  TriangleAlertIcon,
} from 'lucide-react';

import { MissionProgress } from '@/shared/ui/mission-ui';
import type { ChecklistRollup, ChecklistSection, SectionProgress } from '@/modules/checklists/client';
import { formatPercent } from '@/shared/tracker/format';
import { Button } from '@/shared/ui/button';
import { cn } from '@/shared/utils';

/** The master checklist summary on a mission: hero card and Setup/Activity/Closure progress. */

const SECTION_LABELS: Record<ChecklistSection, string> = {
  setup: 'Setup',
  activity: 'Activity',
  closure: 'Closure',
};

const SECTION_ORDER: readonly ChecklistSection[] = ['setup', 'activity', 'closure'];

function sectionStateLabel(section: SectionProgress): string {
  switch (section.state) {
    case 'complete': return 'Complete';
    case 'partial': return 'In progress';
    case 'not_applicable': return 'Not applicable';
    case 'uninitialized': return 'Not initialized';
    case 'missing': return 'Not set up';
    case 'invalid': return 'Needs attention';
  }
}

function SectionStateIcon({ section, className }: { section: SectionProgress; className?: string }) {
  if (section.state === 'complete' || section.state === 'not_applicable') {
    return <CheckCircle2Icon className={cn('text-success-strong', className)} aria-hidden="true" />;
  }
  if (section.state === 'invalid') {
    return <TriangleAlertIcon className={cn('text-danger', className)} aria-hidden="true" />;
  }
  if (section.state === 'partial') {
    return <CircleDotIcon className={cn('text-recognition-foreground', className)} aria-hidden="true" />;
  }
  return <CircleDashedIcon className={cn('text-muted-foreground', className)} aria-hidden="true" />;
}

export function ChecklistHero({
  href,
  title,
  itemCount,
  rollup,
}: {
  href: string;
  title: string | null;
  itemCount: number;
  rollup?: ChecklistRollup;
}) {
  return (
    <section
      aria-label="Master checklist"
      className="hero-card relative p-5 sm:p-6"
    >
      <div className="flex flex-wrap items-center gap-x-6 gap-y-4">
        <div className="min-w-0 flex-1">
          <span className="text-primary-subtle-foreground inline-flex items-center gap-1.5 rounded-full bg-white px-2.5 py-1 text-[11px] font-bold tracking-[0.06em] uppercase">
            <ClipboardCheckIcon className="size-3.5" aria-hidden="true" />
            Master checklist
          </span>
          <h2 className="text-foreground mt-3 text-xl font-bold tracking-tight">
            {title ?? 'No checklist created yet'}
          </h2>
          <p className="text-muted-foreground mt-1 text-sm">
            {title
              ? `${itemCount} checklist item${itemCount === 1 ? '' : 's'} across Setup, Activity and Closure.`
              : 'Create or attach a master checklist in the checklist module.'}
          </p>
          {rollup ? (
            <ul className="mt-3 flex flex-wrap gap-2">
              {SECTION_ORDER.map((key) => (
                <li key={key} className="flex items-center gap-1.5 rounded-full bg-white/80 px-2.5 py-1 text-xs font-medium">
                  <SectionStateIcon section={rollup.sections[key]} className="size-3.5" />
                  {SECTION_LABELS[key]}: {sectionStateLabel(rollup.sections[key])}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
        <Button asChild className="h-11 rounded-xl px-5 max-sm:w-full">
          <Link href={href}>
            Open master checklist
            <ArrowRightIcon aria-hidden="true" />
          </Link>
        </Button>
      </div>
    </section>
  );
}

export function PhaseProgress({ rollup, href }: { rollup?: ChecklistRollup; href?: string }) {
  if (!rollup) {
    return <p className="text-muted-foreground text-sm">Checklist progress is unavailable.</p>;
  }
  return (
    <ol className="grid gap-4">
      {SECTION_ORDER.map((key, index) => {
        const section = rollup.sections[key];
        return (
          <li key={key} className="grid gap-1.5">
            <div className="flex items-center gap-2 text-sm">
              <SectionStateIcon section={section} className="size-4 shrink-0" />
              {href ? (
                <Link href={`${href}#${key}`} className="text-foreground decoration-primary/40 font-medium underline-offset-4 hover:underline">{index + 1}. {SECTION_LABELS[key]}</Link>
              ) : (
                <span className="text-foreground font-medium">{index + 1}. {SECTION_LABELS[key]}</span>
              )}
              <span className="text-muted-foreground ml-auto text-xs">{sectionStateLabel(section)}</span>
              <span className="text-foreground w-10 text-right text-xs font-semibold tabular-nums">
                {section.state === 'not_applicable' ? '—' : formatPercent(section.progressPercentage)}
              </span>
            </div>
            <MissionProgress
              value={section.state === 'not_applicable' ? null : section.progressPercentage}
              label={`${SECTION_LABELS[key]} progress`}
              className="h-1.5"
            />
          </li>
        );
      })}
    </ol>
  );
}
