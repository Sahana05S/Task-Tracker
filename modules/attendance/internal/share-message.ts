import { BUSINESS_TIME_ZONE, kolkataDate } from '@/shared/time/kolkata';
import { clipInterval, mergedSeconds, type TimeInterval } from '@/shared/time/intervals';

/**
 * The WhatsApp messages a member sends after checking in or out (user
 * decision, 3 November 2026): the app drafts them and the member picks who
 * receives them in WhatsApp. Check-in is a greeting with the time and a
 * positive note; check-out is the daily report under one line with both times.
 * Pure and client-safe.
 */

const TIME = new Intl.DateTimeFormat('en-US', { timeZone: BUSINESS_TIME_ZONE, hour: 'numeric', minute: '2-digit', hour12: true });
const HOUR = new Intl.DateTimeFormat('en-GB', { timeZone: BUSINESS_TIME_ZONE, hour: '2-digit', hourCycle: 'h23' });
const DAY = new Intl.DateTimeFormat('en-GB', { timeZone: BUSINESS_TIME_ZONE, weekday: 'short', day: 'numeric', month: 'short' });

/** One per day, in order; consecutive days never repeat. */
export const CHECK_IN_NOTES = [
  "Small steps, big progress. Let's make today count!",
  'Ready to give today my best.',
  "Here's to a productive day!",
  "One mission at a time. Let's go!",
  "Grateful for this team. Let's make it a great day!",
  'Focused, fresh and ready to work.',
] as const;

/** Morning before 12:00, afternoon before 17:00, evening after, India time. */
export function greetingFor(at: Date): { greeting: string; emoji: string } {
  const hour = Number(HOUR.format(at));
  if (hour < 12) return { greeting: 'Good morning', emoji: '☀️' };
  if (hour < 17) return { greeting: 'Good afternoon', emoji: '🌤️' };
  return { greeting: 'Good evening', emoji: '🌙' };
}

/** The day's note: the India date counted in days, so each new day moves to the next note. */
export function noteFor(date: string): string {
  const days = Math.floor(Date.parse(`${date}T00:00:00Z`) / 86_400_000);
  const index = ((days % CHECK_IN_NOTES.length) + CHECK_IN_NOTES.length) % CHECK_IN_NOTES.length;
  return CHECK_IN_NOTES[index];
}

/** The display name up to the first space ("Sahana S" -> "Sahana"). */
export function firstName(fullName: string): string {
  return fullName.trim().split(/\s+/)[0] || 'I';
}

/** "9:12 AM", India time. */
export function shareTime(at: Date): string {
  return TIME.format(at);
}

/** The check-in greeting: who, when, and the day's positive note. */
export function checkInMessage(fullName: string, capturedAt: string): string {
  const at = new Date(capturedAt);
  const { greeting, emoji } = greetingFor(at);
  return [
    `${greeting}, team! ${emoji}`,
    `${firstName(fullName)} checked in at ${shareTime(at)} · ${DAY.format(at)}.`,
    noteFor(kolkataDate(at)),
  ].join('\n');
}

/**
 * The check-out message: both times on top, then the day in time blocks
 * (4 November 2026; empty when the day could not be read), then the daily
 * report text.
 */
export function checkOutMessage(checkedInAt: string, checkedOutAt: string, report: string, blocks = ''): string {
  const line = `Checked in at ${shareTime(new Date(checkedInAt))} · checked out at ${shareTime(new Date(checkedOutAt))}.`;
  return [line, blocks.trim(), report.trim()].filter(Boolean).join('\n\n');
}

/* -------------------------------------------------------------------------- */
/* The check-out report in time blocks (user decision, 4 November 2026)        */
/* -------------------------------------------------------------------------- */

/** Break times, "HH:MM" India time; null = no such break (the blocks on either side join). */
export interface BreakTimes {
  morningTeaAt: string | null;
  lunchStart: string | null;
  lunchEnd: string | null;
  eveningTeaAt: string | null;
}

/** Timed work on a mission: a timer segment, or a timer still running (`end` null, counted up to check-out). */
export interface BlockSession {
  taskId: string;
  taskTag: string;
  taskTitle: string;
  start: string;
  end: string | null;
}

/** Time logged without start and end; listed after the blocks. */
export interface BlockManualEntry {
  taskId: string;
  taskTag: string;
  taskTitle: string;
  hours: number;
}

export interface TimeBlockMission {
  taskId: string;
  taskTag: string;
  taskTitle: string;
  seconds: number;
}

export interface TimeBlock {
  /** "Check-in to morning tea". */
  label: string;
  /** Epoch milliseconds, clipped to check-in and check-out. */
  start: number;
  end: number;
  /** Each mission's time in the block (its own overlaps once), most time first. */
  missions: TimeBlockMission[];
  /** Productive seconds in the block: every timer merged, overlaps once. */
  productiveSeconds: number;
}

export interface TimeBlockDay {
  blocks: TimeBlock[];
  /** Sum of the blocks: timers merged, lunch and time outside check-in to check-out left out. */
  productiveSeconds: number;
  manual: BlockManualEntry[];
  manualHours: number;
}

type Point = { at: number; name: string };

