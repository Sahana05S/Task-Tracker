/** Real signed-in archive controls and export scoping against the M13 backend. */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

assert.equal(process.env.M13_TEST_REF, 'ngpmwzksekkpvrgoqngk');
const phase = process.argv[2];
assert.ok(['close', 'authorize', 'revise', 'verify'].includes(phase));
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.M13_PLAYWRIGHT_PATH);
const base = 'http://127.0.0.1:3111';
const browser = await chromium.launch({
  executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  headless: true,
});
async function signIn(code, width = 1365) {
  const context = await browser.newContext({ viewport: { width, height: 900 } });
  const page = await context.newPage();
  await page.goto(`${base}/login`, { waitUntil: 'domcontentloaded' });
  await page.locator('input[name="email"]').fill(process.env[`M13_${code}_EMAIL`]);
  await page.locator('input[name="password"]').fill(process.env[`M13_${code}_PASSWORD`]);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click({ noWaitAfter: true });
  await page.waitForURL(url => !url.pathname.startsWith('/login'), { timeout: 120000 });
  return { context, page };
}
try {
  const director = await signIn('DIR');
  const page = director.page;
  await page.goto(`${base}/reports?period=2026-09`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.getByRole('heading', { name: /Month archive/ }).waitFor({ timeout: 60000 });
  const archive = page.getByRole('region', { name: 'Month archive' });
  if (phase === 'close') {
    await archive.getByLabel('Reason').fill('M13 synthetic incomplete archive');
    await archive.getByRole('button', { name: 'Close month' }).click();
    await archive.getByRole('status').waitFor({ timeout: 90000 });
    const message = await archive.getByRole('status').innerText();
    assert.match(message, /close committed/i, `Close failed: ${message}`);
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 120000 });
    await page.getByRole('link', { name: /Revision 1/ }).waitFor({ timeout: 60000 });
    assert.match(await page.locator('body').innerText(), /Incomplete/);
    console.log('PASS signed-in director closed visibly incomplete September archive');
  } else if (phase === 'authorize') {
    await archive.getByLabel('Reason').fill('M13 bounded September fact correction');
    await archive.getByLabel('Source kind').selectOption('fact');
    await archive.getByLabel('Source record UUID').fill(process.env.M13_FACT_ID);
    await archive.getByLabel('From date').fill('2026-09-12');
    await archive.getByLabel('Through date').fill('2026-09-12');
    await archive.getByRole('button', { name: 'Authorize correction' }).click();
    await archive.getByRole('status').waitFor({ timeout: 90000 });
    assert.match(await archive.getByRole('status').innerText(), /begin correction committed/i);
    console.log('PASS signed-in director opened named-record, exact-date correction');
  } else if (phase === 'revise') {
    await archive.getByLabel('Reason').fill('M13 publish corrected September evidence');
    await archive.getByRole('button', { name: 'Publish new revision' }).click();
    await archive.getByRole('status').waitFor({ timeout: 90000 });
    const message = await archive.getByRole('status').innerText();
    assert.match(message, /revise committed/i, `Revision failed: ${message}`);
    console.log('PASS signed-in director published retained second revision');
  }
  if (phase !== 'revise' && phase !== 'verify') {
    await director.context.close();
  } else {
  const revision = 2;
  const exportUrl = `${base}/api/reports/export?period=2026-09&revision=${revision}&employee=${process.env.M13_A_ID}&format=csv`;
  const managerExport = await director.context.request.get(exportUrl);
  assert.equal(managerExport.status(), 200, 'Director archive export failed');
  assert.match(await managerExport.text(), /incomplete_uncertified/);
  const member = await signIn('A', 390);
  await member.page.goto(`${base}/reports?period=2026-09&revision=${revision}`,
    { waitUntil: 'domcontentloaded', timeout: 120000 });
  await member.page.getByRole('link', { name: new RegExp(`Revision ${revision}`) }).waitFor({ timeout: 60000 });
  assert.doesNotMatch(await member.page.locator('body').innerText(), /Application error/);
  await member.page.goto(`${base}/tasks/M13-F87E37-JOURNEY`,
    { waitUntil: 'domcontentloaded', timeout: 120000 });
  await member.page.getByText('Inspect synthetic site').first().waitFor({ timeout: 60000 });
  await member.page.goto(`${base}/tasks/M13-F87E37-JOURNEY/checklist`,
    { waitUntil: 'domcontentloaded', timeout: 120000 });
  await member.page.getByText('Acceptance steps').first().waitFor({ timeout: 60000 });
  assert.match(await member.page.locator('body').innerText(), /Journey Yes/);
  const own = await member.context.request.get(exportUrl);
  assert.equal(own.status(), 200, 'Employee own archive export failed');
  const other = await signIn('B');
  const denied = await other.context.request.get(exportUrl);
  assert.equal(denied.status(), 403, 'Another member received employee archive export');
  const managerOfData = await signIn('DM');
  const dmDenied = await managerOfData.context.request.get(exportUrl);
  assert.equal(dmDenied.status(), 403, 'Data manager received employee archive export');
  console.log(`PASS signed-in desktop/mobile revision ${revision} and manager/own allowed, other/DM denied CSV export`);
  await Promise.all([director.context.close(), member.context.close(), other.context.close(), managerOfData.context.close()]);
  }
} finally {
  await browser.close();
}
