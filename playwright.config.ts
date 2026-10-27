import { defineConfig, devices } from '@playwright/test';

/**
 * Browser regression suite (tests/e2e). Vitest owns `__tests__/`.
 *
 * E2E_BASE_URL picks the target; it defaults to a local `next dev`. The
 * `public` projects need no account. The role projects run only when the
 * matching QA_*_EMAIL / QA_*_PASSWORD variables name test accounts (see
 * tests/e2e/README.md); never point them at real people's accounts.
 */
const baseURL = process.env.E2E_BASE_URL ?? 'http://localhost:3000';
const ci = !!process.env.CI;

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: ci,
  retries: ci ? 1 : 0,
  workers: ci ? 2 : undefined,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  // Without E2E_BASE_URL, start the app here (CI builds it; locally an open dev server is reused).
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: ci ? 'npm run build && npm run start' : 'npm run dev',
        url: 'http://localhost:3000/login',
        reuseExistingServer: !ci,
        timeout: 600_000,
      },
  projects: [
    { name: 'public', testMatch: /public\/.*\.spec\.ts/, use: { ...devices['Desktop Chrome'] } },
    { name: 'public-mobile', testMatch: /public\/.*\.spec\.ts/, use: { ...devices['Pixel 7'] } },
    { name: 'setup', testMatch: /auth\.setup\.ts/ },
    {
      name: 'md',
      testMatch: /workspace\/.*\.spec\.ts/,
      dependencies: ['setup'],
      use: { ...devices['Desktop Chrome'], storageState: 'playwright/.auth/md.json' },
      metadata: { role: 'md' },
    },
    {
      name: 'member',
      testMatch: /workspace\/.*\.spec\.ts/,
      dependencies: ['setup'],
      use: { ...devices['Desktop Chrome'], storageState: 'playwright/.auth/member.json' },
      metadata: { role: 'member' },
    },
    {
      name: 'member-mobile',
      testMatch: /workspace\/.*\.spec\.ts/,
      dependencies: ['setup'],
      use: { ...devices['Pixel 7'], storageState: 'playwright/.auth/member.json' },
      metadata: { role: 'member' },
    },
  ],
});
