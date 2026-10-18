import type { User } from '@/types/tracker';

export type EmployeeRouteState<T> =
  | { readonly status: 'invalid' }
  | { readonly status: 'missing'; readonly employeeId: string }
  | { readonly status: 'ready'; readonly data: T };

export function normalizeEmployeeIdParam(rawEmployeeId: string): string | null {
  try {
    const decoded = decodeURIComponent(rawEmployeeId).trim();
    return decoded === '' || decoded.length > 60 ? null : decoded;
  } catch {
    return null;
  }
}

export async function resolveEmployeeRouteState<T>(
  rawEmployeeId: string,
  loadData: (employeeId: string) => Promise<T | null>,
): Promise<EmployeeRouteState<T>> {
  const employeeId = normalizeEmployeeIdParam(rawEmployeeId);

  if (!employeeId) return { status: 'invalid' };

  const data = await loadData(employeeId);

  if (!data) return { status: 'missing', employeeId };

  return { status: 'ready', data };
}

export function employeeHref(employee: Pick<User, 'employeeId'>): string {
  return `/team/${encodeURIComponent(employee.employeeId)}`;
}

export function employeeReportsHref(employee: Pick<User, 'employeeId'>): string {
  return `${employeeHref(employee)}/reports`;
}
