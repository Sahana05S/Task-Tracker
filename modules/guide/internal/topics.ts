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

export interface GuideSection {
  readonly id: string;
  readonly heading: string;
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
        paragraphs: [
          'Every mission has a tag (like TT-12), a title, a category, a priority and the people assigned to it. The tag never changes, even when the title does.',
          'Progress runs from 0 to 100%. When a mission has a checklist, its Activity section sets the progress for you.',
        ],
      },
      {
        id: 'statuses',
        heading: 'Statuses',
        paragraphs: ['Assignees can pause and resume. Managers can move a mission to Carryover, cancel or reopen it, always with a reason.'],
        terms: terms(TASK_STATUS_MEANINGS),
      },
      {
        id: 'priorities',
        heading: 'Priorities',
        paragraphs: ['Priority sets how much a mission weighs in criticality: the sum of the weights of your counted missions.'],
        terms: terms(TASK_PRIORITY_MEANINGS),
      },
      {
        id: 'scale',
        heading: 'Scale: how big a mission is',
        paragraphs: [
          'Scale says how much work a mission is worth. Progress times scale, divided by 100, is the "scaled progress" it has earned.',
          'A scale can be typed in by a manager or worked out from the mission: from a count of activities, or from logged hours (each hour is worth 12.5 times a multiplier). When it is worked out from hours, a new log’s hours count towards the scale before that log’s progress is credited.',
          'Credit you earned is kept at the scale and shares that applied when you earned it. Changing a scale later does not rewrite past credit.',
        ],
      },
      {
        id: 'freshness',
        heading: 'Freshness: how on-time a mission is',
        paragraphs: [
          'Freshness is worked out from dates, in this order. A finished mission uses its completion date; an open one uses today. Logging time never resets it.',
          'A mission with a missing or future date, or a discarded one, has no freshness rather than a made-up value.',
        ],
        terms: terms(TASK_FRESHNESS_MEANINGS),
      },
      {
        id: 'eligibility',
        heading: 'When a mission counts in performance',
        paragraphs: [
          'A mission counts once it has a scale above zero, a priority other than No, has started (not Not Started or Discarded) and has reached 15% progress.',
          'Lists such as Today still show missions that do not count; they are labelled.',
        ],
      },
      {
        id: 'sharing',
        heading: 'Shared missions and support',
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
        paragraphs: [
          'Each item is answered Yes (100%), No (0%) or N/A. N/A items are left out, so they neither help nor hurt.',
          'A group or page is the plain average of what is directly inside it, so a nested page counts once, not once per item.',
        ],
        terms: terms(CHECKLIST_NODE_MEANINGS),
      },
      {
        id: 'sections',
        heading: 'Setup, Activity and Closure',
        paragraphs: [
          'A checklist has three sections. Only Activity drives the mission’s progress.',
          'Before a mission can be marked Done, all three sections must be complete (or N/A) and any assigned reviews must have passed. A linked mission at 100% is not automatically Done.',
          'A section that has not been set up yet is "not confirmed", which is not the same as complete.',
        ],
      },
      {
        id: 'item-time',
        heading: 'Timing an item',
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
        paragraphs: [
          'Start a timer on a mission, or log hours afterwards. Each log can also add progress to the mission.',
          'A timer that runs past midnight is split at midnight India time, so each day gets its own hours.',
          'You can run one timer at a time.',
        ],
      },
      {
        id: 'corrections',
        heading: 'Correcting a log',
        paragraphs: [
          'A log is never deleted. Reversing it keeps the original and records who reversed it, when and why, and removes the progress that log actually added.',
          'Progress you asked for and progress actually applied can differ (for example when a mission is already at 100%); the applied amount is what counts.',
        ],
      },
      {
        id: 'attendance-check',
        heading: 'Time must fit within attendance',
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
        paragraphs: [
          'Each validated fact earns 0.75 and each pending fact 0.38. Each validated idea or suggestion earns 2 and each pending one 0.75. Rejected and withdrawn entries earn nothing.',
          'Credit uses the date the entry is about, not the day it was typed.',
        ],
      },
      {
        id: 'review',
        heading: 'Reviews',
        paragraphs: [
          'A new entry waits for review. Someone other than the author must validate or reject it; you cannot review your own entry.',
          'If a reviewed entry is corrected, it goes back to waiting for review, and the earlier version and review are kept.',
        ],
      },
      {
        id: 'sales',
        heading: 'Sales',
        paragraphs: ['Sales count per person and month: every eligible entry, plus extra for new projects and for basement payments received. Pending and validated entries count; rejected and withdrawn do not. Older sheet entries without a known owner leave sales unavailable until they are reconciled.'],
      },
      {
        id: 'history',
        heading: 'Kept history',
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
        paragraphs: [
          'After each day ends, the person with the highest performance score that day wins the daily star, among those who pass the attendance check.',
          'If two people have exactly the same top score, nobody wins that day. If data is missing, the day waits rather than guessing.',
        ],
      },
      {
        id: 'monthly-star',
        heading: 'Star of the month',
        paragraphs: ['The star of the month has the most daily stars. A tie is broken by the month’s performance score; an exact tie means no winner.'],
      },
      {
        id: 'streaks',
        heading: 'Streaks',
        paragraphs: ['A day counts towards your streak when you were Present or on a Half Day and logged time or posted a fact, idea or suggestion. Holidays, leave and off-hours days are skipped; an absent day or a working day with nothing logged ends the streak.'],
      },
      {
        id: 'ceremony',
        heading: 'The monthly ceremony and points',
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
        paragraphs: [
          'The managing director sets policies from ready-made templates, such as "on time every working day", "full attendance" or "no overdue missions at month end", and picks the period: a day, a week or a month.',
          'Each policy is checked for each person with the same rule every time. The answer is met, not met, or unavailable when data is missing (for example a day without a check-in time). Missing data is never counted as a pass or a fail.',
        ],
      },
      {
        id: 'commendations',
        heading: 'Commendations',
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
        paragraphs: [
          'Reports and the dashboard read one calendar month in India time. Pick the month, then when to read it: now, at the end of a day, or at a custom time.',
          'Figures are read "as of" that moment, so changes made afterwards do not alter them. This is how you can see exactly what was known at the end of a day.',
        ],
      },
      {
        id: 'daily',
        heading: 'Daily report',
        paragraphs: ['The daily report lists each person’s missions, logs and attendance for a day and can be shared as text.'],
      },
      {
        id: 'close',
        heading: 'Closing a month',
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
        paragraphs: [
          'For each factor, your value is compared with the team median: the middle value when everyone’s values are put in order. Your difference is your value minus the median, so above the middle is positive and below is negative.',
          'People without a value for a factor are left out of that median instead of being counted as zero. A measured zero still counts.',
        ],
      },
      {
        id: 'factors',
        heading: 'The ten factors',
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
        paragraphs: ['Scores wait for complete inputs: every working day needs attendance, and the time logged each day must fit within it. The Attendance page shows which days are missing.'],
      },
    ],
  },
];

export function guideTopic(slug: string): GuideTopicContent | undefined {
  return GUIDE_TOPICS.find(topic => topic.slug === slug);
}
