import { defineConfig } from '@playwright/test';
import base from './playwright.config';

// Same suite, but launched with the container's pre-installed Chromium.
export default defineConfig({
  ...base,
  testDir: './tests/e2e',
  outputDir: './test-results',
  use: { ...base.use, launchOptions: { executablePath: '/opt/pw-browsers/chromium' } },
});
