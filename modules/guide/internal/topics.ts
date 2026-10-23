import {
  ATTENDANCE_STATUS_MEANINGS,
  CHECKLIST_NODE_MEANINGS,
  TASK_FRESHNESS_MEANINGS,
  TASK_PRIORITY_MEANINGS,
  TASK_STATUS_MEANINGS,
  type GuideTopic,
} from '@/shared/tracker/labels';

/**
 * The guide's words, one entry per feature. Written in plain language from the
 * business rules (docs/plans/RULES.md); section ids are the anchors the
 * glossary's "Learn more" links point at.
 */

/** Icon keys for sections and steps; the components map each to a lucide icon. */
export const GUIDE_ICONS = [
  'tag', 'circleDot', 'flag', 'ruler', 'leaf', 'badgeCheck', 'users', 'listChecks', 'layers', 'timer', 'play',
  'undo', 'scale', 'calendarCheck', 'lightbulb', 'userCheck', 'receipt', 'history', 'star', 'trophy', 'flame',
  'award', 'rocket', 'scrollText', 'medal', 'calendarClock', 'fileText', 'lock', 'arrowUpDown', 'grid',
  'hourglass', 'moon', 'check', 'save', 'eye', 'send', 'edit', 'gauge', 'split', 'share', 'userPlus', 'folderOpen',
  'circleCheck', 'calendar', 'clock', 'user', 'target', 'sparkles', 'clipboardCheck', 'circleX',
] as const;
export type GuideIcon = (typeof GUIDE_ICONS)[number];

/** One stop in a flow, or one item in a set of parts. */
export interface GuideStep {
  readonly label: string;
  readonly icon: GuideIcon;
  /** A few words under the label. */
  readonly note?: string;
}

/**
 * The picture that leads a section. Every visual restates what the section's
 * own text says; it never adds a rule.
 * - `flow`: numbered steps in order; the last one is the outcome.
 * - `parts`: things that belong together, in no order.
 * - `badges`: the real status, priority, freshness or attendance badges with their meanings.
 * - `formula`: terms and operators (×, ÷, +, =, ≤) in a row; the term after = or ≤ is the result.
 * - `checks`: conditions that must all hold.
 * - `median`, `waypoints`, `factors`, `streak`: purpose-drawn diagrams.
 */
export type GuideVisual =
  | { readonly kind: 'flow'; readonly steps: readonly GuideStep[] }
  | { readonly kind: 'parts'; readonly items: readonly GuideStep[] }
  | { readonly kind: 'badges'; readonly set: 'status' | 'priority' | 'freshness' | 'attendance' }
  | { readonly kind: 'formula'; readonly parts: readonly string[]; readonly note?: string }
  | { readonly kind: 'checks'; readonly items: readonly string[] }
  | { readonly kind: 'median' }
  | { readonly kind: 'waypoints' }
  | { readonly kind: 'factors' }
  | { readonly kind: 'streak' };

export interface GuideSection {
  readonly id: string;
  readonly heading: string;
  /** One sentence shown first, lifted from the section's own text. */
  readonly lead: string;
  readonly icon: GuideIcon;
  readonly visual?: GuideVisual;
  /** The full explanation, shown under "More detail". */
  readonly paragraphs: readonly string[];
  /** A short list of terms and what each means. */
  readonly terms?: readonly { readonly term: string; readonly meaning: string }[];
}

export interface GuideTopicContent {
  readonly slug: GuideTopic;
  readonly title: string;
  /** One sentence for the index card. */
  readonly summary: string;
  /** Where to do it in the app. */
  readonly links: readonly { readonly label: string; readonly href: string }[];
  readonly sections: readonly GuideSection[];
}

const terms = (meanings: Record<string, string>) => Object.entries(meanings).map(([term, meaning]) => ({ term, meaning }));

