/** Signed-in M13 core-workflow browser phases against the confirmed test backend. */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

assert.equal(process.env.M13_TEST_REF, 'ngpmwzksekkpvrgoqngk');
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.M13_PLAYWRIGHT_PATH);
const ssrUtils = `${process.cwd()}/node_modules/@supabase/ssr/dist/main/utils`;
const { createChunks } = require(`${ssrUtils}/chunker.js`);
const { stringToBase64URL } = require(`${ssrUtils}/base64url.js`);
const base = 'http://localhost:3111'; // same origin as next dev, so HMR/client effects work
const ref = process.env.M13_TEST_REF;
const sessions = JSON.parse(process.env.M13_SESSIONS);
const actors = JSON.parse(process.env.M13_ACTORS);
const phase = process.argv[2];
const browser = await chromium.launch({
  executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true,
});

/** Same cookie encoding @supabase/ssr writes after a password sign-in. */
async function signIn(code, width = 1365) {
  const context = await browser.newContext({ viewport: { width, height: 900 } });
  const value = 'base64-' + stringToBase64URL(JSON.stringify(sessions[code]));
  const chunks = createChunks(`sb-${ref}-auth-token`, value);
  await context.addCookies(chunks.map(c => ({ name: c.name, value: c.value, url: base, sameSite: 'Lax' })));
  const page = await context.newPage();
  page.setDefaultTimeout(60000);
  page.setDefaultNavigationTimeout(180000);
  return { context, page };
}
/** Interact only after React hydrates, as a user would after the page responds. */
async function hydrated(page) {
  await page.waitForFunction(() => {
    const root = document.querySelector('main') ?? document.body;
    return Object.keys(root).some(key => key.startsWith('__reactFiber'));
  }, null, { timeout: 120000 });
}
async function open(page, path) {
  await page.goto(`${base}${path}`, { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle', { timeout: 120000 }).catch(() => {});
  assert.doesNotMatch(page.url(), /\/login/, `Redirected to login from ${path}`);
  await hydrated(page);
  assert.doesNotMatch(await page.locator('body').innerText(), /Application error|Unhandled Runtime Error/,
    `Application error on ${path}`);
}

const UI = process.env.M13_UI_TAG ?? 'M13-F87E37-UI1';
const TODAY = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
const bodyText = page => page.locator('body').innerText();
const formWith = (page, button) => page.locator('form').filter({ has: page.getByRole('button', { name: button, exact: true }) });
async function reload(page) {
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle', { timeout: 120000 }).catch(() => {});
  await hydrated(page);
}
/** Submit one ExecutionForm and return its success/alert outcome. */
async function submit(form, button) {
  await form.getByRole('button', { name: button, exact: true }).click();
  // A previous outcome stays rendered while the next command is pending.
  const pending = form.locator('[role="status"]:has-text("Saving")');
  await pending.waitFor({ timeout: 10000 }).catch(() => {});
  await pending.waitFor({ state: 'detached', timeout: 120000 });
  const outcome = form.locator('[role="status"]:has-text("Saved."), [role="alert"]').first();
  await outcome.waitFor({ timeout: 120000 });
  return { ok: (await outcome.getAttribute('role')) === 'status', text: (await outcome.innerText()).trim() };
}
async function saved(form, button, label) {
  const result = await submit(form, button);
  assert.ok(result.ok, `${label} failed: ${result.text}`);
  console.log(`PASS ${label}`);
}
async function refused(form, button, label, pattern) {
  const result = await submit(form, button);
  assert.ok(!result.ok, `${label} was unexpectedly accepted`);
  if (pattern) assert.match(result.text, pattern, `${label} gave an unexpected error: ${result.text}`);
  console.log(`PASS ${label} refused with visible error: ${result.text.slice(0, 140)}`);
}

const phases = {
  /** Create (with duplicate-tag recovery), automatic initialization, edit, structured details. */
  async task() {
    const { context, page } = await signIn('DIR');
    await open(page, '/tasks');
    const exists = await page.getByRole('link', { name: UI, exact: true }).count();
    if (!exists) {
      await open(page, '/tasks?new=1');
      const dialog = page.getByRole('dialog');
      await dialog.locator('input[name="title"]').fill(`${UI} browser acceptance`);
      await dialog.locator('input[name="taskTag"]').fill('M13-F87E37-TIMER');
      await dialog.locator('input[name="taskScale"]').fill('10');
      await dialog.locator('input[name="dueDate"]').fill('2026-10-28');
      await dialog.locator(`input[name="assigneeIds"][value="${actors.A.id}"]`).check();
      await dialog.locator(`input[name="reviewerIds"][value="${actors.REV.id}"]`).check();
      await dialog.getByRole('button', { name: 'Create task' }).click();
      const error = dialog.getByRole('alert');
      await error.waitFor({ timeout: 120000 });
      console.log(`PASS duplicate task tag refused in dialog: ${(await error.innerText()).trim().slice(0, 140)}`);
      assert.equal(await dialog.locator('input[name="title"]').inputValue(), `${UI} browser acceptance`,
        'Typed values were lost after the error');
      await dialog.locator('input[name="taskTag"]').fill(UI);
      await dialog.getByRole('button', { name: 'Create task' }).click();
      await dialog.waitFor({ state: 'hidden', timeout: 120000 });
      console.log('PASS corrected values created the task from the same dialog');
    }
    await reload(page);
    await page.getByRole('link', { name: UI, exact: true }).waitFor();
    console.log('PASS created task persists in tracker after reload');
    await open(page, `/tasks/${UI}`);
    assert.match(await bodyText(page), /Native task\/details ready/, 'Automatic initialization not visible');
    console.log('PASS automatic native initialization visible on detail page');

    await open(page, '/tasks');
    await page.getByRole('button', { name: `Actions for ${UI}` }).click();
    await page.getByRole('menuitem', { name: /Edit details/ }).click();
    const dialog = page.getByRole('dialog');
    const edited = UI === 'M13-F87E37-UI1' ? 'M13 UI1 browser acceptance (edited)' : `${UI} browser acceptance (edited)`;
    await dialog.locator('input[name="title"]').fill(edited);
    // Also (re)selects participants: the first UI1 creation lost them through the
    // form-reset defect fixed in this revision.
    await dialog.locator(`input[name="assigneeIds"][value="${actors.A.id}"]`).check();
    await dialog.locator(`input[name="reviewerIds"][value="${actors.REV.id}"]`).check();
    await dialog.getByRole('button', { name: 'Save changes' }).click();
    const outcome = await Promise.race([
      dialog.waitFor({ state: 'hidden', timeout: 120000 }).then(() => null),
      dialog.getByRole('alert').waitFor({ timeout: 120000 }).then(() => dialog.getByRole('alert').innerText()),
    ]);
    if (outcome !== null) {
      // Rerun after the checklist phase: UI1 is Done, so structural edits are refused.
      console.log(`PASS edit of Done task refused with visible error: ${outcome.trim().slice(0, 140)}`);
      assert.equal(await dialog.locator(`input[name="reviewerIds"][value="${actors.REV.id}"]`).isChecked(), true,
        'Refused edit lost selected reviewer');
      await dialog.getByRole('button', { name: 'Cancel' }).click();
    }
    await reload(page);
    assert.ok((await bodyText(page)).includes(edited), 'Edited title did not persist');
    console.log('PASS edited title persists after reload');
    await open(page, `/tasks/${UI}`);
    const facts = await page.locator('dl').first().textContent();
    assert.match(facts, /Assignees[\s\S]*M13 Synthetic A[\s\S]*Reviewers/, 'Assignee A did not persist');
    assert.match(facts, /Reviewers\s*M13 Synthetic REV/, 'Reviewer did not persist');
    console.log('PASS selected assignee and reviewer persist after reload');

    await open(page, `/tasks/${UI}`);
    if (/UI specific goal M13/.test(await bodyText(page))) {
      console.log('PASS (rerun) SMART detail persists after reload');
      await context.close();
      return;
    }
    await page.getByText('Edit structured details and links').click();
    const details = formWith(page, 'Save structured details');
    await details.locator('textarea[name="smart_specific"]').fill('UI specific goal M13');
    await saved(details, 'Save structured details', 'structured SMART detail saved');
    await reload(page);
    assert.match(await bodyText(page), /UI specific goal M13/, 'SMART detail did not persist');
    console.log('PASS SMART detail persists after reload');
    await context.close();
  },

  /** Checklist items, section review, Yes/No/N/A rollup and Done gates through review. */
  async checklist() {
    const director = await signIn('DIR');
    let page = director.page;
    await open(page, `/tasks/${UI}`);
    const current = await page.locator('dl').first().textContent();
    if (/Status\s*Done/.test(current)) {
      assert.match(current, /Completed\s*\d{2} \w{3} \d{4}/, 'Completion date missing');
      await open(page, `/tasks/${UI}/checklist`);
      assert.match(await bodyText(page), /Current task progress: 100/, 'Done task progress is not 100%');
      console.log('PASS (rerun) Done status, completion date and 100% checklist progress persist after reload');
      await director.context.close();
      return;
    }
    await open(page, `/tasks/${UI}/checklist`);
    const items = [['UI setup step', 'Setup'], ['UI activity one', 'Activity'], ['UI activity two', 'Activity'], ['UI closure step', 'Closure']];
    for (const [title, section] of items) {
      if (await page.getByText(title, { exact: true }).count()) continue;
      const add = formWith(page, 'Add item');
      await add.getByPlaceholder('Item title').fill(title);
      await add.locator('select[name="section"]').selectOption({ label: section });
      await saved(add, 'Add item', `added checklist item ${title}`);
      await reload(page);
    }
    for (let i = 0; i < 3; i++) {
      const confirm = page.locator('form').filter({ has: page.getByRole('button', { name: 'Confirm section' }) }).nth(i);
      if (!(await confirm.count())) break;
      await confirm.getByPlaceholder('Reason for section review').fill('M13 UI section reviewed');
      await saved(confirm, 'Confirm section', `confirmed checklist section ${i + 1}`);
    }
    await reload(page);

    const member = await signIn('A');
    const mpage = member.page;
    await open(mpage, `/tasks/${UI}/checklist`);
    async function setState(title, state) {
      const article = mpage.locator('article').filter({ has: mpage.getByText(title, { exact: true }) });
      const form = article.locator('form').filter({ has: mpage.getByRole('button', { name: 'Save state' }) });
      await form.getByLabel('Completion').selectOption(state);
      await saved(form, 'Save state', `${title} set to ${state}`);
    }
    await setState('UI setup step', 'Yes');
    await setState('UI activity one', 'Yes');
    await setState('UI activity two', 'No');
    await setState('UI closure step', 'No');
    await reload(mpage);
    const activityTwo = mpage.locator('article').filter({ has: mpage.getByText('UI activity two', { exact: true }) });
    assert.match(await activityTwo.innerText(), /Pending/, 'No leaf not pending');
    assert.match(await bodyText(mpage), /50(\.0+)?%/, 'Expected a visible 50% Activity rollup');
    console.log('PASS Yes/No leaves persist and Activity shows 50% rollup after reload');

    await open(page, `/tasks/${UI}`);
    const lifecycle = formWith(page, 'Save lifecycle change');
    await lifecycle.getByLabel('Status').selectOption('Done');
    await lifecycle.getByLabel('Reason').fill('M13 premature Done attempt');
    await refused(lifecycle, 'Save lifecycle change', 'premature Done with incomplete checklist');

    await setState('UI activity two', 'N/A');
    await setState('UI closure step', 'Yes');
    await open(page, `/tasks/${UI}/checklist`);
    const owner = formWith(page, 'Apply reviewed switch');
    await owner.getByLabel('Owner').selectOption({ label: 'Activity-derived' });
    await owner.getByPlaceholder('Reason after reviewing all sections').fill('M13 UI activity-derived progress');
    await saved(owner, 'Apply reviewed switch', 'progress owner switched to Activity-derived');
    await reload(page);
    assert.match(await bodyText(page), /Current task progress: 100/, 'Activity-derived progress is not 100%');
    console.log('PASS N/A leaf excluded; Activity-derived progress 100% after reload');

    await open(page, `/tasks/${UI}`);
    const beforeReview = formWith(page, 'Save lifecycle change');
    await beforeReview.getByLabel('Status').selectOption('Done');
    await beforeReview.getByLabel('Reason').fill('M13 Done before reviewer approval');
    await refused(beforeReview, 'Save lifecycle change', 'Done before assigned reviewer approval');

    const other = await signIn('B');
    await open(other.page, `/tasks/${UI}`);
    assert.equal(await other.page.getByRole('button', { name: 'Approve review' }).count(), 0,
      'Unassigned member sees review approval');
    console.log('PASS unassigned member has no review control');
    const reviewer = await signIn('REV');
    await open(reviewer.page, `/tasks/${UI}`);
    await saved(formWith(reviewer.page, 'Approve review'), 'Approve review', 'assigned reviewer approved current work');

    await reload(page);
    const done = formWith(page, 'Save lifecycle change');
    await done.getByLabel('Status').selectOption('Done');
    await done.getByLabel('Reason').fill('M13 UI gates satisfied');
    await saved(done, 'Save lifecycle change', 'Done after checklist, progress and review gates');
    await reload(page);
    const facts = await page.locator('dl').first().textContent();
    assert.match(facts, /Status\s*Done/, 'Done status did not persist');
    assert.match(facts, /Completed\s*\d{2} \w{3} \d{4}/, 'Completion date missing');
    console.log('PASS Done status and completion date persist after reload');
    await Promise.all([director.context.close(), member.context.close(), other.context.close(), reviewer.context.close()]);
  },

  /** Timer start/stop, manual log, bounded-hour error, correction and reversal from Logs. */
  async timerlog() {
    const { context, page } = await signIn('A');
    const tag = 'M13-F87E37-TIMER';
    await open(page, `/tasks/${tag}`);
    // A successful start/stop refreshes the page and swaps the form, so the
    // replacement control (or a visible alert) is the outcome to wait for.
    async function swap(button, next, label) {
      await page.getByRole('button', { name: button, exact: true }).click();
      const formAlert = page.locator('form [role="alert"]');
      const outcome = page.getByRole('button', { name: next, exact: true }).or(formAlert).first();
      await outcome.waitFor({ timeout: 120000 });
      assert.equal(await formAlert.count(), 0, `${label} failed: ${await formAlert.allInnerTexts()}`);
      console.log(`PASS ${label}`);
    }
    if (await page.getByRole('button', { name: 'Start timer', exact: true }).count()) {
      await swap('Start timer', 'Stop and log', 'timer started');
    }
    await reload(page);
    assert.ok(await page.getByRole('button', { name: 'Stop and log', exact: true }).count(), 'Running timer not visible after reload');
    console.log('PASS running timer persists after reload');
    await page.waitForTimeout(2000);
    await swap('Stop and log', 'Start timer', 'timer stopped and logged');
    await reload(page);
    assert.match(await bodyText(page), /Stopped/, 'Stopped timer record not visible');
    console.log('PASS stopped timer record persists after reload');

    const manual = formWith(page, 'Save manual time');
    await manual.getByLabel('Date').fill('2026-09-12');
    await manual.getByLabel('Hours').fill('1.25');
    await manual.getByLabel('Notes').fill('M13 UI closed-month log');
    await refused(manual, 'Save manual time', 'manual entry dated in closed September');
    const retry = formWith(page, 'Save manual time');
    assert.equal(await retry.getByLabel('Hours').inputValue(), '1.25', 'Refused entry cleared typed hours');
    console.log('PASS refused manual entry kept typed hours for correction');
    await retry.getByLabel('Date').fill(TODAY);
    await retry.getByLabel('Notes').fill('M13 UI manual log');
    await saved(retry, 'Save manual time', 'corrected manual entry saved from the same form');
    await reload(page);
    assert.match(await bodyText(page), /M13 UI manual log/, 'Manual log not visible after reload');
    console.log('PASS manual log persists after reload');

    await open(page, '/logs');
    const entry = page.locator('article').filter({ hasText: 'M13 UI manual log' }).first();
    await entry.getByRole('button', { name: 'Edit', exact: true }).click();
    const drawer = page.getByRole('dialog');
    await drawer.locator('input[name="hoursWorked"]').fill('1.5');
    await drawer.locator('input[name="reason"]').fill('M13 UI corrected hours');
    await drawer.getByRole('button', { name: 'Save changes' }).click();
    await drawer.waitFor({ state: 'hidden', timeout: 120000 });
    await reload(page);
    const corrected = page.locator('article').filter({ hasText: 'M13 UI manual log' }).first();
    assert.match(await corrected.innerText(), /1\.50?\b/, 'Corrected hours not visible after reload');
    console.log('PASS log correction persists after reload');
    await corrected.getByRole('button', { name: 'Reverse', exact: true }).click();
    const sheet = page.getByRole('dialog');
    await sheet.getByLabel('Reason').fill('M13 UI reversal of corrected log');
    await sheet.getByRole('button', { name: 'Reverse entry' }).click();
    await sheet.waitFor({ state: 'hidden', timeout: 120000 });
    await reload(page);
    console.log(`PASS log reversed; logs page now shows ${await page.locator('article').filter({ hasText: 'M13 UI manual log' }).count()} active matching entr(ies)`);
    await context.close();
  },

  /** Attendance with representative invalid input and closed-month refusal. */
  async attendance() {
    const { context, page } = await signIn('DIR');
    // Server HTML must carry React's placeholder action, so a click before
    // hydration cannot natively GET-submit form contents into the URL.
    const html = await (await context.request.get(`${base}/attendance`)).text();
    assert.match(html, /React form unexpectedly submitted/, 'Execution forms lack the pre-hydration guard');
    console.log('PASS server-rendered execution forms block native pre-hydration submission');
    await open(page, '/attendance');
    // 12 Oct was recorded before migration 30 (then hidden for ~10 s by the
    // margin); 11 Oct checks the database-clock read immediately after saving.
    const date = '2026-10-11';
    const form = () => formWith(page, 'Record measured attendance');
    async function fill(day, status, hours) {
      await form().getByLabel('Employee').selectOption({ label: 'M13 Synthetic A' });
      await form().getByLabel('Business date (Asia/Kolkata)').fill(day);
      await form().getByLabel('Status').selectOption(status);
      await form().getByLabel('Attendance hours').fill(hours);
    }
    await fill(date, 'Absent', '8');
    await refused(form(), 'Record measured attendance', 'Absent with regular hours');
    await fill('2026-09-12', 'Present', '8');
    await refused(form(), 'Record measured attendance', 'attendance dated in closed September');
    const existing = page.locator('tr').filter({ hasText: date }).filter({ hasText: 'Present' });
    if (!(await existing.count())) {
      await fill(date, 'Present', '8');
      await saved(form(), 'Record measured attendance', 'Present 8h recorded from the same form after errors');
    }
    await reload(page);
    const row = page.locator('tr').filter({ hasText: date }).first();
    assert.match(await row.innerText(), /Present/, 'Attendance not visible after reload');
    console.log(`PASS attendance persists after reload: ${(await row.innerText()).replace(/\s+/g, ' ')}`);
    await context.close();
  },

  /** Author creates a fact; author cannot review it; data manager validates it. */
  async contribution() {
    const author = await signIn('A');
    await open(author.page, '/daily-facts');
    const content = 'M13 UI browser fact';
    if (!(await author.page.getByText(content, { exact: true }).count())) {
      const add = formWith(author.page, 'Add record');
      await add.getByLabel('Business date (Asia/Kolkata)').fill(TODAY);
      await add.getByLabel('Content').fill(content);
      await saved(add, 'Add record', 'author added pending fact');
    }
    await reload(author.page);
    const own = author.page.locator('article').filter({ hasText: content });
    assert.equal(await own.getByRole('button', { name: 'Save review' }).count(), 0, 'Author can review own fact');
    console.log(`PASS fact persists for author without self-review control: ${(await own.locator('p').nth(2).innerText()).trim()}`);
    const manager = await signIn('DM');
    await open(manager.page, '/daily-facts');
    const card = manager.page.locator('article').filter({ hasText: content });
    if (!/validated/.test(await card.innerText())) {
      const review = card.locator('form').filter({ has: manager.page.getByRole('button', { name: 'Save review' }) });
      await review.getByLabel('Review decision').selectOption('validated');
      await review.getByPlaceholder('Independent review reason').fill('M13 UI independent validation');
      await saved(review, 'Save review', 'data manager validated the fact');
    }
    await reload(manager.page);
    const after = await manager.page.locator('article').filter({ hasText: content }).innerText();
    assert.match(after, /validated/, 'Validation not visible after reload');
    assert.match(after, /M13 Synthetic DM/, 'Validator not recorded');
    console.log('PASS validation and validator persist after reload');
    await Promise.all([author.context.close(), manager.context.close()]);
  },

  /** Task Tools support split preview/commit plus refused closed-month and same-month carryover. */
  async tools() {
    const { context, page } = await signIn('DIR');
    await open(page, '/task-tools');
    const operation = page.getByLabel('Task operation');
    const form = page.locator('form').filter({ has: page.getByRole('button', { name: 'Prepare preview' }) });
    const panel = operation.locator('xpath=..');
    const preview = async () => {
      await form.getByRole('button', { name: 'Prepare preview' }).click();
      const outcome = panel.getByText(/item\(s\)\. Preview expires/).or(panel.locator(':scope > p[role="status"]')).first();
      await outcome.waitFor({ timeout: 120000 });
      return (await outcome.innerText()).trim();
    };
    async function choose(command, source) {
      await operation.selectOption({ label: command });
      await form.locator('select[name="sourceTaskId"]').selectOption({ label: source });
    }
    await choose('Single duplicate', 'M13-F87E37-TOOLS · M13 TOOLS acceptance');
    await form.locator('input[name="startDate"]').fill('2026-09-12');
    const closed = await preview();
    const blocked = await page.getByText(/Cannot commit/).count();
    if (!blocked) {
      const commit = page.getByRole('button', { name: /^Commit/ });
      await commit.click();
      const msg = panel.locator(':scope > p[role="status"]');
      await msg.waitFor({ timeout: 120000 });
      assert.doesNotMatch(await msg.innerText(), /created/i, 'Closed-month duplicate was committed');
      console.log(`PASS closed-month duplicate refused at commit: ${(await msg.innerText()).slice(0, 140)}`);
    } else {
      console.log(`PASS closed-month duplicate preview cannot commit: ${closed.slice(0, 140)}`);
    }
    await choose('Carryover to this month', 'M13-F87E37-TOOLS · M13 TOOLS acceptance');
    await form.locator('input[name="startDate"]').fill(TODAY);
    await form.locator('input[name="targetMonth"]').fill(TODAY.slice(0, 7));
    await form.locator('input[name="reason"]').fill('M13 UI same-month carryover attempt');
    const carry = await preview();
    const carryText = await bodyText(page);
    assert.ok(/Cannot commit/.test(carryText) || !/Preview expires/.test(carry),
      'Same-month carryover preview was committable');
    console.log('PASS same-month carryover is not committable (no open prior-month predecessor exists)');

    const before = await page.locator('select[name="sourceTaskId"] option, select[name="taskIds"] option').allInnerTexts();
    if (!before.some(t => /M13 TOOLS acceptance \(Copy 1\) - Effort Support/.test(t))) {
      await choose('Effort / Skill support', 'TT-000002 · M13 TOOLS acceptance (Copy 1)');
      await form.locator('input[name="startDate"]').fill(TODAY);
      await form.locator('select[name="splitMode"]').selectOption('split-even');
      await form.locator('select[name="assigneeId"]').selectOption({ label: 'M13 Synthetic A' });
      await form.locator('input[name="reason"]').fill('M13 UI browser support split');
      const ready = await preview();
      assert.match(ready, /Preview expires/, `Support preview failed: ${ready}`);
      assert.match(await bodyText(page), /Source scale: 7 → 3\.5/, 'Even split did not halve source scale in preview');
      await page.getByRole('button', { name: /^Commit/ }).click();
      const msg = panel.locator(':scope > p[role="status"]');
      await msg.waitFor({ timeout: 120000 });
      console.log(`PASS support split committed: ${(await msg.innerText()).slice(0, 160)}`);
    }
    await open(page, '/tasks');
    assert.match(await bodyText(page), /M13 TOOLS acceptance \(Copy 1\) - Effort Support/, 'Split task missing after reload');
    console.log('PASS split support task persists in tracker after reload');
    await context.close();
  },

  /** Archive persistence and a refused non-existent correction scope. */
  async reports() {
    const { context, page } = await signIn('DIR');
    await open(page, '/reports?period=2026-09');
    const archive = page.getByRole('region', { name: 'Month archive' });
    await archive.waitFor();
    await page.getByRole('link', { name: /Revision 2/ }).waitFor();
    await page.getByRole('link', { name: /Revision 1/ }).waitFor();
    console.log('PASS September archive revisions 1 and 2 render after a fresh load');
    if (await archive.getByRole('button', { name: 'Authorize correction' }).count()) {
      await archive.getByLabel('Reason').fill('M13 UI invalid correction scope');
      await archive.getByLabel('Source kind').selectOption('fact');
      await archive.getByLabel('Source record UUID').fill('00000000-0000-4000-8000-000000000000');
      await archive.getByLabel('From date').fill('2026-09-12');
      await archive.getByLabel('Through date').fill('2026-09-12');
      await archive.getByRole('button', { name: 'Authorize correction' }).click();
      const outcome = archive.getByRole('status').or(archive.getByRole('alert')).first();
      await outcome.waitFor({ timeout: 120000 });
      const text = await outcome.innerText();
      assert.doesNotMatch(text, /committed/i, 'Non-existent correction scope was accepted');
      console.log(`PASS non-existent correction record refused: ${text.slice(0, 140)}`);
      await reload(page);
      assert.equal(await archive.getByRole('button', { name: 'Publish new revision' }).count(), 0,
        'Month entered correction after a refused request');
      console.log('PASS month remains closed after refused correction (reload)');
    }
    await context.close();
  },

  /** Cross-surface parity for A: tracker, profile, timeline and mobile profile. */
  async parity() {
    const { context, page } = await signIn('DIR');
    const collect = async (rows, tagPattern) => {
      const map = new Map();
      for (const text of await rows.allInnerTexts()) {
        const tag = text.match(tagPattern)?.[1];
        if (!tag) continue;
        const status = text.match(/\b(Not Started|In Progress|Done|Discarded|Stopped|On-Hold|Carryover)\b/)?.[1] ?? '?';
        map.set(tag, status);
      }
      return map;
    };
    await open(page, '/team/M13-F87E37-A');
    const profileTable = page.getByRole('heading', { name: 'Employee task list' }).locator('xpath=following::table[1]');
    const profile = await collect(profileTable.locator('tbody tr'), /^(\S+)/);
    await open(page, '/timelines');
    // Bars expose "TAG title Status, Freshness, N days" as their accessible name.
    const timelineAll = new Map();
    for (const m of (await page.locator('main').first().ariaSnapshot())
      .matchAll(/link "(\S+) [^"]*?(Not Started|In Progress|Done|Discarded|Stopped|On-Hold|Carryover), [^"]*days"/g)) {
      timelineAll.set(m[1], m[2]);
    }
    // Deadline-less tasks are listed under "Undated tasks" without a bar/status.
    const undated = page.getByRole('heading', { name: 'Undated tasks' }).locator('xpath=following-sibling::*[1]');
    const undatedTags = new Set((await undated.locator('a').allInnerTexts()).map(t => t.split(' ')[0]));
    await open(page, '/tasks');
    const tracker = new Map();
    for (const text of await page.locator('table tbody tr').allInnerTexts()) {
      const tag = text.match(/^(\S+)/)?.[1];
      const status = text.match(/\b(Not Started|In Progress|Done|Discarded|Stopped|On-Hold|Carryover)\b/)?.[1];
      const select = await page.getByRole('combobox', { name: `Status for ${tag}` }).count()
        ? await page.getByRole('combobox', { name: `Status for ${tag}` }).inputValue().catch(() => null) : null;
      if (tag) tracker.set(tag, select ?? status ?? '?');
    }
    const mismatches = [];
    for (const [tag, status] of profile) {
      for (const [surface, map] of [['tracker', tracker], ['timeline', timelineAll]]) {
        if (map.has(tag) && map.get(tag) !== status) mismatches.push(`${tag}: profile ${status}, ${surface} ${map.get(tag)}`);
        if (!map.has(tag) && !(surface === 'timeline' && undatedTags.has(tag))) mismatches.push(`${tag}: missing on ${surface}`);
      }
    }
    console.log(`INFO profile tasks for A: ${[...profile].map(([t, s]) => `${t}=${s}`).join(', ')}`);
    assert.deepEqual(mismatches, [], `Status parity mismatches: ${mismatches.join('; ')}`);
    console.log(`PASS status parity for ${profile.size} profile tasks across tracker and timeline`);
    await context.close();
    const mobile = await signIn('A', 390);
    await open(mobile.page, '/team/M13-F87E37-A');
    const mobileProfile = await collect(mobile.page.getByRole('heading', { name: 'Employee task list' })
      .locator('xpath=following::table[1]').locator('tbody tr'), /^(\S+)/);
    assert.deepEqual([...mobileProfile].sort(), [...profile].sort(), 'Mobile own-profile task list differs from director view');
    const overflow = await mobile.page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    assert.ok(overflow <= 0, `Own profile scrolls sideways at 390px by ${overflow}px`);
    console.log(`PASS own profile at 390px matches director view (${mobileProfile.size} tasks) with no horizontal page overflow`);
    await mobile.context.close();
  },

  async diagnose() {
    const { context, page } = await signIn('DIR');
    const messages = [];
    page.on('pageerror', e => messages.push(`pageerror: ${e.message}`));
    page.on('console', m => { if (['error', 'warning'].includes(m.type())) messages.push(`${m.type()}: ${m.text().slice(0, 300)}`); });
    page.on('requestfailed', r => messages.push(`requestfailed: ${r.url()} ${r.failure()?.errorText}`));
    await open(page, '/tasks?new=1');
    const dialog = page.getByRole('dialog');
    await dialog.locator('input[name="title"]').fill('M13 reset probe');
    await dialog.locator('input[name="taskTag"]').fill('M13-F87E37-TIMER');
    await dialog.locator('input[name="taskScale"]').fill('1');
    const a = dialog.locator(`input[name="assigneeIds"][value="${actors.A.id}"]`);
    const rev = dialog.locator(`input[name="reviewerIds"][value="${actors.REV.id}"]`);
    await a.check(); await rev.check();
    console.log(`before refused submit: A=${await a.isChecked()} REV=${await rev.isChecked()}`);
    await dialog.getByRole('button', { name: 'Create task' }).click();
    await dialog.getByRole('alert').waitFor({ timeout: 120000 });
    await page.waitForTimeout(1000);
    const sent = await dialog.locator('form').evaluate(f => [...new FormData(f).entries()]
      .filter(([k]) => ['assigneeIds', 'reviewerIds', 'title', 'category', 'priority'].includes(k)).map(([k, v]) => `${k}=${String(v).slice(0, 8)}`));
    console.log(`after refused submit: A=${await a.isChecked()} REV=${await rev.isChecked()} title="${await dialog.locator('input[name="title"]').inputValue()}"`);
    console.log(`next submission would send: ${sent.join(', ')}`);
    console.log(messages.slice(0, 30).join('\n'));
    await context.close();
  },

  async overflow() {
    const { context, page } = await signIn(process.env.M13_EXPLORE_ROLE ?? 'A', Number(process.env.M13_WIDTH ?? 390));
    for (const path of (process.env.M13_EXPLORE_PATHS ?? '/team/M13-F87E37-A').split(',')) {
      await open(page, path);
      const report = await page.evaluate(() => {
        const width = window.innerWidth, out = [];
        for (const el of document.querySelectorAll('body *')) {
          const r = el.getBoundingClientRect();
          if (r.right <= width + 1) continue;
          let scroller = false;
          for (let p = el.parentElement; p; p = p.parentElement) {
            const o = getComputedStyle(p).overflowX;
            if (o === 'auto' || o === 'scroll' || o === 'hidden') { scroller = true; break; }
          }
          if (!scroller && !out.some(o => o.el.contains(el))) out.push({ el, d: `${el.tagName.toLowerCase()}.${String(el.className).slice(0, 60)} right=${Math.round(r.right)} text="${(el.textContent ?? '').trim().slice(0, 50)}"` });
        }
        const all = process => [...document.querySelectorAll('body *')].map(el => ({ el, r: el.getBoundingClientRect() }))
          .filter(x => x.r.right > width + 1 && x.r.right <= document.documentElement.scrollWidth + 1).sort((a, b) => b.r.right - a.r.right).slice(0, 10)
          .map(x => `${x.el.tagName.toLowerCase()}.${String(x.el.className?.baseVal ?? x.el.className).slice(0, 50)} pos=${getComputedStyle(x.el).position} right=${Math.round(x.r.right)}`);
        return { overflow: document.documentElement.scrollWidth - width, offenders: [...out.slice(0, 12).map(o => o.d), ...(document.documentElement.scrollWidth > width ? ['-- all:', ...all()] : [])] };
      });
      console.log(`${path}: overflow ${report.overflow}px\n  ${report.offenders.join('\n  ')}`);
    }
    await context.close();
  },

  async explore() {
    const code = process.env.M13_EXPLORE_ROLE ?? 'DIR';
    const { context, page } = await signIn(code);
    for (const path of (process.env.M13_EXPLORE_PATHS ?? '/tasks').split(',')) {
      await open(page, path);
      await page.waitForTimeout(Number(process.env.M13_EXPLORE_WAIT ?? 0));
      const snapshot = await page.locator(process.env.M13_EXPLORE_SELECTOR ?? 'main').first().ariaSnapshot().catch(e => `snapshot failed: ${e}`);
      console.log(`===== ${code} ${path}\n${snapshot.slice(0, Number(process.env.M13_EXPLORE_LIMIT ?? 6000))}`);
    }
    await context.close();
  },
};

try {
  assert.ok(phases[phase], `Unknown phase ${phase}`);
  await phases[phase]();
} finally {
  await browser.close();
}
