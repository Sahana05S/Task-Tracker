/**
 * Meetings (migration 136): types, mappers and pure helpers shared by the server reads and the
 * meeting components. Client-safe (no server imports). PRIVATE; exported through client.ts.
 */

export const POINT_STATUSES = ['Not Started', 'In Progress', 'Done', 'Discarded'] as const;
export type PointStatus = (typeof POINT_STATUSES)[number];
export const POINT_STATUS_LABEL: Record<PointStatus, string> = {
  'Not Started': 'Not started', 'In Progress': 'In progress', Done: 'Done', Discarded: 'Discarded',
};
/** One tap moves a point on: not started -> in progress -> done -> not started. */
export function nextPointStatus(status: PointStatus): PointStatus {
  return status === 'Not Started' ? 'In Progress' : status === 'In Progress' ? 'Done' : 'Not Started';
}
export const POINT_TYPES = ['General Point', 'Blocking Issue', 'Concern', 'Lessons Learned', 'Work Improvement'] as const;
export const MINUTES_MAX_LENGTH = 50_000;
export const POINT_MAX_LENGTH = 4_000;

export interface MeetingPerson { readonly id: string; readonly name: string; readonly active: boolean }
export interface MeetingMission { readonly id: string; readonly tag: string; readonly title: string; readonly status: string | null }
export interface MeetingSummary {
  readonly id: string;
  readonly title: string;
  readonly date: string;
  readonly startTime: string | null;
  readonly meetingType: string | null;
  readonly createdBy: string | null;
  readonly state: 'active' | 'withdrawn';
  readonly createdAt: string | null;
  readonly members: readonly MeetingPerson[];
  readonly missions: readonly MeetingMission[];
  readonly openPoints: number;
  readonly pointCount: number;
  readonly labelIds: readonly string[];
}
export interface MeetingPoint {
  readonly id: string;
  readonly point: string;
  readonly authorId: string | null;
  readonly ownerId: string | null;
  readonly pointType: string | null;
  readonly status: PointStatus;
  readonly due: string | null;
  readonly resolvedOn: string | null;
  readonly resolution: string | null;
  readonly comments: string | null;
  readonly relatedTaskId: string | null;
  readonly version: number;
  readonly canWithdraw: boolean;
}
export interface MeetingDetail extends MeetingSummary {
  readonly minutes: string;
  readonly version: number;
  readonly minutesSavedAt: string | null;
  readonly minutesSavedBy: string | null;
  readonly canEdit: boolean;
  readonly canManage: boolean;
  readonly points: readonly MeetingPoint[];
}

const text = (value: unknown): string | null => (typeof value === 'string' && value !== '' ? value : null);
const count = (value: unknown): number => (typeof value === 'number' && Number.isFinite(value) ? value : Number(value) || 0);
const list = (value: unknown): Record<string, unknown>[] =>
  Array.isArray(value) ? value.filter((row): row is Record<string, unknown> => Boolean(row) && typeof row === 'object') : [];
const status = (value: unknown): PointStatus =>
  (POINT_STATUSES as readonly unknown[]).includes(value) ? (value as PointStatus) : 'Not Started';

export function mapMeetingSummary(row: unknown): MeetingSummary | null {
  if (!row || typeof row !== 'object') return null;
  const m = row as Record<string, unknown>;
  if (typeof m.id !== 'string' || typeof m.date !== 'string') return null;
  return {
    id: m.id,
    title: String(m.title ?? 'Meeting'),
    date: m.date,
    startTime: text(m.startTime),
    meetingType: text(m.meetingType),
    createdBy: text(m.createdBy),
    state: m.state === 'withdrawn' ? 'withdrawn' : 'active',
    createdAt: text(m.createdAt),
    members: list(m.members).flatMap((p) => (typeof p.id === 'string' ? [{ id: p.id, name: String(p.name ?? 'Member'), active: p.active !== false }] : [])),
    missions: list(m.missions).flatMap((t) => (typeof t.id === 'string' ? [{ id: t.id, tag: String(t.tag ?? ''), title: String(t.title ?? ''), status: text(t.status) }] : [])),
    openPoints: count(m.openPoints),
    pointCount: count(m.pointCount),
    labelIds: Array.isArray(m.labelIds) ? m.labelIds.filter((id): id is string => typeof id === 'string') : [],
  };
}

export function mapMeetingDetail(row: unknown): MeetingDetail | null {
  const summary = mapMeetingSummary(row);
  if (!summary) return null;
  const m = row as Record<string, unknown>;
  return {
    ...summary,
    minutes: typeof m.minutes === 'string' ? m.minutes : '',
    version: count(m.version),
    minutesSavedAt: text(m.minutesSavedAt),
    minutesSavedBy: text(m.minutesSavedBy),
    canEdit: m.canEdit === true,
    canManage: m.canManage === true,
    points: list(m.points).flatMap((p) => (typeof p.id === 'string' ? [{
      id: p.id,
      point: String(p.point ?? ''),
      authorId: text(p.authorId),
      ownerId: text(p.ownerId),
      pointType: text(p.pointType),
      status: status(p.status),
      due: text(p.due),
      resolvedOn: text(p.resolvedOn),
      resolution: text(p.resolution),
      comments: text(p.comments),
      relatedTaskId: text(p.relatedTaskId),
      version: count(p.version),
      canWithdraw: p.canWithdraw === true,
    }] : [])),
  };
}

export interface MeetingFilter {
  readonly search?: string;
  readonly missionId?: string | null;
  readonly labelId?: string | null;
}

/** Meetings matching a search (title, type, members, missions) and the chosen mission and label. */
export function filterMeetings(meetings: readonly MeetingSummary[], filter: MeetingFilter): MeetingSummary[] {
  const words = (filter.search ?? '').toLowerCase().split(/\s+/).filter(Boolean);
  return meetings.filter((meeting) => {
    if (filter.missionId && !meeting.missions.some((mission) => mission.id === filter.missionId)) return false;
    if (filter.labelId && !meeting.labelIds.includes(filter.labelId)) return false;
    if (!words.length) return true;
    const haystack = [meeting.title, meeting.meetingType ?? '', ...meeting.members.map((m) => m.name),
      ...meeting.missions.flatMap((m) => [m.tag, m.title])].join(' ').toLowerCase();
    return words.every((word) => haystack.includes(word));
  });
}

/** Meetings grouped by calendar month (newest first, as they arrive), e.g. "November 2026". */
export function groupMeetingsByMonth(meetings: readonly MeetingSummary[]): { month: string; label: string; meetings: MeetingSummary[] }[] {
  const groups: { month: string; label: string; meetings: MeetingSummary[] }[] = [];
  for (const meeting of meetings) {
    const month = meeting.date.slice(0, 7);
    let group = groups.find((g) => g.month === month);
    if (!group) {
      const label = new Date(`${month}-01T00:00:00Z`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });
      group = { month, label, meetings: [] };
      groups.push(group);
    }
    group.meetings.push(meeting);
  }
  return groups;
}

/** The PostgreSQL conflict the minutes save reports when someone else saved first. */
export const MINUTES_CONFLICT = 'Someone else saved these minutes. Reload to see their version, then add your changes.';
