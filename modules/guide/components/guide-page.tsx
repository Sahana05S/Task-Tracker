import Link from 'next/link';
import {
  ArrowRightIcon,
  BarChart3Icon,
  ClockIcon,
  InfoIcon,
  ListChecksIcon,
  LockIcon,
  RotateCcwIcon,
  StarIcon,
  TargetIcon,
  type LucideIcon,
} from 'lucide-react';

import { GUIDE_STAGE_CONTENT, type GuideStageContent, type GuideStageIcon } from '@/modules/guide';
import { MissionPage, MissionPageHeader } from '@/shared/ui/mission-ui';
import { cn } from '@/shared/utils';

import { GuideFlowchart } from './guide-flowchart';

const ICONS: Record<GuideStageIcon, LucideIcon> = {
  target: TargetIcon,
  clock: ClockIcon,
  listChecks: ListChecksIcon,
  chart: BarChart3Icon,
  star: StarIcon,
  lock: LockIcon,
};

const href = (stage: GuideStageContent) => `/guide?stage=${stage.key}`;

/**
 * `/guide`: one page, one stage at a time. A numbered row of the six stages,
 * then the chosen stage's flowchart and one line. Choosing a stage is a plain
 * link (`?stage=`), so it works without JavaScript and help tips can open the
 * page at the right stage.
 */
export function GuidePage({ stage }: { stage: GuideStageContent }) {
  const index = GUIDE_STAGE_CONTENT.findIndex(s => s.key === stage.key);
  const next = GUIDE_STAGE_CONTENT[index + 1];
  const Icon = ICONS[stage.icon];

  return (
    <MissionPage>
      <MissionPageHeader title="Guide" description="How TaskPulse works, one step at a time." />

      <nav aria-label="Guide stages">
        <ol className="flex flex-wrap gap-2">
          {GUIDE_STAGE_CONTENT.map((item, i) => {
            const current = item.key === stage.key;
            const StageIcon = ICONS[item.icon];
            return (
              <li key={item.key}>
                <Link
                  href={href(item)}
                  scroll={false}
                  aria-current={current ? 'step' : undefined}
                  className={cn(
                    'inline-flex min-h-11 items-center gap-2 rounded-full border px-4 text-sm font-semibold transition-colors',
                    current
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-border bg-card text-foreground hover:border-primary/30',
                  )}
                >
                  <span className={cn('text-xs tabular-nums', current ? 'text-primary-foreground' : 'text-muted-foreground')}>{i + 1}</span>
                  <StageIcon aria-hidden="true" className="size-4" />
                  {item.title}
                </Link>
              </li>
            );
          })}
        </ol>
      </nav>

      <section aria-labelledby="guide-stage-title" className="soft-card grid gap-8 p-5 sm:p-8">
        <div className="flex items-center gap-3">
          <span className="bg-primary-subtle text-primary-subtle-foreground flex size-11 shrink-0 items-center justify-center rounded-xl">
            <Icon aria-hidden="true" className="size-5" />
          </span>
          <div className="grid gap-0.5">
            <p className="text-muted-foreground text-xs font-semibold">Step {index + 1} of {GUIDE_STAGE_CONTENT.length}</p>
            <h2 id="guide-stage-title" className="text-foreground text-xl font-bold tracking-tight">{stage.title}</h2>
          </div>
        </div>

        <GuideFlowchart stage={stage} />

        <div className="flex flex-wrap items-center justify-between gap-4">
          <p className="text-foreground flex items-start gap-2 text-base text-pretty">
            <InfoIcon aria-hidden="true" className="text-primary mt-0.5 size-5 shrink-0" />
            {stage.caption}
          </p>
          <Link
            href={next ? href(next) : href(GUIDE_STAGE_CONTENT[0])}
            scroll={false}
            className="border-border text-foreground hover:border-primary/30 inline-flex min-h-11 items-center gap-2 rounded-full border px-4 text-sm font-semibold"
          >
            {next ? <>Next: {next.title}<ArrowRightIcon aria-hidden="true" className="size-4" /></> : <><RotateCcwIcon aria-hidden="true" className="size-4" />Start again</>}
          </Link>
        </div>
      </section>
    </MissionPage>
  );
}
