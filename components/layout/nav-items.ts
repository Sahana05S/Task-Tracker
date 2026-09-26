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
 * The desktop sidebar renders every entry, grouped by section. The mobile bottom
 * bar renders only the entries flagged `inBottomNav`, because the centre slot
 * there is taken by the "Log Hours" action rather than a destination.
 */

/** Sidebar grouping. Rendered as an uppercase section heading. */
export type NavSection = 'menu' | 'general';

export interface NavItem {
  readonly label: string;
  readonly href: string;
  readonly icon: LucideIcon;
  readonly section: NavSection;
  /**
   * Whether this destination appears in the mobile bottom bar.
   *
   * The mobile layout allows four slots — Dashboard, Tasks, Log Hours and
   * Milestones — so Logs is excluded here. It stays reachable on mobile through
   * the quick-log sheet, which links to the full log history.
   */
  readonly inBottomNav: boolean;
}

export const NAV_ITEMS: readonly NavItem[] = [
  {
    label: 'Dashboard',
    href: '/dashboard',
    icon: LayoutDashboardIcon,
    section: 'menu',
    inBottomNav: true,
  },
  {
    label: 'Tasks',
    href: '/tasks',
    icon: ListChecksIcon,
    section: 'menu',
    inBottomNav: true,
  },
  {
    label: 'Logs',
    href: '/logs',
    icon: ClockIcon,
    section: 'menu',
    inBottomNav: false,
  },
  {
    label: 'Milestones',
    href: '/milestones',
    icon: TargetIcon,
    section: 'menu',
    inBottomNav: true,
  },
];

/** Section order and headings, as rendered in the sidebar. */
export const NAV_SECTIONS: readonly { id: NavSection; label: string }[] = [
  { id: 'menu', label: 'Menu' },
  { id: 'general', label: 'General' },
];

/**
 * True when `pathname` is the given nav href or one of its descendants, so
 * `/tasks/abc` still highlights `Tasks`.
 */
export function isNavItemActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}
