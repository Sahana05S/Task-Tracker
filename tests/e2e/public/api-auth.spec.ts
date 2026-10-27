import { test, expect } from '@playwright/test';

// Every API route must refuse an anonymous caller before doing any work.
// Worker routes need the worker bearer token; exports need a signed-in member.
// A wrong token is the strongest thing sent here, so nothing can run.

const WORKER_ROUTES: readonly { method: 'GET' | 'POST'; path: string }[] = [
  { method: 'POST', path: '/api/internal/attendance-autofill' },
  { method: 'POST', path: '/api/internal/attendance-photos' },
  { method: 'POST', path: '/api/internal/awards' },
  { method: 'GET', path: '/api/internal/drive' },
  { method: 'POST', path: '/api/internal/drive' },
  { method: 'GET', path: '/api/internal/health' },
  { method: 'POST', path: '/api/internal/policies' },
];

const EXPORT_ROUTES = [
  '/api/payroll/export?month=2026-09',
  '/api/records/activity',
  '/api/reports/export?format=csv',
  '/api/reports/export?report=daily-log',
];

test.describe('API authorization', () => {
  test.skip(({ isMobile }) => isMobile, 'HTTP-only checks; one project is enough');

  for (const { method, path } of WORKER_ROUTES) {
    for (const authorization of [undefined, 'Bearer qa-wrong-token']) {
      test(`${method} ${path} refuses ${authorization ? 'a wrong token' : 'no token'}`, async ({ request }) => {
        const response = await request.fetch(path, {
          method,
          headers: authorization ? { authorization } : {},
          maxRedirects: 0,
        });
        // 403 when the token is configured, 503 when the route is switched off.
        expect([401, 403, 503]).toContain(response.status());
        const body = await response.text();
        expect(body).not.toMatch(/outcomes|"status":"done"|certified/);
      });
    }
  }

  for (const path of EXPORT_ROUTES) {
    test(`GET ${path} refuses an anonymous caller`, async ({ request }) => {
      const response = await request.get(path, { maxRedirects: 0 });
      expect([401, 403]).toContain(response.status());
      expect(response.headers()['content-type']).toMatch(/json/);
    });
  }
});
