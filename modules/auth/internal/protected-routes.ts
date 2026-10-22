export const PROTECTED_PREFIXES = [
  '/attendance',
  '/awards',
  '/daily-facts',
  '/dashboard',
  '/hall-of-fame',
  '/ideas',
  '/leaderboard',
  '/logs',
  '/meeting-points',
  '/policies',
  '/milestones',
  '/reports',
  '/records',
  '/sales',
  '/settings',
  '/suggestions',
  '/task-tools',
  '/tasks',
  '/team',
  '/timelines',
  '/today',
] as const;

export function isProtectedPath(pathname: string): boolean {
  return PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}