export const GUIDE_TOPICS: readonly GuideTopicContent[] = [
  {
    slug: 'missions',
    title: 'Missions',
    summary: 'What a mission is, how its size and freshness are worked out, and when it counts.',
    links: [{ label: 'Open Missions', href: '/tasks' }, { label: 'Open Today', href: '/today' }],
    sections: [
      {
        id: 'basics',
        heading: 'A mission is one piece of work',
        lead: 'Every mission has a tag, a title, a category, a priority and the people assigned to it.',
        icon: 'tag',
        visual: { kind: 'parts', items: [{ label: 'Tag', icon: 'tag', note: 'Never changes' }, { label: 'Title', icon: 'edit' }, { label: 'Category', icon: 'folderOpen' }, { label: 'Priority', icon: 'flag' }, { label: 'People', icon: 'users', note: 'Assigned to it' }, { label: 'Progress', icon: 'gauge', note: '0 to 100%' }] },
        paragraphs: [
          'Every mission has a tag (like TT-12), a title, a category, a priority and the people assigned to it. The tag never changes, even when the title does.',
          'Progress runs from 0 to 100%. When a mission has a checklist, its Activity section sets the progress for you.',
        ],
      },
      {
        id: 'statuses',
        heading: 'Statuses',
        lead: 'Assignees can pause and resume; managers can move, cancel or reopen a mission, always with a reason.',
        icon: 'circleDot',
        visual: { kind: 'badges', set: 'status' },
        paragraphs: ['Assignees can pause and resume. Managers can move a mission to Carryover, cancel or reopen it, always with a reason.'],
        terms: terms(TASK_STATUS_MEANINGS),
      },
      {
        id: 'priorities',
        heading: 'Priorities',
        lead: 'Priority sets how much a mission weighs in criticality.',
        icon: 'flag',
        visual: { kind: 'badges', set: 'priority' },
        paragraphs: ['Priority sets how much a mission weighs in criticality: the sum of the weights of your counted missions.'],
        terms: terms(TASK_PRIORITY_MEANINGS),
      },
      {
        id: 'scale',
        heading: 'Scale: how big a mission is',
        lead: 'Scale says how much work a mission is worth.',
        icon: 'ruler',
        visual: { kind: 'formula', parts: ['Progress', '×', 'Scale', '÷', '100', '=', 'Scaled progress'], note: 'Typed in by a manager, or worked out from activities or logged hours.' },
        paragraphs: [
          'Scale says how much work a mission is worth. Progress times scale, divided by 100, is the "scaled progress" it has earned.',
          'A scale can be typed in by a manager or worked out from the mission: from a count of activities, or from logged hours (each hour is worth 12.5 times a multiplier). When it is worked out from hours, a new log’s hours count towards the scale before that log’s progress is credited.',
          'Credit you earned is kept at the scale and shares that applied when you earned it. Changing a scale later does not rewrite past credit.',
        ],
      },
      {
        id: 'freshness',
        heading: 'Freshness: how on-time a mission is',
        lead: 'Freshness is worked out from dates, and logging time never resets it.',
        icon: 'leaf',
        visual: { kind: 'badges', set: 'freshness' },
        paragraphs: [
          'Freshness is worked out from dates, in this order. A finished mission uses its completion date; an open one uses today. Logging time never resets it.',
          'A mission with a missing or future date, or a discarded one, has no freshness rather than a made-up value.',
        ],
        terms: terms(TASK_FRESHNESS_MEANINGS),
      },
      {
        id: 'eligibility',
        heading: 'When a mission counts in performance',
        lead: 'A mission counts in performance once all four of these are true.',
        icon: 'badgeCheck',
        visual: { kind: 'checks', items: ['Scale above zero', 'Priority other than No', 'Started (not Not Started or Discarded)', 'Reached 15% progress'] },
        paragraphs: [
          'A mission counts once it has a scale above zero, a priority other than No, has started (not Not Started or Discarded) and has reached 15% progress.',
          'Lists such as Today still show missions that do not count; they are labelled.',
        ],
      },
      {
        id: 'sharing',
        heading: 'Shared missions and support',
        lead: 'When several people share a mission, its scale and earned progress are split by their shares.',
        icon: 'users',
        visual: { kind: 'parts', items: [{ label: 'Shares', icon: 'split', note: 'Equal unless a manager sets otherwise' }, { label: 'Hours', icon: 'clock', note: 'Belong to whoever worked them' }, { label: 'Support', icon: 'userPlus', note: 'Even, Uneven, Proportional or Absolute' }] },
        paragraphs: [
          'When several people share a mission, its scale and earned progress are split by their shares (equal unless a manager sets otherwise). Hours always belong to the person who worked them.',
          'Tools can split a mission to give support: Even moves half, Uneven moves an agreed amount, Proportional links a percentage without reducing the source, and Absolute creates independent support work. Effort support keeps the category; Skill support uses Skill Development.',
        ],
      },
    ],
  },
  {
    slug: 'checklist',
    title: 'Checklist',
    summary: 'How Yes, No and N/A answers become progress, and what has to be complete before Done.',
    links: [{ label: 'Open Missions', href: '/tasks' }],
    sections: [
      {
        id: 'answers',
        heading: 'Answers',
        lead: 'Each item is answered Yes, No or N/A, and N/A items are left out.',
        icon: 'listChecks',
        visual: { kind: 'parts', items: [{ label: 'Yes', icon: 'circleCheck', note: 'Counts as 100%' }, { label: 'No', icon: 'circleX', note: 'Counts as 0%' }, { label: 'N/A', icon: 'circleDot', note: 'Left out' }] },
        paragraphs: [
          'Each item is answered Yes (100%), No (0%) or N/A. N/A items are left out, so they neither help nor hurt.',
          'A group or page is the plain average of what is directly inside it, so a nested page counts once, not once per item.',
        ],
        terms: terms(CHECKLIST_NODE_MEANINGS),
      },
      {
        id: 'sections',
        heading: 'Setup, Activity and Closure',
        lead: 'Only Activity drives progress, and all three sections must be complete before Done.',
        icon: 'layers',
        visual: { kind: 'flow', steps: [{ label: 'Setup', icon: 'clipboardCheck' }, { label: 'Activity', icon: 'gauge', note: 'Sets progress' }, { label: 'Closure', icon: 'check' }, { label: 'Reviews passed', icon: 'userCheck' }, { label: 'Done', icon: 'circleCheck' }] },
        paragraphs: [
          'A checklist has three sections. Only Activity drives the mission’s progress.',
          'Before a mission can be marked Done, all three sections must be complete (or N/A) and any assigned reviews must have passed. A linked mission at 100% is not automatically Done.',
          'A section that has not been set up yet is "not confirmed", which is not the same as complete.',
        ],
      },
      {
        id: 'item-time',
        heading: 'Timing an item',
        lead: 'Starting a timer on an item saves an ordinary time log for the mission.',
        icon: 'timer',
        visual: { kind: 'flow', steps: [{ label: 'Start a timer on an item', icon: 'play' }, { label: 'Time log saved', icon: 'save', note: 'Tagged with the item' }, { label: 'Hours count as usual', icon: 'circleCheck' }] },
        paragraphs: ['Starting a timer on an item saves an ordinary time log for the mission, tagged with the item, so the hours count in the usual way.'],
      },
    ],
  },
  {
    slug: 'time',
    title: 'Time',
    summary: 'Timers and time logs: how hours are recorded, corrected and checked against attendance.',
    links: [{ label: 'Open My time', href: '/logs' }],
    sections: [
      {
        id: 'logging',
        heading: 'Logging time',
        lead: 'Start a timer on a mission, or log hours afterwards.',
        icon: 'play',
        visual: { kind: 'flow', steps: [{ label: 'Start a timer', icon: 'play', note: 'One at a time' }, { label: 'Stop it, or log hours later', icon: 'clock' }, { label: 'Log saved', icon: 'save', note: 'Can add progress' }] },
        paragraphs: [
          'Start a timer on a mission, or log hours afterwards. Each log can also add progress to the mission.',
          'A timer that runs past midnight is split at midnight India time, so each day gets its own hours.',
          'You can run one timer at a time.',
        ],
      },
      {
        id: 'corrections',
        heading: 'Correcting a log',
        lead: 'A log is never deleted; reversing it keeps the original.',
        icon: 'undo',
        visual: { kind: 'flow', steps: [{ label: 'Original log kept', icon: 'save' }, { label: 'Reversal recorded', icon: 'history', note: 'Who, when and why' }, { label: 'Its progress removed', icon: 'undo' }] },
        paragraphs: [
          'A log is never deleted. Reversing it keeps the original and records who reversed it, when and why, and removes the progress that log actually added.',
          'Progress you asked for and progress actually applied can differ (for example when a mission is already at 100%); the applied amount is what counts.',
        ],
      },
      {
        id: 'attendance-check',
        heading: 'Time must fit within attendance',
        lead: 'On each day, the time you logged must fit within attendance plus off-hours.',
        icon: 'scale',
        visual: { kind: 'formula', parts: ['Time logged', '≤', 'Regular hours', '+', 'Off-hours'], note: 'Checked day by day.' },
        paragraphs: ['On each day, the time you logged across all missions must be no more than your regular attendance hours plus separately recorded off-hours. Spare hours on one day cannot cover extra time on another.'],
      },
    ],
  },
  {
    slug: 'records',
    title: 'Records',
    summary: 'Attendance, daily facts, ideas, suggestions, sales and meeting points, and how reviews work.',
    links: [{ label: 'Open Attendance', href: '/attendance' }, { label: 'Open Daily facts', href: '/daily-facts' }],
    sections: [
      {
        id: 'attendance',
        heading: 'Attendance',
        lead: 'Every day that has passed needs a status and the hours worked; a blank is not zero.',
        icon: 'calendarCheck',
        visual: { kind: 'badges', set: 'attendance' },
        paragraphs: [
          'Every day that has passed needs an attendance record: a status and the hours worked. A blank is not zero; enter the hours.',
          'Off-hours are recorded separately from regular hours. The attendance check (also called the gate) compares the time you logged with regular plus off-hours, day by day. It decides whether you can take part in awards; it never adds points.',
          'Managers can fill the month grid quickly: mark a holiday for everyone, or fill a day with the usual 8 hours (4 for a half day). You still confirm each change.',
        ],
        terms: terms(ATTENDANCE_STATUS_MEANINGS),
      },
      {
        id: 'contributions',
        heading: 'Facts, ideas and suggestions',
        lead: 'Facts, ideas and suggestions earn credit, and more once validated.',
        icon: 'lightbulb',
        visual: { kind: 'parts', items: [{ label: 'Fact', icon: 'fileText', note: '0.75 validated, 0.38 pending' }, { label: 'Idea or suggestion', icon: 'lightbulb', note: '2 validated, 0.75 pending' }, { label: 'Rejected or withdrawn', icon: 'circleX', note: 'Earns nothing' }] },
        paragraphs: [
          'Each validated fact earns 0.75 and each pending fact 0.38. Each validated idea or suggestion earns 2 and each pending one 0.75. Rejected and withdrawn entries earn nothing.',
          'Credit uses the date the entry is about, not the day it was typed.',
        ],
      },
      {
        id: 'review',
        heading: 'Reviews',
        lead: 'A new entry waits for review by someone other than its author.',
        icon: 'userCheck',
        visual: { kind: 'flow', steps: [{ label: 'Entry saved', icon: 'save' }, { label: 'Waiting for review', icon: 'hourglass' }, { label: 'Validated or rejected', icon: 'userCheck', note: 'By someone else' }] },
        paragraphs: [
          'A new entry waits for review. Someone other than the author must validate or reject it; you cannot review your own entry.',
          'If a reviewed entry is corrected, it goes back to waiting for review, and the earlier version and review are kept.',
        ],
      },
      {
        id: 'sales',
        heading: 'Sales',
        lead: 'Sales count per person and month, with extra for new projects and basement payments received.',
        icon: 'receipt',
        visual: { kind: 'checks', items: ['Every eligible entry counts', 'Extra for new projects', 'Extra for basement payments received', 'Pending and validated count; rejected and withdrawn do not'] },
        paragraphs: ['Sales count per person and month: every eligible entry, plus extra for new projects and for basement payments received. Pending and validated entries count; rejected and withdrawn do not. Older sheet entries without a known owner leave sales unavailable until they are reconciled.'],
      },
      {
        id: 'history',
        heading: 'Kept history',
        lead: 'Nothing is overwritten: every save keeps the earlier version.',
        icon: 'history',
        visual: { kind: 'flow', steps: [{ label: 'Save', icon: 'save' }, { label: 'Earlier version kept', icon: 'history', note: 'Who, when and why' }, { label: 'Read it in the history', icon: 'eye' }] },
        paragraphs: ['Nothing is overwritten. Every save keeps the earlier version, who changed it, when and why, so you can open a record’s history and read what it said before.'],
      },
    ],
  },
  {
    slug: 'recognition',
    title: 'Recognition',
    summary: 'Daily stars, the monthly star, streaks, the ceremony and the hall of fame.',
    links: [{ label: 'Open Awards', href: '/awards' }, { label: 'Open Leaderboard', href: '/leaderboard' }, { label: 'Open Hall of fame', href: '/hall-of-fame' }],
    sections: [
      {
        id: 'daily-star',
        heading: 'Daily star',
        lead: 'After each day ends, the highest score among those who pass the attendance check wins.',
        icon: 'star',
        visual: { kind: 'flow', steps: [{ label: 'Day ends', icon: 'moon' }, { label: 'Attendance check', icon: 'calendarCheck' }, { label: 'Highest score wins', icon: 'star', note: 'An exact tie means no winner' }] },
        paragraphs: [
          'After each day ends, the person with the highest performance score that day wins the daily star, among those who pass the attendance check.',
          'If two people have exactly the same top score, nobody wins that day. If data is missing, the day waits rather than guessing.',
        ],
      },
      {
        id: 'monthly-star',
        heading: 'Star of the month',
        lead: 'The star of the month has the most daily stars.',
        icon: 'trophy',
        visual: { kind: 'flow', steps: [{ label: 'Most daily stars', icon: 'star' }, { label: 'Tie broken by the month score', icon: 'scale' }, { label: 'Star of the month', icon: 'trophy' }] },
        paragraphs: ['The star of the month has the most daily stars. A tie is broken by the month’s performance score; an exact tie means no winner.'],
      },
      {
        id: 'streaks',
        heading: 'Streaks',
        lead: 'A day counts when you were Present or on a Half Day and logged time or posted an entry.',
        icon: 'flame',
        visual: { kind: 'streak' },
        paragraphs: ['A day counts towards your streak when you were Present or on a Half Day and logged time or posted a fact, idea or suggestion. Holidays, leave and off-hours days are skipped; an absent day or a working day with nothing logged ends the streak.'],
      },
      {
        id: 'ceremony',
        heading: 'The monthly ceremony and points',
        lead: 'Each month one award goes to the top value of each factor, then the star of the month.',
        icon: 'award',
        visual: { kind: 'parts', items: [{ label: 'Daily star', icon: 'star', note: '10 points' }, { label: 'Category award', icon: 'award', note: '25 points' }, { label: 'Monthly star', icon: 'trophy', note: '100 points' }] },
        paragraphs: [
          'Each month one award goes to the top value of each factor, then the star of the month. The managing director publishes it once the month has ended.',
          'Points (10 per daily star, 25 per category award, 100 per monthly star) fill the hall of fame. Points are separate and never change a performance score.',
        ],
      },
    ],
  },
  {
    slug: 'waypoints',
    title: 'Waypoints',
    summary: 'The five named stages every mission passes on its way to 100%.',
    links: [{ label: 'Open Missions', href: '/tasks' }],
    sections: [
      {
        id: 'waypoints',
        heading: 'Five stages',
        lead: 'Waypoints mark progress at 30, 50, 70, 90 and 100%.',
        icon: 'rocket',
        visual: { kind: 'waypoints' },
        paragraphs: [
          'Waypoints mark progress: Ignition at 30%, Escape Velocity at 50%, Deep Space at 70%, Final Approach at 90% and Landing at 100%.',
          'A waypoint stays reached even if progress later drops. Everyone on the mission is credited; the person whose save crossed it sees a short celebration.',
          'Waypoints award no points and never change a performance score.',
        ],
      },
    ],
  },
  {
    slug: 'policies',
    title: 'Policies',
    summary: 'Company rules such as arriving on time, checked each day, week or month, with commendations.',
    links: [{ label: 'Open Policies', href: '/policies' }],
    sections: [
      {
        id: 'policies',
        heading: 'What a policy is',
        lead: 'The managing director sets policies from templates and picks the period: a day, a week or a month.',
        icon: 'scrollText',
        visual: { kind: 'flow', steps: [{ label: 'Pick a template', icon: 'scrollText' }, { label: 'Choose the period', icon: 'calendar', note: 'Day, week or month' }, { label: 'Checked for each person', icon: 'users' }, { label: 'Met, not met or unavailable', icon: 'target' }] },
        paragraphs: [
          'The managing director sets policies from ready-made templates, such as "on time every working day", "full attendance" or "no overdue missions at month end", and picks the period: a day, a week or a month.',
          'Each policy is checked for each person with the same rule every time. The answer is met, not met, or unavailable when data is missing (for example a day without a check-in time). Missing data is never counted as a pass or a fail.',
        ],
      },
      {
        id: 'commendations',
        heading: 'Commendations',
        lead: 'Meeting a policy for a finished period earns a commendation.',
        icon: 'medal',
        visual: { kind: 'flow', steps: [{ label: 'Policy met', icon: 'circleCheck' }, { label: 'Commendation', icon: 'medal' }, { label: 'Ceremony and hall of fame', icon: 'sparkles' }] },
        paragraphs: ['Meeting a policy for a finished period earns a commendation, which can appear in the ceremony and the hall of fame. Commendations never change a performance score.'],
      },
    ],
  },
  {
    slug: 'reports',
    title: 'Reports',
    summary: 'Daily reports, month reports, choosing the moment figures are read, and closing a month.',
    links: [{ label: 'Open Reports', href: '/reports' }],
    sections: [
      {
        id: 'as-of',
        heading: 'Choosing the month and the moment',
        lead: 'Pick the month, then when to read it: now, at the end of a day, or at a custom time.',
        icon: 'calendarClock',
        visual: { kind: 'flow', steps: [{ label: 'Pick the month', icon: 'calendar' }, { label: 'Pick the moment', icon: 'clock', note: 'Now, end of a day or custom' }, { label: 'Figures as of then', icon: 'lock', note: 'Later changes do not alter them' }] },
        paragraphs: [
          'Reports and the dashboard read one calendar month in India time. Pick the month, then when to read it: now, at the end of a day, or at a custom time.',
          'Figures are read "as of" that moment, so changes made afterwards do not alter them. This is how you can see exactly what was known at the end of a day.',
        ],
      },
      {
        id: 'daily',
        heading: 'Daily report',
        lead: 'The daily report lists each person’s missions, logs and attendance for a day.',
        icon: 'fileText',
        visual: { kind: 'parts', items: [{ label: 'Missions', icon: 'listChecks' }, { label: 'Logs', icon: 'clock' }, { label: 'Attendance', icon: 'calendarCheck' }, { label: 'Share as text', icon: 'share' }] },
        paragraphs: ['The daily report lists each person’s missions, logs and attendance for a day and can be shared as text.'],
      },
      {
        id: 'close',
        heading: 'Closing a month',
        lead: 'Closing keeps the month’s figures, awards and reasons exactly as they were.',
        icon: 'lock',
        visual: { kind: 'flow', steps: [{ label: 'Month ends', icon: 'calendar' }, { label: 'Director closes it', icon: 'lock' }, { label: 'Figures kept', icon: 'save' }, { label: 'Corrections need a reason', icon: 'edit', note: 'A new revision; earlier ones stay readable' }] },
        paragraphs: [
          'The managing director closes a month. Closing keeps the month’s figures, awards and reasons exactly as they were; later edits do not change them.',
          'If some inputs were missing, the month can still be closed but is marked as closed with gaps. A correction names the exact records and dates to change and needs a reason; it creates a new revision, and earlier ones stay readable.',
        ],
      },
    ],
  },
  {
    slug: 'analytics',
    title: 'Analytics',
    summary: 'The ten performance factors and how each one compares you with the team.',
    links: [{ label: 'Open Analytics', href: '/dashboard' }],
    sections: [
      {
        id: 'median',
        heading: 'Difference from the team median',
        lead: 'For each factor, your value is compared with the team median: the middle value.',
        icon: 'arrowUpDown',
        visual: { kind: 'median' },
        paragraphs: [
          'For each factor, your value is compared with the team median: the middle value when everyone’s values are put in order. Your difference is your value minus the median, so above the middle is positive and below is negative.',
          'People without a value for a factor are left out of that median instead of being counted as zero. A measured zero still counts.',
        ],
      },
      {
        id: 'factors',
        heading: 'The ten factors',
        lead: 'The score adds up each difference times its weight.',
        icon: 'grid',
        visual: { kind: 'factors' },
        paragraphs: ['The score adds up each difference times its weight. If any factor is unavailable, the final score waits; the factors that are known are shown as a subtotal.'],
        terms: [
          { term: 'Productivity (× 1.5)', meaning: 'Scaled progress per attendance hour.' },
          { term: 'Criticality (× 0.5)', meaning: 'The sum of the priority weights of your counted missions.' },
          { term: 'Loading (× 40)', meaning: 'Your share of the team’s assigned scale, shown as a percentage.' },
          { term: 'Completion (× 1.5)', meaning: 'Missions finished (Done) in the month, including late ones.' },
          { term: 'Progress (× 0.0125)', meaning: 'Scaled progress earned in the month.' },
          { term: 'Sales (× 1)', meaning: 'Sales entries, with extra for new projects and basement payments.' },
          { term: 'Facts, Ideas, Suggestions (× 1 each)', meaning: 'Credit from your entries, more once validated.' },
          { term: 'Freshness (× 1)', meaning: 'The sum of your missions’ freshness, from +3 to −3 each.' },
        ],
      },
      {
        id: 'not-final',
        heading: 'When figures are not final',
        lead: 'Scores wait for complete inputs.',
        icon: 'hourglass',
        visual: { kind: 'checks', items: ['Every working day has attendance', 'The time logged each day fits within it'] },
        paragraphs: ['Scores wait for complete inputs: every working day needs attendance, and the time logged each day must fit within it. The Attendance page shows which days are missing.'],
      },
    ],
  },
];

