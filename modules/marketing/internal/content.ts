import type { LucideIcon } from 'lucide-react';
import {
  ActivityIcon,
  BarChart3Icon,
  CheckCircle2Icon,
  ClockIcon,
  LayersIcon,
  SparklesIcon,
  TargetIcon,
  TimerResetIcon,
} from 'lucide-react';

/**
 * TaskPulse — Landing Page Content & Feature Showcase Copy
 *
 * Designed to showcase core application capabilities cleanly and dynamically,
 * inspired by high-impact business dashboard platforms (e.g. Zoho Analytics).
 */

/* -------------------------------------------------------------------------- */
/* Calls to action                                                            */
/* -------------------------------------------------------------------------- */

export interface CallToAction {
  label: string;
  href: string;
}

export const CTA = {
  launch: { label: 'Launch Workspace', href: '/login?tab=signup' },
  getStarted: { label: 'Get Started Free', href: '/login?tab=signup' },
  signIn: { label: 'Sign In', href: '/login?tab=signin' },
  exploreFeatures: { label: 'Explore Features', href: '#features' },
} as const satisfies Record<string, CallToAction>;

/* -------------------------------------------------------------------------- */
/* Hero copy                                                                  */
/* -------------------------------------------------------------------------- */

export interface HeroCopy {
  eyebrow: string;
  headline: string;
  /** Final word(s) of the headline, rendered in the accent gradient. */
  headlineAccent: string;
  subtext: string;
}

export const HERO: HeroCopy = {
  eyebrow: 'Modern Engineering Performance Tracking',
  headline: 'Control your team capacity, task velocity & performance',
  headlineAccent: 'performance',
  subtext:
    'TaskPulse weights every task, tracks daily logged effort, and benchmarks velocity against the team median. Move from guesswork to clear, transparent delivery insights.',
};

export const HERO_STATS = [
  { value: '100%', label: 'Objective median benchmarking' },
  { value: '3-tier', label: 'Automated freshness decay (Fresh, Stale, Rotten)' },
  { value: '< 30s', label: 'Frictionless daily effort logging' },
];

export const HERO_ASSURANCES = [
  'Transparent team velocity comparisons',
  'Automated task decay alerts',
  'Real-time productivity calculations',
];

/* -------------------------------------------------------------------------- */
/* Navigation                                                                 */
/* -------------------------------------------------------------------------- */

export interface MarketingNavLink {
  label: string;
  href: string;
}

export const MARKETING_NAV: readonly MarketingNavLink[] = [
  { label: 'Key Features', href: '#features' },
  { label: 'Interactive Views', href: '#interactive-views' },
  { label: 'How It Works', href: '#how-it-works' },
  { label: 'FAQ', href: '#faq' },
];

/* -------------------------------------------------------------------------- */
/* Alternating Feature Showcase Rows                                          */
/* -------------------------------------------------------------------------- */

export interface ShowcaseFeature {
  id: string;
  badge: string;
  title: string;
  description: string;
  imageSrc: string;
  imageAlt: string;
  imagePosition: 'left' | 'right';
  highlights: readonly string[];
  icon: LucideIcon;
}

export const SHOWCASE_FEATURES: readonly ShowcaseFeature[] = [
  {
    id: 'task-grid',
    badge: 'Spreadsheet-Fast Grid',
    title: 'Multi-metric task tracking with built-in scale weights',
    description:
      'Manage tasks with the speed of a spreadsheet and the power of a relational database. Track categories, assignees, priorities, and custom work weights (scale) that turn arbitrary to-dos into measurable capacity.',
    imageSrc: '/images/marketing/task-grid-preview.jpg',
    imageAlt: 'TaskPulse Task Tracker Grid View',
    imagePosition: 'right',
    icon: LayersIcon,
    highlights: [
      'Custom task scales (weights) for accurate effort normalization',
      'Dynamic freshness indicators: Fresh (<7d), Stale (7-14d), Rotten (>14d)',
      'Real-time progress bars with instant visual feedback',
      'Instant filtering across assignees, priorities, categories & statuses',
    ],
  },
  {
    id: 'performance-analytics',
    badge: 'Team Analytics & Medians',
    title: 'Objective performance benchmarks against the team median',
    description:
      'Stop relying on gut feeling or raw hours. TaskPulse benchmarks productivity rates and workload distributions against the team median, surfacing top contributors and unblocking hidden bottlenecks.',
    imageSrc: '/images/marketing/dashboard-preview.jpg',
    imageAlt: 'TaskPulse Team Performance Analytics Dashboard',
    imagePosition: 'left',
    icon: BarChart3Icon,
    highlights: [
      'Automated Star Performer identification with balanced weighting',
      'Productivity differentials measured per hour against the team median',
      'Interactive workload and capacity distribution charts',
      'Monthly snapshot tracking to preserve review history',
    ],
  },
  {
    id: 'effort-logging',
    badge: 'Frictionless Daily Logs',
    title: 'Quick effort logging with instant productivity feedback',
    description:
      'Contributors can log hours and incremental progress in under 30 seconds. A quick slide-out drawer lets team members record updates, link GitHub/Figma deliverables, and immediately see their impact.',
    imageSrc: '/images/marketing/effort-log-preview.jpg',
    imageAlt: 'TaskPulse Quick Daily Effort Logging Drawer',
    imagePosition: 'right',
    icon: ClockIcon,
    highlights: [
      'Single-click drawer accessible from any view in the workspace',
      'Live recalculation of task progress percentage and productivity',
      'Update notes and asset links (GitHub commits, PRs, design boards)',
      'Guaranteed attribution linked directly to active member sessions',
    ],
  },
];

