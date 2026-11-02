import { test, expect } from '../fixtures';

// The phone's offline copy belongs to one member. /offline must never show it to a
// browser that is signed out or signed in as somebody else (fake data only).

const SNAPSHOT = {
  schemaVersion: 1, userId: 'member-a', fullName: 'Alice Fixture', receivedAt: 0, clockOffsetMs: 0,
  serverNow: '2026-11-02T04:30:00.000Z', kolkataDate: '2026-11-02', grantId: 'g', issuedAt: '',
  checkInEnabled: true, checkIns: { in: { capturedAt: '', time: '09:10' }, out: null }, runningTimers: [],
  missions: [{ id: 'm1', taskTag: 'FIX-1', title: 'Fixture private mission', status: 'In progress', dueDate: null,
    progress: 10, taskVersion: 1, rows: [], checklistPartial: false }], missionsPartial: false,
};

async function seed(page: import('@playwright/test').Page) {
  await page.goto('/offline');
  await page.evaluate(snapshot => new Promise<void>((resolve, reject) => {
    const request = indexedDB.open('stellar-offline', 1);
    request.onupgradeneeded = () => { if (!request.result.objectStoreNames.contains('kv')) request.result.createObjectStore('kv'); };
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const tx = request.result.transaction('kv', 'readwrite');
      tx.objectStore('kv').put({ ...snapshot, receivedAt: Date.now() }, 'snapshot');
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    };
  }), SNAPSHOT);
}

async function signInCookie(page: import('@playwright/test').Page, userId: string) {
  const url = new URL(page.url());
  const value = encodeURIComponent(JSON.stringify({ access_token: 'x', user: { id: userId } }));
  await page.context().addCookies([{ name: 'sb-qa-auth-token', value, domain: url.hostname, path: '/' }]);
}

test.describe('offline copy', () => {
  test('is hidden from a signed-out browser', async ({ page }) => {
    await seed(page);
    await page.reload();
    await expect(page.getByText(/no connection/i).first()).toBeVisible();
    await expect(page.getByText('Fixture private mission')).toHaveCount(0);
    await expect(page.getByText(/Alice/)).toHaveCount(0);
  });

  test('is hidden from another signed-in member', async ({ page }) => {
    await seed(page);
    await signInCookie(page, 'member-b');
    await page.reload();
    await expect(page.getByText(/no connection/i).first()).toBeVisible();
    await expect(page.getByText('Fixture private mission')).toHaveCount(0);
  });

  test('is shown to its own member', async ({ page }) => {
    await seed(page);
    await signInCookie(page, 'member-a');
    await page.reload();
    await expect(page.getByText('Fixture private mission')).toBeVisible();
  });
});
