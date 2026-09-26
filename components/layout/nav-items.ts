import {
  ClockIcon,
  LayoutDashboardIcon,
  ListChecksIcon,
  TargetIcon,
  type LucideIcon,
} from 'lucide-react';

/**
 * Single source of truth for workspace navigation.
 *
 * Three surfaces consume this list: the permanent icon rail, the expanded drawer,
 * and the mobile bottom bar. The rail and the drawer render every entry; the
 * bottom bar renders only those flagged `inBottomNav`.
 *
 * Settings is deliberately absent. It is reached from the account menu, not from
 * navigation, so it does not compete with the four working destinations.
 */
export interface NavItem {
  readonly label: string;
  readonly href: string;
  readonly icon: LucideIcon;
  /**
   * Whether this destination appears in the mobile bottom bar.
   *
   * The mobile layout allows four slots — Dashboard, Tasks, Log Hours and
   * Milestones — so Logs is excluded here. It stays reachable on mobile through
   * the drawer and through the quick-log sheet.
   */
  readonly inBottomNav: boolean;
}

export const NAV_ITEMS: readonly NavItem[] = [
  {
    label: 'Dashboard',
    href: '/dashboard',
    icon: LayoutDashboardIcon,
    inBottomNav: true,
  },
  {
    label: 'Tasks',
    href: '/tasks',
    icon: ListChecksIcon,
    inBottomNav: true,
  },
  {
    label: 'Logs',
    href: '/logs',
    icon: ClockIcon,
    inBottomNav: false,
  },
  {
    label: 'Milestones',
    href: '/milestones',
    icon: TargetIcon,
    inBottomNav: true,
  },
];

/**
 * True when `pathname` is the given nav href or one of its descendants, so
 * `/tasks/abc` still highlights `Tasks`.
 */
export function isNavItemActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}
