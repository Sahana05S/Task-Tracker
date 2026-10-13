export const PROTECTED_PREFIXES = [
  '/attendance',
  '/daily-facts',
  '/dashboard',
  '/ideas',
  '/logs',
  '/meeting-points',
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
] as const;

export function isProtectedPath(pathname: string): boolean {
  return PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}
