/**
 * What the beaver says the first time someone opens a page: one plain hint per
 * route, longest prefix first. After the first visit it goes back to its
 * everyday line. Hints never report status; the page does that.
 */
export const BEAVER_HINTS: readonly (readonly [prefix: string, hint: string])[] = [
  ['/today', 'This is your day: missions due first. Tap a mission to log time or tick its checklist.'],
  ['/tasks/', 'Activity checklist items move this mission’s progress. Setup and Closure must be done before Done.'],
  ['/tasks', 'Every mission you share is here. Filter by status or due date, or switch to the table.'],
  ['/timelines', 'Bars run from start to due date. Missions without dates are listed underneath.'],
  ['/logs', 'Your time logs. A log is never deleted; reversing one keeps the history.'],
  ['/task-tools', 'Tools preview every change before it is saved, so you can check it first.'],
  ['/attendance', 'Tap a day to record it. Every day that has passed needs attendance before scores are final.'],
  ['/daily-facts', 'A fact counts more once someone else validates it.'],
  ['/ideas', 'Ideas earn credit; a validated one earns the most.'],
  ['/suggestions', 'Suggestions earn credit; a validated one earns the most.'],
  ['/sales', 'Mark new projects and basement payments; they add extra sales credit.'],
  ['/meeting-points', 'Give each point an owner and a due date so it gets resolved.'],
  ['/records/', 'This is the record’s history: every version is kept.'],
  ['/dashboard', 'Each chart compares people with the team median. Above the line is above the middle.'],
  ['/team/activity', 'Who changed what, newest first.'],
  ['/team', 'Open a person to see their missions, charts and reports.'],
  ['/leaderboard', 'Rankings use the same score as awards. Tap a factor to see its own board.'],
  ['/awards', 'Each factor has its award, then the star of the month.'],
  ['/hall-of-fame', 'Points come from stars and awards. They never change a score.'],
  ['/reports', 'Pick a month and when to read it. Closing a month keeps its figures as they were.'],
  ['/guide', 'Every term in the app is explained here. Look for the ? beside a word, too.'],
  ['/milestones', 'The company’s goals and milestones, in delivery order.'],
  ['/settings', 'Your own details and preferences.'],
];

/** The first-visit hint for a path, and the key it is remembered by. */
export function beaverHint(pathname: string): { key: string; hint: string } | null {
  let best: readonly [string, string] | null = null;
  for (const entry of BEAVER_HINTS) {
    const [prefix] = entry;
    const matches = prefix.endsWith('/') ? pathname.startsWith(prefix) : pathname === prefix || pathname.startsWith(`${prefix}/`);
    if (matches && (!best || prefix.length > best[0].length)) best = entry;
  }
  return best ? { key: best[0], hint: best[1] } : null;
}
