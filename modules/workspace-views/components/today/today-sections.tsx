import Link from 'next/link';
import {
  ArrowRightIcon,
  BarChart3Icon,
  CalendarDaysIcon,
  CheckCircle2Icon,
  FlagIcon,
  HandHeartIcon,
  StarIcon,
  TargetIcon,
  UsersIcon,
} from 'lucide-react';
import type * as React from 'react';

import { PriorityBadge } from '@/shared/ui/tracker-badges';
import type { AwardSnapshot, FocusMission, Section, ValidatedContribution, WeekSummary } from '@/modules/workspace-views/internal/today';
import { cn } from '@/shared/utils';
import { EmptyState } from '@/shared/ui/mission-ui';

const KIND_LABEL: Record<ValidatedContribution['kind'], string> = { fact: 'Daily fact', idea: 'Idea', suggestion: 'Suggestion' };

function shortDate(date: string): string {
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${date}T00:00:00Z`));
}

function dayDiff(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

export function Card({ className, children, ...props }: React.ComponentProps<'section'>) {
  return <section className={cn('soft-card p-5 sm:p-6', className)} {...props}>{children}</section>;
}

function CardTitle({ icon: Icon, title, action, tone = 'primary' }: {
  icon: typeof StarIcon; title: string; action?: { href: string; label: string }; tone?: 'primary' | 'recognition';
}) {
  return (
    <div className="mb-4 flex items-center justify-between gap-3">
      <h2 className="text-foreground flex items-center gap-2 text-base font-bold tracking-tight">
        <Icon className={cn('size-5', tone === 'recognition' ? 'text-recognition' : 'text-primary')} aria-hidden="true" />
        {title}
      </h2>
      {action ? (
        <Link href={action.href} className="text-primary flex shrink-0 items-center gap-1 text-sm font-semibold hover:underline">
          {action.label}
          <ArrowRightIcon className="size-3.5" aria-hidden="true" />
        </Link>
      ) : null}
    </div>
  );
}

export function Unavailable({ what }: { what: string }) {
  return (
    <p role="alert" className="border-danger-border bg-danger-subtle text-danger-foreground rounded-xl border px-4 py-3 text-sm">
      {what} couldn’t be loaded right now. Refresh to try again.
    </p>
  );
}

function dueLabel(due: string | null, today: string): { text: string; overdue: boolean } {
  if (!due) return { text: 'No deadline', overdue: false };
  const diff = dayDiff(today, due);
  if (diff < 0) return { text: `Overdue · ${shortDate(due)}`, overdue: true };
  if (diff === 0) return { text: 'Due today', overdue: false };
  if (diff === 1) return { text: 'Due tomorrow', overdue: false };
  return { text: `Due ${shortDate(due)}`, overdue: false };
}

/** Your open, unarchived assigned missions, soonest deadline first. */
export function FocusMissions({ focus, today }: { focus: Section<{ missions: FocusMission[]; openCount: number }>; today: string }) {
  return (
    <Card aria-label="Your focus missions">
      <CardTitle icon={TargetIcon} title="Your focus missions" action={{ href: '/tasks', label: 'See all' }} />
      {focus.status === 'unavailable' ? <Unavailable what="Your missions" /> : focus.data.missions.length === 0 ? (
        <p className="text-muted-foreground rounded-xl bg-background px-4 py-6 text-center text-sm">
          No open missions are assigned to you. <Link href="/tasks" className="link font-semibold">Browse missions</Link>
        </p>
      ) : (
        <ul className="grid gap-3">
          {focus.data.missions.map((mission) => {
            const due = dueLabel(mission.dueDate, today);
            const progress = mission.progress === null ? null : Math.max(0, Math.min(100, mission.progress));
            return (
              <li key={mission.id} className="rounded-2xl border border-border bg-background p-4">
                <p className="text-foreground font-semibold">{mission.title}</p>
                <p className="mt-1.5 flex flex-wrap items-center gap-2 text-xs">
                  <PriorityBadge priority={mission.priority} />
                  <span className={cn('font-medium', due.overdue ? 'text-overdue' : 'text-muted-foreground')}>{due.text}</span>
                  <span className="text-muted-foreground font-mono">{mission.taskTag}</span>
                </p>
                <div className="mt-3 flex items-center gap-3">
                  <div className="progress-track" role="progressbar" aria-label={`Progress for ${mission.taskTag}`}
                    aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress ?? undefined}>
                    <div className="progress-fill" style={{ width: `${progress ?? 0}%` }} />
                  </div>
                  <span className="text-foreground w-12 shrink-0 text-right text-sm font-bold tabular-nums">{progress === null ? '—' : `${Math.round(progress)}%`}</span>
                </div>
                <Link href={`/tasks/${encodeURIComponent(mission.taskTag)}`}
                  className="bg-primary text-primary-foreground hover:bg-primary-hover mt-3 flex items-center justify-center gap-1.5 rounded-xl px-4 py-2.5 text-sm font-semibold transition-colors">
                  Continue mission
                  <ArrowRightIcon className="size-4" aria-hidden="true" />
                </Link>
              </li>
            );
          })}
          {focus.data.openCount > focus.data.missions.length ? (
            <li className="text-muted-foreground text-center text-xs">
              {focus.data.openCount - focus.data.missions.length} more open {focus.data.openCount - focus.data.missions.length === 1 ? 'mission' : 'missions'} in Missions
            </li>
          ) : null}
        </ul>
      )}
    </Card>
  );
}

/** Monday–today counts from logs, completed missions, contributions and awards. */
export function WeekSummaryCard({ week, waypointsReached = null }: {
  week: Section<WeekSummary>;
  /** Waypoints crossed this week on your missions; null hides the row (a database before migration 51, or a failed read). */
  waypointsReached?: number | null;
}) {
  const rows = week.status === 'ready' ? [
    { icon: CheckCircle2Icon, label: 'Missions completed', value: week.data.missionsCompleted, tone: 'text-success-strong' },
    ...(waypointsReached === null ? [] : [{ icon: FlagIcon, label: 'Waypoints reached', value: waypointsReached, tone: 'text-success-strong' }]),
    { icon: HandHeartIcon, label: 'Contributions recorded', value: week.data.contributionsRecorded, tone: 'text-primary' },
    { icon: StarIcon, label: 'Daily stars earned', value: week.data.dailyStarsEarned, tone: 'text-recognition' },
  ] : [];
  return (
    <Card aria-label="This week, so far">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-foreground text-base font-bold tracking-tight">This week, so far</h2>
        {week.status === 'ready' ? (
          <span className="text-muted-foreground text-xs">{week.data.activeDays} active {week.data.activeDays === 1 ? 'day' : 'days'}</span>
        ) : null}
      </div>
      {week.status === 'unavailable' ? <Unavailable what="This week’s summary" /> : (
        <>
          <dl className="divide-border divide-y">
            {rows.map(({ icon: Icon, label, value, tone }) => (
              <div key={label} className="flex items-center justify-between gap-3 py-3">
                <dt className="text-foreground flex items-center gap-2.5 text-sm">
                  <Icon className={cn('size-[18px]', tone, label === 'Daily stars earned' && 'fill-current')} aria-hidden="true" />
                  {label}
                </dt>
                <dd className={cn('text-xl font-bold tabular-nums', label === 'Daily stars earned' ? 'text-recognition-foreground' : 'text-foreground')}>{value}</dd>
              </div>
            ))}
          </dl>
          <p className="text-muted-foreground border-border mt-1 border-t pt-3 text-center text-xs">
            Active days count days with logged time. A little progress, every working day.
          </p>
        </>
      )}
    </Card>
  );
}

/** Calendar of this month with your daily-star wins and today marked. */
export function StarCalendar({ awards, today, monthStart, userId }: {
  awards: Section<AwardSnapshot>; today: string; monthStart: string; userId: string;
}) {
  const first = new Date(`${monthStart}T00:00:00Z`);
  const daysInMonth = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  const lead = (first.getUTCDay() + 6) % 7;
  const wins = new Set(awards.status === 'ready'
    ? awards.data.days.filter((d) => d.status === 'completed_winner' && d.certified && d.winnerId === userId).map((d) => d.date) : []);
  const monthLabel = new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(first);
  return (
    <Card aria-label="Star calendar">
      <CardTitle icon={CalendarDaysIcon} title="Star calendar" tone="recognition" action={{ href: '/awards', label: 'Awards' }} />
      {awards.status === 'unavailable' ? <Unavailable what="Your star calendar" /> : (
        <>
          <p className="text-muted-foreground mb-3 text-center text-xs font-medium">{monthLabel}</p>
          <div className="grid grid-cols-7 gap-y-1.5 text-center text-xs" role="group" aria-label={`${monthLabel} daily stars`}>
            {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => <span key={i} className="text-muted-foreground pb-1 font-semibold" aria-hidden="true">{d}</span>)}
            {Array.from({ length: lead }, (_, i) => <span key={`lead-${i}`} aria-hidden="true" />)}
            {Array.from({ length: daysInMonth }, (_, i) => {
              const date = `${monthStart.slice(0, 8)}${String(i + 1).padStart(2, '0')}`;
              const won = wins.has(date);
              const isToday = date === today;
              return (
                <span key={date} className="flex justify-center">
                  <span title={won ? `${i + 1} ${monthLabel}: daily star earned` : isToday ? 'Today' : undefined}
                    className={cn('flex size-8 items-center justify-center rounded-full tabular-nums',
                      won && 'bg-recognition-subtle text-recognition-foreground font-bold',
                      isToday && !won && 'bg-primary text-primary-foreground font-bold',
                      isToday && won && 'ring-primary ring-2')}>
                    {won ? <StarIcon className="text-recognition size-4 fill-current" aria-hidden="true" /> : i + 1}
                    <span className="sr-only">{won ? `${i + 1}: daily star earned` : isToday ? `${i + 1}: today` : ''}</span>
                  </span>
                </span>
              );
            })}
          </div>
          <p className="text-muted-foreground mt-3 flex flex-wrap justify-between gap-2 text-xs">
            <span className="inline-flex items-center gap-1.5"><StarIcon className="text-recognition size-3.5 fill-current" aria-hidden="true" />{wins.size} {wins.size === 1 ? 'star' : 'stars'} earned this month</span>
            <span className="inline-flex items-center gap-1.5"><span className="bg-primary size-2.5 rounded-full" aria-hidden="true" />Today</span>
          </p>
        </>
      )}
    </Card>
  );
}

/** Existing recognition only: recently validated contributions (no peer stars). */
export function RecognisedContributions({ validated }: { validated: Section<ValidatedContribution[]> }) {
  return (
    <Card aria-label="Recognised contributions">
      <CardTitle icon={UsersIcon} title="Recognised contributions" action={{ href: '/team', label: 'Meet team' }} />
      {validated.status === 'unavailable' ? <Unavailable what="Recognised contributions" /> : validated.data.length === 0 ? (
        <EmptyState title="Nothing validated yet" action={<Link href="/daily-facts" className="link text-sm font-semibold">Post a daily fact</Link>}>Validated facts, ideas and suggestions from the team appear here.</EmptyState>
      ) : (
        <ul className="divide-border divide-y">
          {validated.data.map((entry) => (
            <li key={`${entry.kind}-${entry.id}`} className="flex gap-3 py-3 first:pt-0 last:pb-0">
              <span aria-hidden="true" className="bg-primary-subtle text-primary-subtle-foreground flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-bold">
                {entry.authorName.charAt(0).toUpperCase()}
              </span>
              <div className="min-w-0">
                <p className="text-foreground text-sm font-semibold">{entry.authorName}</p>
                <p className="text-muted-foreground line-clamp-2 text-sm">{entry.content}</p>
                <p className="text-recognition-foreground mt-1 inline-flex items-center gap-1 text-xs font-semibold">
                  <StarIcon className="text-recognition size-3.5 fill-current" aria-hidden="true" />
                  {KIND_LABEL[entry.kind]} validated · {shortDate(entry.validatedAt.slice(0, 10))}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

export function AnalyticsTeaser({ monthLabel }: { monthLabel: string }) {
  return (
    <section aria-label="Team analytics" className="bg-primary-subtle/70 border-border flex flex-col gap-4 rounded-2xl border p-5 sm:flex-row sm:items-center sm:p-6">
      <span aria-hidden="true" className="bg-primary text-primary-foreground flex size-11 shrink-0 items-center justify-center rounded-xl">
        <BarChart3Icon className="size-5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="eyebrow">Team performance &amp; analytics</p>
        <h2 className="text-foreground mt-1 text-lg font-bold tracking-tight">Team analytics for {monthLabel}</h2>
        <p className="text-muted-foreground text-sm">KPIs, charts and award coverage, including any missing data.</p>
      </div>
      <Link href="/dashboard" className="bg-primary text-primary-foreground hover:bg-primary-hover flex items-center justify-center gap-1.5 rounded-xl px-5 py-2.5 text-sm font-semibold transition-colors">
        Explore analytics
        <ArrowRightIcon className="size-4" aria-hidden="true" />
      </Link>
    </section>
  );
}
