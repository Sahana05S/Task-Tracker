import type { LucideIcon } from 'lucide-react';
import {
  FileCheckIcon,
  KeyRoundIcon,
  LayersIcon,
  ShieldCheckIcon,
  SigmaIcon,
  TimerResetIcon,
} from 'lucide-react';

import type { UserRole } from '@/types/tracker';

/**
 * Landing page copy, typed and kept out of the components.
 *
 * Static by design: none of this belongs in the database, and holding it in
 * source means a wording change is reviewable in a diff.
 *
 * This page presents the platform's capabilities and governance model. It carries
 * no pricing, subscription tiers or sales copy — TaskPulse is presented as a
 * system to be evaluated on its access model and its arithmetic, not a product to
 * be shopped for.
 */

/* -------------------------------------------------------------------------- */
/* Calls to action                                                            */
/* -------------------------------------------------------------------------- */

export interface CallToAction {
  label: string;
  href: string;
}

/**
 * Every call to action on the page, in one place.
 *
 * Only two destinations exist: the sign-up pane and the sign-in pane of
 * `/login`. The header uses the shorter label because the bar is tight at small
 * widths; the hero and footer have room for the fuller one.
 */
export const CTA = {
  /** Primary action in the hero and footer. */
  launch: { label: 'Launch Workspace', href: '/login?tab=signup' },
  /** Primary action in the header, where space is tighter. */
  getStarted: { label: 'Get Started', href: '/login?tab=signup' },
  /** Returning members. */
  signIn: { label: 'Sign In', href: '/login?tab=signin' },
  /**
   * Secondary action in the hero. Jumps to the architecture section rather than
   * opening a sales conversation — the honest counterpart to a "talk to sales"
   * button on a system that has nothing to sell.
   */
  systemOverview: { label: 'System Overview', href: '#capabilities' },
} as const satisfies Record<string, CallToAction>;

/* -------------------------------------------------------------------------- */
/* Hero copy                                                                  */
/* -------------------------------------------------------------------------- */

export interface HeroCopy {
  eyebrow: string;
  headline: string;
  /** Exactly two sentences. Any more and the hero stops being a hero. */
  subtext: string;
}

export const HERO: HeroCopy = {
  eyebrow: 'Multi-metric performance tracking',
  headline: 'Control your engineering capacity & task velocity',
  subtext:
    'TaskPulse weights every task, records the hours against it, and measures each member against the team median. Progress becomes a figure you can defend in a review, not an impression.',
};

/* -------------------------------------------------------------------------- */
/* Navigation                                                                 */
/* -------------------------------------------------------------------------- */

export interface MarketingNavLink {
  label: string;
  /** In-page anchor. */
  href: string;
}

export const MARKETING_NAV: readonly MarketingNavLink[] = [
  { label: 'Features', href: '#features' },
  { label: 'How it works', href: '#how-it-works' },
  { label: 'Capabilities', href: '#capabilities' },
];

/* -------------------------------------------------------------------------- */
/* Features                                                                   */
/* -------------------------------------------------------------------------- */

export interface FeatureCard {
  id: string;
  title: string;
  summary: string;
  detail: string;
  icon: LucideIcon;
  /** Short proof points shown as a list under the detail. */
  points: readonly string[];
}

export const PRIMARY_FEATURES: readonly FeatureCard[] = [
  {
    id: 'multi-metric-math',
    title: 'Multi-Metric Math',
    summary: 'Weight, progress and hours on every task.',
    detail:
      'Each task carries a scale weight and a progress percentage. Scaled progress is a generated database column, so the number you report is the number the database computed.',
    icon: LayersIcon,
    points: [
      'Scaled progress = scale × progress %',
      'Hours logged per day, per task',
      'Productivity rate maintained automatically',
    ],
  },
  {
    id: 'team-medians',
    title: 'Team Medians',
    summary: 'Compare against the team, not a guess.',
    detail:
      'Productivity, workload allocation and criticality are each measured against the team median for the month, so an individual figure always arrives with the context needed to read it.',
    icon: SigmaIcon,
    points: [
      'Productivity differentials per member',
      'Priority loading allocation share',
      'Criticality scores from priority weights',
    ],
  },
  {
    id: 'decay-tracking',
    title: 'Decay Tracking',
    summary: 'Stalled work surfaces itself.',
    detail:
      'Tasks move from Fresh to Stale to Rotten as they go without an update. Nobody has to remember to chase; the grid shows which work has gone quiet.',
    icon: TimerResetIcon,
    points: [
      'Fresh within seven days',
      'Stale between seven and fourteen',
      'Rotten beyond fourteen without completion',
    ],
  },
];

/*
 * There is deliberately no second, smaller strip of feature cards. Three cards
 * carry the three measurements this product adds; a supporting row of four more
 * repeated the security and roles material that the capabilities section states
 * properly, and saying it twice in different words made both weaker.
 */

