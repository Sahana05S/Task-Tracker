import {
  AwardIcon,
  BadgeIndianRupeeIcon,
  BarChart3Icon,
  BookOpenIcon,
  CalendarCheckIcon,
  CalendarRangeIcon,
  CircleHelpIcon,
  ClockIcon,
  CrownIcon,
  DollarSignIcon,
  FileBadgeIcon,
  FileTextIcon,
  HashIcon,
  HistoryIcon,
  LightbulbIcon,
  ListChecksIcon,
  MessageSquareIcon,
  ScaleIcon,
  SettingsIcon,
  SparklesIcon,
  TrophyIcon,
  TargetIcon,
  UsersIcon,
  WalletIcon,
  WrenchIcon,
  type LucideIcon,
} from 'lucide-react';

import type { WallpaperMotif } from '@/shared/ui/wallpaper';
import type { UserRole } from '@/types/tracker';

/**
 * Workspace navigation (redesign, approved 15 October 2026).
 *
 * Five primary destinations plus a More menu. Every existing route keeps its
 * URL and permissions; grouped routes are reached through section tabs. Every
 * role sees every destination, and each page and the database keep enforcing
 * what a role may do there. The one exception is Payroll (M18): salary data is
 * the managing director's only, so its More item is listed for that role alone.
 */
export interface NavTab {
  readonly label: string;
  readonly href: string;
  /** Path prefixes that make this tab active. */
  readonly match: readonly string[];
  /** Prefixes inside `match` that belong to another tab. */
  readonly exclude?: readonly string[];
  readonly icon: LucideIcon;
  /** Listed only for these roles (the page and database still enforce access). */
  readonly roles?: readonly UserRole[];
  /** Line art behind this tab's pages when it differs from the section's. */
  readonly wallpaper?: WallpaperMotif;
}

export interface NavSection {
  readonly label: string;
  readonly href: string;
  readonly icon: LucideIcon;
  readonly tabs: readonly NavTab[];
  /** Shown in the phone bottom bar; the rest live under More. */
  readonly inBottomNav: boolean;
  /** Top-bar pill only from 1024 px; below that it is listed under More (the bar has no room at tablet width). */
  readonly wideOnly?: boolean;
  /** Line art behind the section's pages (`shared/ui/wallpaper.tsx`). */
  readonly wallpaper: WallpaperMotif;
}

export const NAV_SECTIONS: readonly NavSection[] = [
  {
    label: 'Today',
    href: '/today',
    icon: SparklesIcon,
    inBottomNav: true,
    wallpaper: 'constellation',
    tabs: [{ label: 'Today', href: '/today', match: ['/today'], icon: SparklesIcon }],
  },
  {
    label: 'Missions',
    href: '/tasks',
    icon: ListChecksIcon,
    inBottomNav: true,
    wallpaper: 'orbits',
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
    wallpaper: 'starfield',
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
    wallpaper: 'constellation',
    tabs: [
      { label: 'Analytics', href: '/dashboard', match: ['/dashboard'], icon: BarChart3Icon, wallpaper: 'orbits' },
      { label: 'People', href: '/team', match: ['/team'], exclude: ['/team/activity'], icon: UsersIcon },
      { label: 'Leaderboard', href: '/leaderboard', match: ['/leaderboard'], icon: TrophyIcon, wallpaper: 'sparkles' },
      { label: 'Awards', href: '/awards', match: ['/awards'], icon: AwardIcon, wallpaper: 'sparkles' },
      { label: 'Hall of fame', href: '/hall-of-fame', match: ['/hall-of-fame'], icon: CrownIcon, wallpaper: 'sparkles' },
      { label: 'Activity', href: '/team/activity', match: ['/team/activity'], icon: HistoryIcon },
    ],
  },
  {
    label: 'Policies',
    href: '/policies',
    icon: ScaleIcon,
    inBottomNav: false,
    wideOnly: true,
    wallpaper: 'starfield',
    tabs: [{ label: 'Policies', href: '/policies', match: ['/policies'], icon: ScaleIcon }],
  },
  {
    label: 'Reports',
    href: '/reports',
    icon: FileTextIcon,
    inBottomNav: false,
    wallpaper: 'starfield',
    tabs: [{ label: 'Reports', href: '/reports', match: ['/reports'], icon: FileTextIcon }],
  },
];

/** Low-frequency destinations under More (desktop menu and phone sheet). */
export const MORE_ITEMS: readonly NavTab[] = [
  { label: 'Company', href: '/milestones', match: ['/milestones'], icon: TargetIcon, wallpaper: 'constellation' },
  { label: 'Payroll', href: '/payroll', match: ['/payroll'], icon: WalletIcon, roles: ['managing_director'] },
  // Each member's own finalised months (M19); the managing director has Payroll.
  { label: 'My salary', href: '/my-salary', match: ['/my-salary'], icon: BadgeIndianRupeeIcon, roles: ['project_engineer', 'data_manager', 'team_member'] },
  // M19: Code of Conduct, letterhead and performance reviews, for everyone.
  { label: 'HR', href: '/hr', match: ['/hr'], icon: FileBadgeIcon },
  { label: 'Labels', href: '/labels', match: ['/labels'], icon: HashIcon },
  { label: 'Settings', href: '/settings', match: ['/settings'], icon: SettingsIcon },
  { label: 'Guide', href: '/guide', match: ['/guide'], icon: CircleHelpIcon },
];

/** The More items a role is shown. */
export function moreItemsFor(role: UserRole): readonly NavTab[] {
  return MORE_ITEMS.filter((item) => !item.roles || item.roles.includes(role));
}

function matches(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

export function isTabActive(pathname: string, tab: NavTab): boolean {
  return tab.match.some((prefix) => matches(pathname, prefix)) && !tab.exclude?.some((prefix) => matches(pathname, prefix));
}

/** The primary section that owns a path, if any. */
export function activeSection(pathname: string): NavSection | null {
  return NAV_SECTIONS.find((section) => section.tabs.some((tab) => isTabActive(pathname, tab))) ?? null;
}

export function isMoreActive(pathname: string): boolean {
  return MORE_ITEMS.some((item) => isTabActive(pathname, item));
}
