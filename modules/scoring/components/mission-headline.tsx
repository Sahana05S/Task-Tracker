import Link from 'next/link';
import { ArrowUpRightIcon, FlagIcon, GaugeIcon, ScaleIcon, TrendingUpIcon, UsersIcon, ZapIcon, type LucideIcon } from 'lucide-react';

import type { Band, HeadlineLeader, MissionHeadline } from '@/modules/scoring/internal/analytics/headline';
import { cn } from '@/shared/utils';
import type { CompanyMilestone } from '@/types/tracker';

const BAND_CLASS: Record<Band, string> = {
  green: 'border-success/30 bg-success-subtle text-success-strong',
  amber: 'border-attention-border bg-attention-subtle text-attention-foreground',
  red: 'border-danger-border bg-danger-subtle text-danger-foreground',
};
const BAND_LABEL: Record<Band, string> = { green: 'On track', amber: 'Watch', red: 'Needs attention' };

const two = (v: number) => v.toFixed(2);

function Leader({ icon: Icon, label, leader, unit }: { icon: LucideIcon; label: string; leader: HeadlineLeader; unit: (v: number) => string }) {
  return (
    <div className="soft-card grid min-w-0 content-start gap-1 px-4 py-3">
      <p className="text-muted-foreground flex items-center gap-1.5 text-xs font-medium">
        <Icon className="text-primary size-3.5 shrink-0" aria-hidden="true" />
        {label}
      </p>
      {leader.reason === 'available' ? (
        <>
          <p className="text-foreground truncate font-semibold">{leader.name}</p>
          <p className="text-muted-foreground text-xs tabular-nums">{unit(leader.value!)}</p>
        </>
      ) : (
        <p className="text-muted-foreground text-sm">{leader.reason === 'tie' ? `Tied at ${unit(leader.value!)}` : 'Unavailable'}</p>
      )}
    </div>
  );
}

function Figure({ icon: Icon, label, value, band, note, className }: { icon: LucideIcon; label: string; value: string | null; band: Band | null; note: string; className?: string }) {
  return (
    <div className={cn('grid min-w-0 content-start gap-1 rounded-2xl border px-4 py-3', band ? BAND_CLASS[band] : 'soft-card', className)}>
      <p className="flex items-center gap-1.5 text-xs font-medium opacity-90">
        <Icon className="size-3.5 shrink-0" aria-hidden="true" />
        {label}
      </p>
      <p className="stat-figure">{value ?? 'Unavailable'}</p>
      <p className="text-xs opacity-80">{band ? `${BAND_LABEL[band]} · ` : ''}{note}</p>
    </div>
  );
}

/**
 * The sheet tracker's Tasks header: team leaders, coloured team figures,
 * monthly goals and links to Vision and milestones. Leaders need the team
 * detail scope, so members see "Managers only" there.
 */
export function MissionHeadlineStrip({
  headline,
  monthLabel,
  showLeaders,
  goals,
}: {
  headline: MissionHeadline;
  monthLabel: string;
  showLeaders: boolean;
  goals: readonly CompanyMilestone[] | null;
}) {
  const { allocationSpread: spread, averageProductivity: prod, averageProgress: prog } = headline;
  return (
    <section aria-label="Team headline" className="grid gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-foreground text-sm font-bold">Team headline · {monthLabel}</h2>
        <p className="text-muted-foreground text-xs">Live month to date; figures change as work is logged.</p>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        {showLeaders ? (
          <>
            <Leader icon={FlagIcon} label="Critical team member" leader={headline.critical} unit={v => `Criticality ${two(v)}`} />
            <Leader icon={ZapIcon} label="Most productive" leader={headline.productive} unit={v => `Productivity ${two(v)}`} />
            <Leader icon={UsersIcon} label="Most loaded" leader={headline.loaded} unit={v => `${v >= 0 ? '+' : ''}${two(v * 100)} pp vs median`} />
          </>
        ) : null}
        <Figure icon={ScaleIcon} label="Allocation spread" value={spread.value === null ? null : `${two(spread.value)}%`} band={spread.band} note="Green up to 5%, red above 7%" />
        <Figure icon={GaugeIcon} label="Team avg productivity" value={prod.value === null ? null : two(prod.value)} band={prod.band} note={`${prod.taskCount} task${prod.taskCount === 1 ? '' : 's'} with hours`} />
        <Figure className={showLeaders ? undefined : 'max-sm:col-span-2'} icon={TrendingUpIcon} label="Team avg progress" value={prog.value === null ? null : `${two(prog.value)}%`} band={prog.band} note={`${prog.taskCount} tracked task${prog.taskCount === 1 ? '' : 's'}`} />
      </div>
      {showLeaders ? null : (
        <p className="text-muted-foreground flex items-center gap-1.5 text-xs">
          <UsersIcon className="size-3.5 shrink-0" aria-hidden="true" />
          Critical team member, most productive and most loaded are visible to managers.
        </p>
      )}
      {goals ? (
        <div className="soft-card flex flex-wrap items-start gap-x-6 gap-y-2 px-4 py-3 text-sm">
          <div className="min-w-0 flex-1 basis-64">
            <p className="text-foreground font-semibold">Monthly goals</p>
            {goals.length ? (
              <ul className="text-muted-foreground mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
                {goals.slice(0, 6).map(g => <li key={g.id} className="max-w-full truncate">· {g.title}</li>)}
              </ul>
            ) : (
              <p className="text-muted-foreground mt-1">No open goals.</p>
            )}
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            <Link href="/milestones" className="text-primary inline-flex items-center gap-1 font-semibold hover:underline">
              Milestones<ArrowUpRightIcon className="size-3.5" aria-hidden="true" />
            </Link>
            <Link href="/milestones" className="text-primary inline-flex items-center gap-1 font-semibold hover:underline">
              Vision-Mission-Values<ArrowUpRightIcon className="size-3.5" aria-hidden="true" />
            </Link>
          </div>
        </div>
      ) : null}
    </section>
  );
}