/* -------------------------------------------------------------------------- */
/* How it works                                                               */
/* -------------------------------------------------------------------------- */

export interface WorkflowStep {
  step: number;
  title: string;
  description: string;
}

export const WORKFLOW_STEPS: readonly WorkflowStep[] = [
  {
    step: 1,
    title: 'Weight the work',
    description:
      'Create a task, give it a scale weight, a priority and an assignee. The weight is what makes effort comparable later.',
  },
  {
    step: 2,
    title: 'Log the effort',
    description:
      'Contributors record hours and the progress those hours produced. Task progress and productivity update on submission.',
  },
  {
    step: 3,
    title: 'Read the medians',
    description:
      'The dashboard compares every member against the team median and names the star performer for the month.',
  },
];

/* -------------------------------------------------------------------------- */
/* System capabilities & enterprise governance                                */
/* -------------------------------------------------------------------------- */

export interface GovernanceCapability {
  id: string;
  title: string;
  summary: string;
  detail: string;
  icon: LucideIcon;
  /**
   * Implementation facts rather than claims. Each line corresponds to something
   * that exists in the schema or the action layer.
   */
  specifics: readonly string[];
}

export const GOVERNANCE_CAPABILITIES: readonly GovernanceCapability[] = [
  {
    id: 'row-level-security',
    title: 'Row-Level Security',
    summary: 'The database decides what you can read.',
    detail:
      'Every table has row-level security enabled, and with RLS on and no matching policy the default is refusal. Isolation is a property of the data layer, so it holds for the REST API and for anything else holding a valid token, not only for the interface.',
    icon: ShieldCheckIcon,
    specifics: [
      'RLS enabled on all four tables',
      'Policies scoped by auth.uid(), not by app state',
      'Write policies restate their predicate in WITH CHECK',
      'Role lookup runs SECURITY DEFINER with a pinned search_path',
    ],
  },
  {
    id: 'role-governance',
    title: 'Role Governance',
    summary: 'Managing Director and Project Engineer are different rights.',
    detail:
      'Four roles with distinct capabilities. Creating, editing and deleting tasks belongs to directors and engineers; contributors update status and progress on work assigned to them. Elevation is never self-service — a member cannot promote their own role.',
    icon: KeyRoundIcon,
    specifics: [
      'Four roles, checked in the action and in the policy',
      'Task creation and deletion limited to two roles',
      'Assignees confined to their own status and progress',
      'Self-promotion blocked by the profile update policy',
    ],
  },
  {
    id: 'auditability',
    title: 'Auditability',
    summary: 'Reported figures are derived, not asserted.',
    detail:
      'Scaled progress is a generated stored column, so no client can write it. Hours are attributed to the session that filed them, never to a user id taken from a form. Monthly statistics can be frozen into an immutable snapshot so a completed review remains readable after the underlying tasks move on.',
    icon: FileCheckIcon,
    specifics: [
      'scaled_progress is GENERATED ALWAYS and rejects writes',
      'Log ownership taken from the verified session',
      'Off-hours and zero-scale work excluded from medians',
      'Monthly snapshots keyed uniquely per member and period',
    ],
  },
];

/* -------------------------------------------------------------------------- */
/* Role governance matrix                                                     */
/* -------------------------------------------------------------------------- */

export interface RolePermission {
  id: string;
  /** What the capability allows. */
  capability: string;
  /** Roles that hold it. Everything else is refused. */
  grantedTo: readonly UserRole[];
}

/**
 * The permission model as actually enforced.
 *
 * `grantedTo` is typed against `UserRole`, so renaming a role in
 * `types/tracker.ts` breaks this table at compile time rather than leaving the
 * public page advertising a role that no longer exists.
 */
export const ROLE_MATRIX: readonly RolePermission[] = [
  {
    id: 'view-tasks',
    capability: 'View the team task grid',
    grantedTo: [
      'managing_director',
      'project_engineer',
      'data_manager',
      'team_member',
    ],
  },
  {
    id: 'log-effort',
    capability: 'Log effort against own assignments',
    grantedTo: [
      'managing_director',
      'project_engineer',
      'data_manager',
      'team_member',
    ],
  },
  {
    id: 'update-own',
    capability: 'Update status and progress on own tasks',
    grantedTo: [
      'managing_director',
      'project_engineer',
      'data_manager',
      'team_member',
    ],
  },
  {
    id: 'create-tasks',
    capability: 'Create and edit any task',
    grantedTo: ['managing_director', 'project_engineer'],
  },
  {
    id: 'delete-tasks',
    capability: 'Delete tasks and their effort history',
    grantedTo: ['managing_director', 'project_engineer'],
  },
  {
    id: 'freeze-snapshot',
    capability: 'Freeze a monthly performance snapshot',
    grantedTo: ['managing_director'],
  },
  {
    id: 'manage-profiles',
    capability: 'Manage member profiles and roles',
    grantedTo: ['managing_director'],
  },
];

