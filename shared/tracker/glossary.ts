/**
 * The terms a `HelpTip` explains, each with the guide section that explains it
 * in full. Kept apart from the code glossary in `labels.ts` so the tip, a client
 * component, does not ship every code label.
 */

/* -------------------------------------------------------------------------- */
/* Terms explained by a HelpTip                                               */
/* -------------------------------------------------------------------------- */

export type GuideTopic = 'missions' | 'checklist' | 'time' | 'records' | 'recognition' | 'waypoints' | 'policies' | 'reports' | 'analytics';

export interface GlossaryTerm {
  readonly term: string;
  readonly meaning: string;
  /** The guide page (and section) that explains it in full. */
  readonly topic: GuideTopic;
  readonly anchor: string;
}

const t = (term: string, meaning: string, topic: GuideTopic, anchor: string): GlossaryTerm => ({ term, meaning, topic, anchor });

export const GLOSSARY = {
  asOf: t('As of', 'The moment the figures are read at. Later changes do not alter what was true then.', 'reports', 'as-of'),
  retained: t('Kept history', 'Every change is kept, so earlier versions stay readable. Nothing is overwritten.', 'records', 'history'),
  gate: t('Attendance check', 'To take part in awards, logged work each day must fit within attendance plus off-hours. It is a check, not a bonus.', 'records', 'attendance'),
  scale: t('Scale', 'How big a mission is. Progress times scale is the work it is worth.', 'missions', 'scale'),
  freshness: t('Freshness', 'How on-time a mission is, from Super Fresh (+3) to Rotten (−3).', 'missions', 'freshness'),
  medianDifference: t('Difference from the team median', 'Each factor compares you with the middle value of the team. Above the middle is positive, below is negative.', 'analytics', 'median'),
  waypoint: t('Waypoint', 'A named stage a mission reaches at 30, 50, 70, 90 and 100% progress. It stays reached and never changes a score.', 'waypoints', 'waypoints'),
  commendation: t('Commendation', 'Recognition a policy gives when its conditions are met. It never changes a score.', 'policies', 'commendations'),
  eligible: t('Counted in performance', 'A mission counts once it has a scale, a priority other than No, has started and reached 15%.', 'missions', 'eligibility'),
  sections: t('Setup, Activity, Closure', 'Activity drives progress. All three, plus reviews, must be complete before Done.', 'checklist', 'sections'),
  loading: t('Loading', 'Your share of the team’s assigned work, shown as a percentage.', 'analytics', 'factors'),
  productivity: t('Productivity', 'Work done (progress times scale) per attendance hour.', 'analytics', 'factors'),
  offHours: t('Off-hours', 'Work outside the regular day, recorded separately from regular hours.', 'records', 'attendance'),
  period: t('Period', 'A calendar month in India time. Pick a month and when to read it.', 'reports', 'as-of'),
  pending: t('Waiting for review', 'Saved entries count at a lower rate until someone else validates them.', 'records', 'review'),
  monthClose: t('Month close', 'Closing keeps the month’s figures as they were. Corrections need a director and a reason.', 'reports', 'close'),
} satisfies Record<string, GlossaryTerm>;

export type GlossaryKey = keyof typeof GLOSSARY;

/** The guide link for a glossary term. */
export function guideHref(term: Pick<GlossaryTerm, 'topic' | 'anchor'>): string {
  return `/guide/${term.topic}#${term.anchor}`;
}
