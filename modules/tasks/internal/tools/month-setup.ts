import { renderTitlePattern } from '@/modules/settings/client';
import type { Json } from '@/types/database';
import type { TaskCategory, TaskPriority, TaskStatus } from '@/types/tracker';

/**
 * Month setup wizard plan (DECISIONS "Month setup wizard - 21 October 2026").
 * Pure functions only: the wizard shows what these compute, and migration 55's
 * month_setup_preview builds the authoritative plan with the same rules
 * (titles, weekly phases, month bounds). PRIVATE; exported through client.ts.
 */

/** A calendar month as `YYYY-MM`. */
export type MonthKey = string;

export interface MonthBounds {
  key: MonthKey;
  /** First day, `YYYY-MM-DD`. */
  start: string;
  /** Last day, `YYYY-MM-DD`. */
  end: string;
  days: number;
  /** "November 2026", the `{month}` value in standing mission titles. */
  label: string;
  /** "November". */
  name: string;
}

export interface Phase {
  week: number;
  start: string;
  end: string;
}

export interface SetupMember {
  id: string;
  name: string;
  role: string;
}

export interface SetupStanding {
  id: string;
  titlePattern: string;
  category: TaskCategory;
  priority: TaskPriority;
  ownerMode: 'per_member' | 'single';
  /** Single owner; null means the managing director at setup. */
  ownerId: string | null;
  scaleMode: string;
  sort: number;
}

export interface PreviousMission {
  id: string;
  taskTag: string;
  title: string;
  category: TaskCategory;
  status: TaskStatus;
  progress: number | null;
  assignedDate: string;
  dueDate: string | null;
  assigneeNames: string[];
  runningTimer: boolean;
}

export type PreviousAction = 'repeat' | 'carryover' | 'skip';

export interface MonthSetupSelection {
  month: MonthKey;
  /** `standingKey(missionId, memberId)` for every ticked cell. */
  standing: ReadonlySet<string>;
  /** Weekly Tasks Review phases owner; null leaves step 3 out. */
  phasesOwnerId: string | null;
  previous: ReadonlyMap<string, PreviousAction>;
}

const MONTH_KEY = /^(\d{4})-(0[1-9]|1[0-2])$/;
const LABEL = new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const NAME = new Intl.DateTimeFormat('en-GB', { month: 'long', timeZone: 'UTC' });
const SHORT = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });

const iso = (date: Date) => date.toISOString().slice(0, 10);
const utc = (key: MonthKey, day = 1) => {
  const match = MONTH_KEY.exec(key);
  if (!match) throw new Error(`Month must be YYYY-MM, got "${key}".`);
  return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, day));
};

export function monthBounds(key: MonthKey): MonthBounds {
  const first = utc(key);
  const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0));
  return { key, start: iso(first), end: iso(last), days: last.getUTCDate(), label: LABEL.format(first), name: NAME.format(first) };
}

/** The month of a `YYYY-MM-DD` date. */
export function monthOf(date: string): MonthKey {
  return date.slice(0, 7);
}

export function addMonths(key: MonthKey, count: number): MonthKey {
  const first = utc(key);
  return iso(new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + count, 1))).slice(0, 7);
}

/** Seven-day phases from the 1st; the last one is clipped to month end. */
export function weeklyPhases(key: MonthKey): Phase[] {
  const { days } = monthBounds(key);
  return Array.from({ length: Math.ceil(days / 7) }, (_, index) => ({
    week: index + 1,
    start: iso(utc(key, index * 7 + 1)),
    end: iso(utc(key, Math.min(index * 7 + 7, days))),
  }));
}

export function phaseTitle(key: MonthKey, week: number): string {
  return `Tasks Review - ${monthBounds(key).label} - Week ${week}`;
}

export function phaseRange(phase: Phase): string {
  return `${SHORT.format(new Date(`${phase.start}T00:00:00Z`))} – ${SHORT.format(new Date(`${phase.end}T00:00:00Z`))}`;
}

/** Next month by default; the current month while it has no missions. */
export function defaultSetupMonth(today: string, currentMonthHasMissions: boolean): MonthKey {
  return currentMonthHasMissions ? addMonths(monthOf(today), 1) : monthOf(today);
}

/** The "Set up <month>" banner: from the 25th while next month has no missions. */
export function setupBannerMonth(today: string, nextMonthMissions: number): MonthKey | null {
  return Number(today.slice(8, 10)) >= 25 && nextMonthMissions === 0 ? addMonths(monthOf(today), 1) : null;
}

/**
 * The approved D12 handoff targets the current month only and archives the
 * source on the commit day, so a month set up ahead of its 1st gets its
 * carry-overs once it starts.
 */
export function carryoverAvailable(month: MonthKey, today: string): boolean {
  return month === monthOf(today);
}