/** The Guide home's "How TaskPulse works" path: one stop per step of a month, each opening its topic. */
export const GUIDE_FLOW: readonly (GuideStep & { readonly topic: GuideTopic })[] = [
  { label: 'Plan missions', icon: 'listChecks', topic: 'missions' },
  { label: 'Work the checklist', icon: 'clipboardCheck', topic: 'checklist' },
  { label: 'Log time', icon: 'timer', topic: 'time' },
  { label: 'Record the day', icon: 'calendarCheck', topic: 'records' },
  { label: 'Compare with the team', icon: 'arrowUpDown', topic: 'analytics' },
  { label: 'Earn stars', icon: 'star', topic: 'recognition' },
  { label: 'Close the month', icon: 'lock', topic: 'reports' },
];

/** Topics that run alongside the path rather than as a step of it. */
export const GUIDE_ALONG_THE_WAY: readonly GuideTopic[] = ['waypoints', 'policies'];

/** The Guide home's topic cards, in three groups. */
export const GUIDE_GROUPS: readonly { readonly title: string; readonly topics: readonly GuideTopic[] }[] = [
  { title: 'Do the work', topics: ['missions', 'checklist', 'time'] },
  { title: 'Record and review', topics: ['records', 'policies', 'reports'] },
  { title: 'Scores and recognition', topics: ['analytics', 'recognition', 'waypoints'] },
];

export function guideTopic(slug: string): GuideTopicContent | undefined {
  return GUIDE_TOPICS.find(topic => topic.slug === slug);
}
