import { GUIDE_STAGES, type GuideStage } from '@/shared/tracker/labels';

/**
 * The one-page guide: six stages of how TaskPulse works, each a small
 * flowchart and one line. Every box restates a rule from the business rules
 * (docs/plans/RULES.md); nothing here adds one. Help tips link to a stage
 * through `guideHref` (`/guide?stage=...`).
 */

/** How a box reads: where it starts, a step, a check, a good outcome, or a side path. */
export type FlowTone = 'start' | 'step' | 'check' | 'good' | 'aside';

export interface FlowNode {
  /** At most four words. */
  readonly title: string;
  /** At most four words under the title. */
  readonly note?: string;
  readonly tone: FlowTone;
}

export type GuideStageIcon = 'target' | 'clock' | 'listChecks' | 'chart' | 'star' | 'lock';

export interface GuideStageContent {
  readonly key: GuideStage;
  readonly title: string;
  readonly icon: GuideStageIcon;
  /** The one line under the flowchart. */
  readonly caption: string;
  /** The main path, left to right (top to bottom on phones). */
  readonly path: readonly FlowNode[];
  /** Alternatives the path ends in, one of which happens. */
  readonly split?: readonly FlowNode[];
  /** A side path off one box of the main path. */
  readonly branch?: { readonly from: number; readonly label: string; readonly node: FlowNode };
}

export const GUIDE_STAGE_CONTENT: readonly GuideStageContent[] = [
  {
    key: 'missions',
    title: 'Missions',
    icon: 'target',
    caption: 'A mission counts once it has a scale, a priority and 15% progress.',
    path: [
      { title: 'Not started', note: 'Assigned', tone: 'start' },
      { title: 'In progress', note: 'Progress 0 to 100%', tone: 'step' },
      { title: 'Done', note: 'Sections and reviews done', tone: 'good' },
    ],
    branch: { from: 1, label: 'Paused', node: { title: 'On hold', note: 'Can be resumed', tone: 'aside' } },
  },
  {
    key: 'daily-work',
    title: 'Daily work',
    icon: 'clock',
    caption: 'Time you log must fit inside your attendance, day by day.',
    path: [
      { title: 'Timer or log', note: 'Hours on a mission', tone: 'step' },
      { title: 'Fits attendance?', note: 'Regular plus off-hours', tone: 'check' },
      { title: 'Counts', note: 'Hours and progress', tone: 'good' },
    ],
    branch: { from: 1, label: 'If not', node: { title: 'Fix attendance', note: 'Then it counts', tone: 'aside' } },
  },
  {
    key: 'records',
    title: 'Records',
    icon: 'listChecks',
    caption: 'Someone other than the author reviews each entry.',
    path: [
      { title: 'Entry posted', note: 'Fact, idea or sale', tone: 'step' },
      { title: 'Waiting for review', note: 'Counts a little less', tone: 'check' },
    ],
    split: [
      { title: 'Validated', note: 'Full credit', tone: 'good' },
      { title: 'Rejected', note: 'No credit', tone: 'aside' },
    ],
  },
  {
    key: 'scores',
    title: 'Scores',
    icon: 'chart',
    caption: 'Ten factors, each compared with the middle of the team.',
    path: [
      { title: 'Your value', note: 'One per factor', tone: 'step' },
      { title: 'Minus team median', note: 'Above it is positive', tone: 'step' },
      { title: 'Times its weight', note: 'Then added up', tone: 'good' },
    ],
  },
  {
    key: 'stars',
    title: 'Stars',
    icon: 'star',
    caption: 'An exact tie means no winner. Points never change a score.',
    path: [
      { title: 'Day ends', note: 'Attendance check', tone: 'start' },
      { title: 'Top score', note: 'That day', tone: 'step' },
      { title: 'Daily star', note: '10 points', tone: 'good' },
    ],
    branch: { from: 2, label: 'Each month', node: { title: 'Star of the month', note: 'Most daily stars', tone: 'good' } },
  },
  {
    key: 'month-close',
    title: 'Month close',
    icon: 'lock',
    caption: 'Closing keeps the month’s figures exactly as they were.',
    path: [
      { title: 'Month ends', tone: 'start' },
      { title: 'Director closes it', note: 'Figures kept', tone: 'step' },
      { title: 'Corrections', note: 'Need a reason', tone: 'check' },
    ],
  },
];

/** The stage for a key, or the first stage for anything unknown. */
export function guideStage(key: string | undefined | null): GuideStageContent {
  return GUIDE_STAGE_CONTENT.find(stage => stage.key === key) ?? GUIDE_STAGE_CONTENT[0];
}

/** Where the old one-page-per-topic addresses now open. */
export const LEGACY_TOPIC_STAGE: Readonly<Record<string, GuideStage>> = {
  missions: 'missions',
  checklist: 'missions',
  waypoints: 'missions',
  time: 'daily-work',
  records: 'records',
  analytics: 'scores',
  recognition: 'stars',
  policies: 'stars',
  reports: 'month-close',
};

export { GUIDE_STAGES };
