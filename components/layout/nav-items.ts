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
 * The desktop sidebar renders every entry. The mobile bottom bar renders only
 * the entries flagged `inBottomNav`, because the centre slot there is taken by
 * the "Log Hours" action button rather than a destination.
 */
export interface NavItem {
  readonly label: string;
  readonly href: string;
  readonly icon: LucideIcon;
  /**
   * Whether this destination appears in the mobile bottom bar.
   *
   * `responsive-ui-design.md` specifies four mobile slots as
   * Dashboard | Tasks | Log Hours (+) | Milestones, so Logs is excluded here.
   * It stays reachable on mobile through the quick-log sheet, which links to
   * the full log history.
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