/* -------------------------------------------------------------------------- */
/* Performance math                                                           */
/* -------------------------------------------------------------------------- */

export interface FormulaSpec {
  id: string;
  name: string;
  /** Written in plain text so it needs no maths renderer. */
  expression: string;
  note: string;
}

/** The arithmetic the platform runs, stated openly rather than summarised. */
export const PERFORMANCE_FORMULAS: readonly FormulaSpec[] = [
  {
    id: 'scaled-progress',
    name: 'Scaled progress',
    expression: 'Task Scale × (Progress % ÷ 100)',
    note: 'A generated stored column. PostgreSQL computes it; no client can write it.',
  },
  {
    id: 'productivity',
    name: 'Task productivity',
    expression: 'Scaled Progress ÷ Hours Logged',
    note: 'Undefined rather than zero when no hours have been logged.',
  },
  {
    id: 'productivity-diff',
    name: 'Productivity differential',
    expression: 'Pᵢ − Median(P)',
    note: 'Measured across active members with logged hours for the period.',
  },
  {
    id: 'allocation',
    name: 'Task allocation share',
    expression: '(Σ Scaleᵢ ÷ Σ Team Scale) × 100',
    note: 'Shares sum to 100, so over- and under-loading are both visible.',
  },
  {
    id: 'criticality',
    name: 'Criticality score',
    expression: 'mean priority weight · Focus 4 → No 0',
    note: 'Sorted by weight, not alphabetically, so Focus outranks High.',
  },
  {
    id: 'star-score',
    name: 'Composite monthly score',
    expression: '0.4·ProdDiff + 0.3·Progress + 0.2·Freshness − 0.1·Rotten',
    note: 'Each weighted term is shown alongside the total, so the result can be read rather than trusted.',
  },
];

/* -------------------------------------------------------------------------- */
/* Platform facts strip                                                       */
/* -------------------------------------------------------------------------- */

export interface PlatformFact {
  value: string;
  label: string;
}

/**
 * Concrete counts drawn from the schema, shown under the capabilities grid.
 *
 * Counted from the migrations, not estimated: 11 policies in `01`, one each in
 * `02` and `03`, and four in `04_milestones_and_vision.sql`, across six tables
 * with RLS enabled. Re-count before changing these — a wrong number on a page
 * that argues for verifiability is worse than no number.
 */
export const PLATFORM_FACTS: readonly PlatformFact[] = [
  { value: '6', label: 'Tables under row-level security' },
  { value: '17', label: 'Row-level security policies' },
  { value: '4', label: 'Governed workspace roles' },
  { value: '1', label: 'Generated column no client can write' },
];

/* -------------------------------------------------------------------------- */
/* Footer                                                                     */
/* -------------------------------------------------------------------------- */

export interface FooterColumn {
  heading: string;
  links: readonly { label: string; href: string }[];
}

/**
 * Footer navigation.
 *
 * Every entry resolves: in-page anchors for the documentation sections, real
 * routes for the workspace, and mailto addresses for contact. No pricing or plan
 * links, and nothing pointing at a page that does not exist.
 */
export const FOOTER_COLUMNS: readonly FooterColumn[] = [
  {
    heading: 'Platform',
    links: [
      { label: 'Features', href: '#features' },
      { label: 'How it works', href: '#how-it-works' },
      { label: 'Capabilities', href: '#capabilities' },
    ],
  },
  {
    heading: 'Documentation',
    links: [
      { label: 'Security model', href: '#capabilities' },
      { label: 'Role governance', href: '#role-governance' },
      { label: 'Performance math', href: '#performance-math' },
    ],
  },
  {
    heading: 'Workspace',
    links: [
      { label: CTA.launch.label, href: CTA.launch.href },
      { label: CTA.signIn.label, href: CTA.signIn.href },
    ],
  },
  {
    heading: 'Contact',
    links: [
      { label: 'Support', href: 'mailto:support@taskpulse.example' },
      { label: 'Security disclosure', href: 'mailto:security@taskpulse.example' },
      { label: 'Legal & privacy', href: 'mailto:legal@taskpulse.example' },
    ],
  },
];

/* -------------------------------------------------------------------------- */
/* Hero                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Figures under the hero.
 *
 * No icons: these are three numbers, and a glyph beside a number competes with it
 * for the eye without adding meaning. The label does the naming.
 */
export interface HeroStat {
  value: string;
  label: string;
}

export const HERO_STATS: readonly HeroStat[] = [
  { value: '13', label: 'Task categories tracked' },
  { value: '5', label: 'Priority levels weighted' },
  { value: '3', label: 'Freshness states monitored' },
];

/**
 * Assurances shown beneath the hero actions.
 *
 * Each describes how the system is built. None refers to billing, trials or
 * seat limits.
 */
export const HERO_ASSURANCES: readonly string[] = [
  'Row-level security enforced in the database',
  'Four governed workspace roles',
  'Derived metrics, not client-side arithmetic',
];
