import { BUSINESS_TIME_ZONE, kolkataDate } from '@/shared/time/kolkata';

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

/** The check-out message: both times on top, then the daily report text. */
export function checkOutMessage(checkedInAt: string, checkedOutAt: string, report: string): string {
  const line = `Checked in at ${shareTime(new Date(checkedInAt))} · checked out at ${shareTime(new Date(checkedOutAt))}.`;
  return report.trim() ? `${line}\n\n${report.trim()}` : line;
}
