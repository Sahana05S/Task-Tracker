/**
 * The terms a `HelpTip` explains, each with the guide stage whose flowchart
 * shows it. Kept apart from the code glossary in `labels.ts` so the tip, a client
 * component, does not ship every code label.
 */

/* -------------------------------------------------------------------------- */
/* Terms explained by a HelpTip                                               */
/* -------------------------------------------------------------------------- */

/** The six stages of the one-page guide, in order. */
export const GUIDE_STAGES = ['missions', 'daily-work', 'records', 'scores', 'stars', 'month-close'] as const;
export type GuideStage = (typeof GUIDE_STAGES)[number];

export interface GlossaryTerm {
  readonly term: string;
  readonly meaning: string;
  /** The guide stage whose flowchart shows it. */
  readonly stage: GuideStage;
}

const t = (term: string, meaning: string, stage: GuideStage): GlossaryTerm => ({ term, meaning, stage });

export const GLOSSARY = {
  asOf: t('As of', 'The moment the figures are read at. Later changes do not alter what was true then.', 'month-close'),
  retained: t('Kept history', 'Every change is kept, so earlier versions stay readable. Nothing is overwritten.', 'records'),
  gate: t('Attendance check', 'To take part in awards, logged work each day must fit within attendance plus off-hours. It is a check, not a bonus.', 'daily-work'),
  scale: t('Scale', 'How big a mission is. Progress times scale is the work it is worth.', 'missions'),
  freshness: t('Freshness', 'How on-time a mission is, from Super Fresh (+3) to Rotten (−3).', 'missions'),
  medianDifference: t('Difference from the team median', 'Each factor compares you with the middle value of the team. Above the middle is positive, below is negative.', 'scores'),
  waypoint: t('Waypoint', 'A named stage a mission reaches at 30, 50, 70, 90 and 100% progress. It stays reached and never changes a score.', 'missions'),
  commendation: t('Commendation', 'Recognition a policy gives when its conditions are met. It never changes a score.', 'stars'),
  eligible: t('Counted in performance', 'A mission counts once it has a scale, a priority other than No, has started and reached 15%.', 'missions'),
  sections: t('Setup, Activity, Closure', 'Activity drives progress. All three, plus reviews, must be complete before Done.', 'missions'),
  loading: t('Loading', 'Your share of the team’s assigned work, shown as a percentage.', 'scores'),
  productivity: t('Productivity', 'Work done (progress times scale) per attendance hour.', 'scores'),
  offHours: t('Off-hours', 'Work outside the regular day, recorded separately from regular hours.', 'daily-work'),
  period: t('Period', 'A calendar month in India time. Pick a month and when to read it.', 'month-close'),
  pending: t('Waiting for review', 'Saved entries count at a lower rate until someone else validates them.', 'records'),
  monthClose: t('Month close', 'Closing keeps the month’s figures as they were. Corrections need a director and a reason.', 'month-close'),
} satisfies Record<string, GlossaryTerm>;

export type GlossaryKey = keyof typeof GLOSSARY;

/** The guide link for a glossary term: the guide opened at its stage. */
export function guideHref(term: Pick<GlossaryTerm, 'stage'>): string {
  return `/guide?stage=${term.stage}`;
}