/* -------------------------------------------------------------------------- */
/* Interactive Tabs Showcase (Zoho-style tab switcher)                        */
/* -------------------------------------------------------------------------- */

export interface InteractiveTabItem {
  id: string;
  tabLabel: string;
  headline: string;
  subtext: string;
  imageSrc: string;
  imageAlt: string;
  points: readonly string[];
}

export const INTERACTIVE_TABS: readonly InteractiveTabItem[] = [
  {
    id: 'tab-tasks',
    tabLabel: 'Task Management',
    headline: 'High-density task grid with real-time freshness & scale',
    subtext:
      'Designed for engineering teams who demand precision. Filter tasks instantly, adjust scales, and catch dormant work before deadlines slip.',
    imageSrc: '/images/marketing/task-grid-preview.jpg',
    imageAlt: 'Interactive preview of Task Grid',
    points: [
      'Scale weights (0–100) reflecting real complexity',
      'Freshness decay badges to flag inactive tickets',
      'Clear ownership with assignee and reviewer roles',
    ],
  },
  {
    id: 'tab-analytics',
    tabLabel: 'Performance Dashboard',
    headline: 'Team velocity and capacity clarity at a single glance',
    subtext:
      'Understand who carries what workload, how productivity distributes across departments, and recognize top contributors objectively.',
    imageSrc: '/images/marketing/dashboard-preview.jpg',
    imageAlt: 'Interactive preview of Performance Dashboard',
    points: [
      'Median-relative productivity rates per hour',
      'Allocation share % across active projects',
      'Transparent composite monthly star calculation',
    ],
  },
  {
    id: 'tab-logs',
    tabLabel: 'Effort & Progress Logs',
    headline: 'Seamless daily logging with zero administrative drag',
    subtext:
      'Make daily updates painless. Log hours, specify incremental progress deltas, and attach evidence links without complex timesheets.',
    imageSrc: '/images/marketing/effort-log-preview.jpg',
    imageAlt: 'Interactive preview of Effort Log Drawer',
    points: [
      'Incremental progress deltas (+10%, +25%)',
      'Documentation with external URLs and notes',
      'Instant task progress updates upon submission',
    ],
  },
];

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
    title: 'Weight & Assign the Work',
    description:
      'Create tasks with scale weights, priority levels, and owners. The weight normalizes small chores against heavy architectural milestones.',
  },
  {
    step: 2,
    title: 'Log Hours & Progress Deltas',
    description:
      'Contributors file quick daily logs recording hours and incremental progress. Task productivity and completion update automatically.',
  },
  {
    step: 3,
    title: 'Benchmark Against the Median',
    description:
      'Reviewers and managers see fair, data-backed dashboards comparing velocity to the team median, identifying bottlenecks and star contributors.',
  },
];

/* -------------------------------------------------------------------------- */
/* Customer FAQ (Clear, user-friendly, no code jargon)                       */
/* -------------------------------------------------------------------------- */

export interface FAQItem {
  question: string;
  answer: string;
}

export const FAQS: readonly FAQItem[] = [
  {
    question: 'How is TaskPulse different from a standard task or to-do board?',
    answer:
      'Most trackers treat all tasks as simple checkboxes regardless of difficulty. TaskPulse introduces work scale weighting, tracks actual effort in hours, and benchmarks member productivity against the team median for fair, accurate capacity management.',
  },
  {
    question: 'How does automated task freshness decay work?',
    answer:
      'Tasks without recent activity automatically decay from Fresh (updated within 7 days) to Stale (7–14 days) to Rotten (>14 days). As soon as team members log progress against a task, it immediately resets to Fresh.',
  },
  {
    question: 'Why measure productivity against the team median?',
    answer:
      'Averages can be distorted by outliers or varying task difficulties. Comparing against the team median provides an objective baseline, ensuring high performers are recognized while workloads are distributed equitably.',
  },
  {
    question: 'How do daily logs update task progress?',
    answer:
      'When logging effort, contributors provide hours worked and an optional progress delta (e.g., +20%). TaskPulse automatically accumulates total hours, applies the progress delta, and recalibrates the task productivity score in real time.',
  },
  {
    question: 'Can team members update tasks assigned to them?',
    answer:
      'Yes! Assigned contributors have full control to log daily effort, adjust progress percentages, and transition task statuses directly from the grid or the slide-out drawer.',
  },
];

/* -------------------------------------------------------------------------- */
/* Footer Navigation                                                          */
/* -------------------------------------------------------------------------- */

export interface FooterColumn {
  heading: string;
  links: readonly { label: string; href: string }[];
}

export const FOOTER_COLUMNS: readonly FooterColumn[] = [
  {
    heading: 'Product',
    links: [
      { label: 'Key Features', href: '#features' },
      { label: 'Interactive Views', href: '#interactive-views' },
      { label: 'How It Works', href: '#how-it-works' },
      { label: 'FAQ', href: '#faq' },
    ],
  },
  {
    heading: 'Get Started',
    links: [
      { label: CTA.launch.label, href: CTA.launch.href },
      { label: CTA.signIn.label, href: CTA.signIn.href },
    ],
  },
  {
    heading: 'Support',
    links: [
      { label: 'Help & Support', href: 'mailto:support@taskpulse.example' },
      { label: 'Privacy & Terms', href: 'mailto:legal@taskpulse.example' },
    ],
  },
];