export function standingKey(missionId: string, memberId: string): string {
  return `${missionId}:${memberId}`;
}

/** Owner of a single-owner standing mission: its saved owner when active, else the MD. */
export function singleOwner(mission: SetupStanding, members: readonly SetupMember[], directorId: string | null): string | null {
  return mission.ownerId && members.some((member) => member.id === mission.ownerId) ? mission.ownerId : directorId;
}

/** Every active member gets the full set; single missions go to their owner. */
export function defaultStandingSelection(
  standing: readonly SetupStanding[],
  members: readonly SetupMember[],
  directorId: string | null,
): Set<string> {
  const selected = new Set<string>();
  for (const mission of standing) {
    if (mission.ownerMode === 'per_member') {
      for (const member of members) selected.add(standingKey(mission.id, member.id));
    } else {
      const owner = singleOwner(mission, members, directorId);
      if (owner) selected.add(standingKey(mission.id, owner));
    }
  }
  return selected;
}

export function standingTitle(mission: SetupStanding, key: MonthKey, memberName: string): string {
  return renderTitlePattern(mission.titlePattern, utc(key), memberName);
}

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function mentionsMonth(title: string, key: MonthKey): boolean {
  return new RegExp(`\\b${monthBounds(key).name}\\b`, 'i').test(title);
}

/** "Payroll - October 2026" → "Payroll - November 2026"; a bare "October" becomes "November". */
export function swapMonthInTitle(title: string, from: MonthKey, to: MonthKey): string {
  const a = monthBounds(from);
  const b = monthBounds(to);
  return title
    .replace(new RegExp(`\\b${a.name} ${from.slice(0, 4)}\\b`, 'gi'), b.label)
    .replace(new RegExp(`\\b${a.name}\\b`, 'gi'), b.name);
}

/**
 * A mission this setup already recreates: its title is one of the included
 * standing patterns rendered for its own month (any member), or a weekly Tasks
 * Review phase while phases are included. Step 4 hides these.
 */
export function coverageMatcher(standing: readonly SetupStanding[], phases = true): (mission: PreviousMission) => boolean {
  const byMonth = new Map<MonthKey, RegExp[]>();
  const patterns = (key: MonthKey) => {
    let list = byMonth.get(key);
    if (!list) {
      const label = escapeRegExp(monthBounds(key).label);
      list = standing.map((item) => new RegExp(`^${escapeRegExp(item.titlePattern).replaceAll('\\{month\\}', label).replaceAll('\\{member\\}', '.+')}$`, 'i'));
      byMonth.set(key, list);
    }
    return list;
  };
  return (mission) => {
    const title = mission.title.trim();
    if (phases && TASKS_REVIEW.test(title)) return true;
    return patterns(monthOf(mission.assignedDate)).some((pattern) => pattern.test(title));
  };
}

const TASKS_REVIEW = /^Tasks Review\b/i;

export function isCovered(mission: PreviousMission, standing: readonly SetupStanding[], phases = true): boolean {
  return coverageMatcher(standing, phases)(mission);
}

/**
 * Discarded and Done skip; a title naming its month repeats; started,
 * unfinished work carries over; anything else is skipped.
 */
export function defaultPreviousAction(mission: PreviousMission): PreviousAction {
  if (mission.status === 'Done' || mission.status === 'Discarded') return 'skip';
  if (mentionsMonth(mission.title, monthOf(mission.assignedDate))) return 'repeat';
  const progress = mission.progress ?? 0;
  return progress > 0 && progress < 100 ? 'carryover' : 'skip';
}

/** Step 4 rows: earlier missions not covered by steps 2 and 3, with their defaults. */
export function previousRows(missions: readonly PreviousMission[], standing: readonly SetupStanding[], phases = true) {
  const covered = coverageMatcher(standing, phases);
  return missions
    .filter((mission) => !covered(mission))
    .map((mission) => ({ mission, defaultAction: defaultPreviousAction(mission) }));
}

/**
 * The month_setup_preview payload. Carry-overs are sent only once the month
 * has started; before that they wait (see `carryoverAvailable`).
 */
export function buildSetupPayload(selection: MonthSetupSelection, today: string): Record<string, Json> {
  const carry = carryoverAvailable(selection.month, today);
  return {
    month: selection.month,
    standing: [...selection.standing].sort().map((key) => {
      const [missionId, memberId] = key.split(':');
      return { missionId, memberId };
    }),
    phases: selection.phasesOwnerId ? { ownerId: selection.phasesOwnerId } : null,
    previous: [...selection.previous]
      .filter(([, action]) => action === 'repeat' || (action === 'carryover' && carry))
      .map(([taskId, action]) => ({ taskId, action })),
  };
}
