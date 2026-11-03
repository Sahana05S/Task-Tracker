import type { Json } from '@/types/database';

/** One command a person ran while their timer ran (migration 110). */
export interface TimerSessionEvent {
  readonly at: string;
  readonly action: string;
  readonly nodeTitle: string | null;
  readonly state: string | null;
}
export interface TimerSessionActivity {
  readonly timerId: string;
  readonly events: readonly TimerSessionEvent[];
}

const asText = (value: unknown): string | null => (typeof value === 'string' && value ? value : null);

/** A `timer_session_activity` row into its events; malformed entries are dropped. */
export function mapSessionActivity(row: { timer_id: string; events: Json }): TimerSessionActivity {
  const list = Array.isArray(row.events) ? row.events : [];
  const events = list.flatMap((entry) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return [];
    const at = asText(entry.at);
    const action = asText(entry.action);
    return at && action ? [{ at, action, nodeTitle: asText(entry.nodeTitle), state: asText(entry.state) }] : [];
  });
  return { timerId: row.timer_id, events };
}

// Checklist commands are stored as checklist_<command>; mission commands by their own name.
const CHECKLIST_WORDS: Record<string, [string, string]> = {
  add: ['Added', 'a row'],
  edit: ['Edited', 'a row'],
  delete: ['Removed', 'a row'],
  duplicate: ['Copied', 'a row'],
  reorder: ['Moved', 'a row'],
  map: ['Filed', 'a row'],
  submission: ['Added the Quest', ''],
  create: ['Started the checklist', ''],
  mode: ['Changed how the checklist counts', ''],
};
const MISSION_WORDS: Record<string, string> = {
  transition: 'changed the status',
  progress: 'updated progress',
  scale: 'set the scale',
  review: 'reviewed the mission',
  save_task_with_participants: 'saved the mission details',
};

const quoted = (title: string | null) => (title ? `“${title}”` : null);

/** One event in words: "ticked “Draw elevation” Yes", "added “Survey”". */
export function describeSessionEvent(event: TimerSessionEvent): string {
  if (event.action.startsWith('checklist_')) {
    const command = event.action.slice('checklist_'.length);
    if (command === 'state') return `marked ${quoted(event.nodeTitle) ?? 'a row'} ${event.state ?? 'changed'}`;
    const words = CHECKLIST_WORDS[command];
    if (!words) return 'changed the checklist';
    const [verb, fallback] = words;
    const subject = quoted(event.nodeTitle) ?? fallback;
    return `${verb.charAt(0).toLowerCase()}${verb.slice(1)}${subject ? ` ${subject}` : ''}`;
  }
  return MISSION_WORDS[event.action] ?? event.action.replaceAll('_', ' ');
}

/** "During this session: marked “A” Yes, added “B” and 2 more." — null when nothing was recorded. */
export function sessionSummary(events: readonly TimerSessionEvent[], shown = 3): string | null {
  if (events.length === 0) return null;
  const words = events.slice(0, shown).map(describeSessionEvent);
  const more = events.length - words.length;
  const list = more > 0 ? `${words.join(', ')} and ${more} more` : words.length > 1 ? `${words.slice(0, -1).join(', ')} and ${words.at(-1)}` : words[0];
  return `During this session: ${list}.`;
}
