import type { LucideIcon } from 'lucide-react';
import {
  CompassIcon,
  HandshakeIcon,
  LightbulbIcon,
  RulerIcon,
  ShieldCheckIcon,
  UsersIcon,
} from 'lucide-react';

/**
 * Organisational showcase content.
 *
 * Static and typed, not database-backed. Nothing in the schema stores a vision
 * statement or a milestone, and `setup-roadmap.md` asks only that this tab
 * display them. Editing in the app would need a `milestones` table plus RLS, so
 * this stays in source until that is wanted — which also means the text is
 * reviewable in version control.
 *
 * Milestone entries below are the examples named in the Phase 5 brief. Replace
 * the wording with the organisation's own; the shapes are what the components
 * depend on.
 */

/* -------------------------------------------------------------------------- */
/* Vision and mission                                                         */
/* -------------------------------------------------------------------------- */

export interface StatementBlock {
  title: string;
  statement: string;
  detail: string;
  icon: LucideIcon;
}

export const VISION: StatementBlock = {
  title: 'Vision',
  statement:
    'To be the engineering partner clients trust with the work that cannot afford to go wrong.',
  detail:
    'Measured delivery over hurried delivery. Every drawing, calculation and estimate should stand up to scrutiny years after it was issued.',
  icon: CompassIcon,
};

export const MISSION: StatementBlock = {
  title: 'Mission',
  statement:
    'Turn every project into a documented, measurable, repeatable process.',
  detail:
    'We track scale, effort and progress on every task so that capacity is a known quantity, commitments are made from evidence, and nobody carries an invisible workload.',
  icon: RulerIcon,
};

/* -------------------------------------------------------------------------- */
/* Core values                                                                */
/* -------------------------------------------------------------------------- */

export interface CoreValue {
  name: string;
  description: string;
  icon: LucideIcon;
}

export const CORE_VALUES: readonly CoreValue[] = [
  {
    name: 'Technical Rigour',
    description:
      'Conclusions follow from calculations, not from confidence. Work is checked before it is issued.',
    icon: ShieldCheckIcon,
  },
  {
    name: 'Client Centricity',
    description:
      'The client should never have to ask where a project stands. Progress is reported before it is requested.',
    icon: HandshakeIcon,
  },
  {
    name: 'Shared Ownership',
    description:
      'Workload is distributed against the team median, not by who speaks up. Reviewers are named on every task.',
    icon: UsersIcon,
  },
  {
    name: 'Continuous Improvement',
    description:
      'Each project leaves behind a template, a checklist or a handbook that makes the next one faster.',
    icon: LightbulbIcon,
  },
];

/* -------------------------------------------------------------------------- */
/* Monthly milestones                                                         */
/* -------------------------------------------------------------------------- */

export type MilestoneStatus = 'Planned' | 'In Progress' | 'Achieved';

export interface Milestone {
  id: string;
  title: string;
  description: string;
  status: MilestoneStatus;
  /** Role or team accountable for the outcome. */
  owner: string;
  /** Units delivered so far, when the milestone is countable. */
  completed?: number;
  /** Target number of units. */
  target?: number;
}

export const MONTHLY_MILESTONES: readonly Milestone[] = [
  {
    id: 'construction-templates',
    title: 'Construction Templates',
    description:
      'Standardised drawing and specification templates covering the four most repeated structural details.',
    status: 'In Progress',
    owner: 'Project Engineering',
    completed: 2,
    target: 4,
  },
  {
    id: 'handbooks',
    title: 'Handbooks',
    description:
      'Written procedure handbooks for site inspection, quality review and issue handover.',
    status: 'In Progress',
    owner: 'Management',
    completed: 1,
    target: 3,
  },
  {
    id: 'client-centricity',
    title: 'Client Centricity',
    description:
      'A monthly progress summary issued to every active client without being asked for it.',
    status: 'Planned',
    owner: 'Data & Operations',
  },
  {
    id: 'effort-logging-discipline',
    title: 'Effort Logging Discipline',
    description:
      'Every active member logging hours against tracked tasks on every working day.',
    status: 'In Progress',
    owner: 'Whole team',
  },
  {
    id: 'zero-rotten-backlog',
    title: 'Zero Rotten Backlog',
    description:
      'No task left without an update for more than fourteen days at month end.',
    status: 'Planned',
    owner: 'Project Engineering',
  },
];

/** Milestones counted as delivered. */
export function achievedCount(
  milestones: readonly Milestone[] = MONTHLY_MILESTONES,
): number {
  return milestones.filter((milestone) => milestone.status === 'Achieved')
    .length;
}
