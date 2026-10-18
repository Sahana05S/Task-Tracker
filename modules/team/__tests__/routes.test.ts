import { describe, expect, it, vi } from 'vitest';

import {
  employeeHref,
  employeeReportsHref,
  normalizeEmployeeIdParam,
  resolveEmployeeRouteState,
} from '@/modules/team/internal/routes';

describe('team route helpers', () => {
  it('normalizes employee id route params', () => {
    expect(normalizeEmployeeIdParam('SRB-HRC')).toBe('SRB-HRC');
    expect(normalizeEmployeeIdParam('SRB%20HRC')).toBe('SRB HRC');
    expect(normalizeEmployeeIdParam('  EMP-001  ')).toBe('EMP-001');
  });

  it('rejects empty, malformed, and too-long employee ids', () => {
    expect(normalizeEmployeeIdParam('')).toBeNull();
    expect(normalizeEmployeeIdParam('%')).toBeNull();
    expect(normalizeEmployeeIdParam('A'.repeat(61))).toBeNull();
  });

  it('does not load invalid employee params', async () => {
    const loadData = vi.fn<(employeeId: string) => Promise<unknown | null>>();

    await expect(resolveEmployeeRouteState('%', loadData)).resolves.toEqual({
      status: 'invalid',
    });
    expect(loadData).not.toHaveBeenCalled();
  });

  it('returns missing or ready route states for valid params', async () => {
    await expect(
      resolveEmployeeRouteState('MISSING', async () => null),
    ).resolves.toEqual({
      status: 'missing',
      employeeId: 'MISSING',
    });

    await expect(
      resolveEmployeeRouteState('EMP-001', async () => ({ ok: true })),
    ).resolves.toEqual({
      status: 'ready',
      data: { ok: true },
    });
  });

  it('builds profile and report links from employee ids', () => {
    const employee = { employeeId: 'SRB HRC' };

    expect(employeeHref(employee)).toBe('/team/SRB%20HRC');
    expect(employeeReportsHref(employee)).toBe('/team/SRB%20HRC/reports');
  });
});
