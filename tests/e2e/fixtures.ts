import { test as base, expect, type Page } from '@playwright/test';

/**
 * Records what went wrong in the browser while a test ran: uncaught page
 * errors, console errors, failed requests and 5xx responses. Everything is
 * attached to the report; `assertClean()` fails the test on any of it.
 */
export interface Diagnostics {
  readonly pageErrors: string[];
  readonly consoleErrors: string[];
  readonly failedRequests: string[];
  readonly serverErrors: string[];
  assertClean(): void;
}

// Noise the app does not control (browser extensions, aborted prefetches on navigation).
const IGNORED_FAILURES = [/net::ERR_ABORTED/, /NS_BINDING_ABORTED/];

function watch(page: Page): Diagnostics {
  const d = {
    pageErrors: [] as string[],
    consoleErrors: [] as string[],
    failedRequests: [] as string[],
    serverErrors: [] as string[],
    assertClean() {
      expect.soft(d.pageErrors, 'uncaught page errors').toEqual([]);
      expect.soft(d.consoleErrors, 'console errors').toEqual([]);
      expect.soft(d.serverErrors, '5xx responses').toEqual([]);
      expect.soft(d.failedRequests, 'failed requests').toEqual([]);
    },
  };
  page.on('pageerror', (error) => d.pageErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') d.consoleErrors.push(message.text());
  });
  page.on('requestfailed', (request) => {
    const reason = request.failure()?.errorText ?? 'failed';
    if (!IGNORED_FAILURES.some((pattern) => pattern.test(reason))) {
      d.failedRequests.push(`${request.method()} ${request.url()} ${reason}`);
    }
  });
  page.on('response', (response) => {
    if (response.status() >= 500) d.serverErrors.push(`${response.status()} ${response.request().method()} ${response.url()}`);
  });
  return d;
}

export const test = base.extend<{ diagnostics: Diagnostics }>({
  diagnostics: async ({ page }, use, testInfo) => {
    const d = watch(page);
    await use(d);
    const log = [
      ['page errors', d.pageErrors],
      ['console errors', d.consoleErrors],
      ['failed requests', d.failedRequests],
      ['5xx responses', d.serverErrors],
    ]
      .map(([name, list]) => `## ${name}\n${(list as string[]).join('\n') || '(none)'}`)
      .join('\n\n');
    await testInfo.attach('browser-diagnostics', { body: log, contentType: 'text/markdown' });
  },
});

export { expect };

/** The page width overflows the viewport (horizontal scroll on a phone). */
export async function horizontalOverflow(page: Page): Promise<number> {
  return page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
}
