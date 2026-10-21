import {
  BarChart3Icon,
  BookOpenIcon,
  CalendarCheckIcon,
  CalendarRangeIcon,
  ClockIcon,
  DollarSignIcon,
  FileTextIcon,
  LightbulbIcon,
  ListChecksIcon,
  MessageSquareIcon,
  SettingsIcon,
  SparklesIcon,
  TrophyIcon,
  TargetIcon,
  UsersIcon,
  WrenchIcon,
  type LucideIcon,
} from 'lucide-react';

/**
 * Workspace navigation (redesign, approved 15 October 2026).
 *
 * Five primary destinations plus a More menu. Every existing route keeps its
 * URL and permissions; grouped routes are reached through section tabs. Role
 * visibility is unchanged: every role sees every destination, and each page and
 * the database keep enforcing what a role may do there.
 */
export interface NavTab {
  readonly label: string;
  readonly href: string;
  /** Path prefixes that make this tab active. */
  readonly match: readonly string[];
  readonly icon: LucideIcon;
}

export interface NavSection {
  readonly label: string;
  readonly href: string;
  readonly icon: LucideIcon;
  readonly tabs: readonly NavTab[];
  /** Shown in the phone bottom bar; the rest live under More. */
  readonly inBottomNav: boolean;
}

export const NAV_SECTIONS: readonly NavSection[] = [
  {
    label: 'Today',
    href: '/today',
    icon: SparklesIcon,
    inBottomNav: true,
    tabs: [{ label: 'Today', href: '/today', match: ['/today'], icon: SparklesIcon }],
  },
  {
    label: 'Missions',
    href: '/tasks',
    icon: ListChecksIcon,
    inBottomNav: true,
    tabs: [
      { label: 'Missions', href: '/tasks', match: ['/tasks'], icon: ListChecksIcon },
      { label: 'Timeline', href: '/timelines', match: ['/timelines'], icon: CalendarRangeIcon },
      { label: 'My time', href: '/logs', match: ['/logs'], icon: ClockIcon },
      { label: 'Tools', href: '/task-tools', match: ['/task-tools'], icon: WrenchIcon },
    ],
  },
  {
    label: 'Records',
    href: '/attendance',
    icon: CalendarCheckIcon,
    inBottomNav: false,
    tabs: [
      { label: 'Attendance', href: '/attendance', match: ['/attendance', '/records/attendance'], icon: CalendarCheckIcon },
      { label: 'Daily facts', href: '/daily-facts', match: ['/daily-facts', '/records/fact'], icon: BookOpenIcon },
      { label: 'Ideas', href: '/ideas', match: ['/ideas', '/records/idea'], icon: LightbulbIcon },
      { label: 'Suggestions', href: '/suggestions', match: ['/suggestions', '/records/suggestion'], icon: MessageSquareIcon },
      { label: 'Sales', href: '/sales', match: ['/sales', '/records/sale'], icon: DollarSignIcon },
      { label: 'Meeting points', href: '/meeting-points', match: ['/meeting-points', '/records/meeting'], icon: MessageSquareIcon },
    ],
  },
  {
    label: 'Team',
    href: '/dashboard',
    icon: UsersIcon,
    inBottomNav: true,
    tabs: [
      { label: 'Analytics', href: '/dashboard', match: ['/dashboard'], icon: BarChart3Icon },
      { label: 'People', href: '/team', match: ['/team'], icon: UsersIcon },
      { label: 'Leaderboard', href: '/leaderboard', match: ['/leaderboard'], icon: TrophyIcon },
    ],
  },
  {
    label: 'Reports',
    href: '/reports',
    icon: FileTextIcon,
    inBottomNav: false,
    tabs: [{ label: 'Reports', href: '/reports', match: ['/reports'], icon: FileTextIcon }],
  },
];

/** Low-frequency destinations under More (desktop menu and phone sheet). */
export const MORE_ITEMS: readonly NavTab[] = [
  { label: 'Company', href: '/milestones', match: ['/milestones'], icon: TargetIcon },
  { label: 'Settings', href: '/settings', match: ['/settings'], icon: SettingsIcon },
];

function matches(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

export function isTabActive(pathname: string, tab: NavTab): boolean {
  return tab.match.some((prefix) => matches(pathname, prefix));
}

/** The primary section that owns a path, if any. */
export function activeSection(pathname: string): NavSection | null {
  return NAV_SECTIONS.find((section) => section.tabs.some((tab) => isTabActive(pathname, tab))) ?? null;
}

export function isMoreActive(pathname: string): boolean {
  return MORE_ITEMS.some((item) => isTabActive(pathname, item));
}