/** The India wall time "HH:MM" on an India date, as epoch milliseconds. */
function wallTime(date: string, hhmm: string): number {
  return Date.parse(`${date}T${hhmm}:00+05:30`);
}

/**
 * Splits a checked-out day into blocks at the break times: check-in to morning
 * tea, morning tea to lunch, lunch to evening tea, evening tea to check-out.
 * Lunch itself is never counted. A block wholly before check-in or after
 * check-out is skipped and the edge blocks are clipped; a break that is not
 * set joins the blocks on either side. Under each block, every mission whose
 * timer ran in it with its time there, and the block's productive time with
 * overlapping timers counted once (migration 118). Pure.
 */
export function timeBlockDay(input: {
  date: string;
  checkedInAt: string;
  checkedOutAt: string;
  breaks: BreakTimes;
  sessions: readonly BlockSession[];
  manual: readonly BlockManualEntry[];
}): TimeBlockDay {
  const { date, breaks } = input;
  const checkIn = Date.parse(input.checkedInAt), checkOut = Date.parse(input.checkedOutAt);
  // Cut points in day order; the lunch gap (lunchStart to lunchEnd) is left out.
  const spans: { from: Point; to: Point }[] = [];
  let from: Point = { at: checkIn, name: 'Check-in' };
  const cut = (to: Point) => { spans.push({ from, to }); from = to; };
  if (breaks.morningTeaAt) cut({ at: wallTime(date, breaks.morningTeaAt), name: 'morning tea' });
  if (breaks.lunchStart && breaks.lunchEnd) {
    cut({ at: wallTime(date, breaks.lunchStart), name: 'lunch' });
    from = { at: wallTime(date, breaks.lunchEnd), name: 'Lunch' };
  }
  if (breaks.eveningTeaAt) cut({ at: wallTime(date, breaks.eveningTeaAt), name: 'evening tea' });
  cut({ at: checkOut, name: 'check-out' });

  const sessions = input.sessions.map((s) => ({ ...s, startMs: Date.parse(s.start), endMs: s.end === null ? checkOut : Date.parse(s.end) }));
  const blocks: TimeBlock[] = [];
  for (const span of spans) {
    const start = Math.max(span.from.at, checkIn), end = Math.min(span.to.at, checkOut);
    if (!(end > start)) continue;
    const byMission = new Map<string, { mission: Omit<TimeBlockMission, 'seconds'>; intervals: TimeInterval[] }>();
    const all: TimeInterval[] = [];
    for (const s of sessions) {
      const clipped = clipInterval({ start: s.startMs, end: s.endMs }, start, end);
      if (!clipped) continue;
      all.push(clipped);
      const entry = byMission.get(s.taskId) ?? { mission: { taskId: s.taskId, taskTag: s.taskTag, taskTitle: s.taskTitle }, intervals: [] };
      entry.intervals.push(clipped);
      byMission.set(s.taskId, entry);
    }
    const missions = [...byMission.values()]
      .map(({ mission, intervals }) => ({ ...mission, seconds: mergedSeconds(intervals) }))
      .sort((a, b) => b.seconds - a.seconds || a.taskTag.localeCompare(b.taskTag));
    const label = `${span.from.name} to ${span.to.name}`;
    blocks.push({ label: label.charAt(0).toUpperCase() + label.slice(1), start, end, missions, productiveSeconds: mergedSeconds(all) });
  }
  const manual = [...input.manual];
  return {
    blocks,
    productiveSeconds: blocks.reduce((total, block) => total + block.productiveSeconds, 0),
    manual,
    manualHours: manual.reduce((total, entry) => total + entry.hours, 0),
  };
}

/** "2 h 05 m", "45 m", "0 m". */
export function blockDuration(seconds: number): string {
  const minutes = Math.round(seconds / 60);
  const h = Math.floor(minutes / 60), m = minutes % 60;
  return h > 0 ? `${h} h ${String(m).padStart(2, '0')} m` : `${m} m`;
}

/** The time blocks as WhatsApp text (`*bold*`), English. */
export function formatTimeBlocks(day: TimeBlockDay): string {
  const lines: string[] = [];
  for (const block of day.blocks) {
    lines.push(`*${block.label}* (${shareTime(new Date(block.start))} – ${shareTime(new Date(block.end))})`);
    if (block.missions.length === 0) lines.push('No timers ran.');
    for (const mission of block.missions) {
      lines.push(`• ${mission.taskTag}${mission.taskTitle ? ` ${mission.taskTitle}` : ''} · ${blockDuration(mission.seconds)}`);
    }
    lines.push(`Productive: ${blockDuration(block.productiveSeconds)}`, '');
  }
  lines.push(`*Productive hours today · ${blockDuration(day.productiveSeconds)}*`, 'Timers that ran together count once; lunch is not counted.');
  if (day.manual.length) {
    lines.push('', `*Logged without times · ${blockDuration(day.manualHours * 3600)}*`);
    for (const entry of day.manual) lines.push(`• ${entry.taskTag}${entry.taskTitle ? ` ${entry.taskTitle}` : ''} · ${blockDuration(entry.hours * 3600)}`);
  }
  return lines.join('\n').trimEnd();
}
