import fs from 'node:fs';

import { test as setup, expect } from '@playwright/test';

/**
 * Signs in each QA test account once and saves its session for the role
 * projects. Accounts come from the environment only (QA_MD_EMAIL /
 * QA_MD_PASSWORD, QA_MEMBER_EMAIL / QA_MEMBER_PASSWORD); a role without them
 * is skipped, and so are its tests.
 */
const ROLES = ['md', 'member'] as const;

for (const role of ROLES) {
  setup(`sign in as ${role}`, async ({ page }) => {
    const email = process.env[`QA_${role.toUpperCase()}_EMAIL`];
    const password = process.env[`QA_${role.toUpperCase()}_PASSWORD`];
    const file = `playwright/.auth/${role}.json`;
    fs.mkdirSync('playwright/.auth', { recursive: true });
    if (!email || !password) {
      // An empty state keeps the dependent project loadable; its tests skip themselves.
      fs.writeFileSync(file, JSON.stringify({ cookies: [], origins: [] }));
      setup.skip(true, `QA_${role.toUpperCase()}_EMAIL/PASSWORD not set`);
      return;
    }
    await page.goto('/login');
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Password').fill(password);
    await page.locator('form').getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(page).toHaveURL(/\/today/);
    await page.context().storageState({ path: file });
  });
}
