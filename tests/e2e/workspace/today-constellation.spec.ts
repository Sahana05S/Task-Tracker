import { test, expect } from '../fixtures';

// Today's constellation, read only: the sky renders, a star opens its rows and Escape goes back.
// Runs once per role project when its QA account is configured (tests/e2e/README.md).

test.describe('Today constellation', () => {
  test.beforeEach(({}, testInfo) => {
    const role = String(testInfo.project.metadata.role);
    test.skip(!process.env[`QA_${role.toUpperCase()}_EMAIL`], `no QA ${role} account configured`);
  });

  test('shows the sky and opens a mission from the keyboard', async ({ page, diagnostics }) => {
    await page.goto('/today');
    const sky = page.getByRole('region', { name: 'Mission constellation' });
    const empty = page.getByText(/No open (assigned )?missions/);
    await expect(sky.or(empty).first()).toBeVisible();
    if (await sky.count()) {
      await expect(page.getByRole('list', { name: 'Map key' })).toBeVisible();
      const star = sky.getByRole('button', { name: /^Mission: / }).first();
      await star.focus();
      await page.keyboard.press('Enter');
      await expect(star).toHaveAttribute('aria-expanded', 'true');
      await expect(page).toHaveURL(/[?&]mission=/);
      await page.keyboard.press('Escape');
      await expect(star).toHaveAttribute('aria-expanded', 'false');
    }
    diagnostics.assertClean();
  });
});
