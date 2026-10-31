import { test, expect, horizontalOverflow } from '../fixtures';
import { WORKSPACE_ROUTES, type Audience } from '../routes';

// Signed-in crawl: every workspace page, once per role project. Read-only:
// it opens pages and never presses a button that saves anything.

const ERROR_BOUNDARY = 'This page didn’t load';
const NOT_FOUND = 'There is nothing here';

function mayOpen(role: string, audience: Audience): boolean {
  if (audience === 'all') return true;
  return role === 'md';
}

test.describe('workspace crawl', () => {
  test.beforeEach(({}, testInfo) => {
    const role = String(testInfo.project.metadata.role);
    test.skip(!process.env[`QA_${role.toUpperCase()}_EMAIL`], `no QA ${role} account configured`);
  });

  for (const route of WORKSPACE_ROUTES) {
    test(`${route.path}`, async ({ page, diagnostics, isMobile }, testInfo) => {
      const role = String(testInfo.project.metadata.role);
      const response = await page.goto(route.path);
      expect(response?.status() ?? 0, 'document status').toBeLessThan(500);
      await expect(page).not.toHaveURL(/\/login/);
      await expect(page.getByText(ERROR_BOUNDARY), 'error boundary').toHaveCount(0);

      const placeholder = /QA_NO_SUCH|00000000-0000-4000-8000-000000000000/.test(route.path);
      if (!mayOpen(role, route.audience)) {
        // Refused: a Not found page or a redirect off the page, never its content.
        // A page-level redirect arrives after the layout has started streaming, so poll.
        await expect
          .poll(async () => (await page.getByText(NOT_FOUND).count()) > 0 || !page.url().includes(route.path), {
            message: `${role} must not open ${route.path}`,
          })
          .toBe(true);
      } else if (placeholder) {
        await expect(page.getByText(NOT_FOUND).or(page.getByRole('heading').first()).first()).toBeVisible();
      } else {
        await expect(page.getByText(NOT_FOUND), 'allowed page shows Not found').toHaveCount(0);
        await expect(page.getByRole('heading').first()).toBeVisible();
      }

      if (isMobile) expect(await horizontalOverflow(page), 'horizontal scroll on a phone').toBeLessThanOrEqual(1);
      diagnostics.assertClean();
    });
  }
});
