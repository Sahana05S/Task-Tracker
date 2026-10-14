/** Headless, synthetic-only smoke against a local app pointed at hosted M13. */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const ref = process.env.M13_TEST_REF;
const expected = 'ngpmwzksekkpvrgoqngk';
if (ref !== expected || !process.env.M13_TEST_EMAIL || !process.env.M13_TEST_PASSWORD ||
    !process.env.M13_PLAYWRIGHT_PATH) {
  throw new Error('Explicit isolated M13 project, synthetic login and temporary browser library required');
}
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.M13_PLAYWRIGHT_PATH);
const base = 'http://localhost:3107';
const browser = await chromium.launch({
  executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  headless: true,
});
try {
  const desktop = await browser.newContext({ viewport: { width: 1365, height: 900 } });
  const page = await desktop.newPage();
  await page.goto(`${base}/login`, { waitUntil: 'domcontentloaded' });
  await page.locator('input[name="email"]').fill(process.env.M13_TEST_EMAIL);
  await page.locator('input[name="password"]').fill(process.env.M13_TEST_PASSWORD);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click({ noWaitAfter: true });
  try {
    await page.waitForURL(url => !url.pathname.startsWith('/login'), { timeout: 120000 });
  } catch {
    throw new Error(`Synthetic login did not leave /login; URL ${page.url()}, page ${
      (await page.locator('body').innerText()).slice(0, 500)}`);
  }
  await page.goto(`${base}/tasks`, { waitUntil: 'domcontentloaded' });
  await page.locator('a.task-tag:visible').filter({ hasText: 'M13-F87E37-SHARED' }).first().waitFor({ timeout: 45000 });
  assert.match(await page.locator('body').innerText(), /M13-F87E37-SHARED/);
  console.log('PASS signed-in desktop task list shows synthetic shared task');

  await page.goto(`${base}/tasks/M13-F87E37-SHARED`, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.getByText('M13 Synthetic SHARED').first().waitFor({ timeout: 45000 });
  assert.doesNotMatch(await page.locator('body').innerText(), /Application error/);
  console.log('PASS signed-in desktop task details render');

  await page.goto(`${base}/tasks/M13-F87E37-SHARED/checklist`, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.getByText('Inspection').first().waitFor({ timeout: 45000 });
  assert.doesNotMatch(await page.locator('body').innerText(), /Application error/);
  console.log('PASS signed-in desktop nested checklist renders');

  if (process.argv.includes('--reports')) {
    for (const route of ['dashboard', 'reports']) {
      await page.goto(`${base}/${route}`, { waitUntil: 'domcontentloaded', timeout: 120000 });
      const content = await page.locator('body').innerText();
      assert.match(content, new RegExp(route, 'i'));
      assert.doesNotMatch(content, /Application error/);
      console.log(`PASS signed-in desktop ${route} renders`);
    }
  }

  const mobile = await browser.newContext({
    viewport: { width: 390, height: 844 },
    storageState: await desktop.storageState(),
  });
  const mobilePage = await mobile.newPage();
  await mobilePage.goto(`${base}/tasks`, { waitUntil: 'domcontentloaded' });
  await mobilePage.locator('a.task-tag:visible').filter({ hasText: 'M13-F87E37-SHARED' }).first().waitFor({ timeout: 45000 });
  assert.match(await mobilePage.locator('body').innerText(), /M13-F87E37-SHARED/);
  console.log('PASS signed-in mobile-width task list shows synthetic shared task');
  await mobile.close();
  await desktop.close();
} finally {
  await browser.close();
}
