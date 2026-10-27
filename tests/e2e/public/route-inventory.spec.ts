import fs from 'node:fs';
import path from 'node:path';

import { test, expect } from '@playwright/test';

import { WORKSPACE_ROUTES } from '../routes';

// Keeps tests/e2e/routes.ts in step with app/(workspace): a new page without
// a crawl entry, or an entry for a deleted page, fails here.

function pages(dir: string, prefix = ''): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (!entry.isDirectory()) return entry.name === 'page.tsx' ? [prefix.replace(/\/$/, '')] : [];
    return pages(path.join(dir, entry.name), `${prefix}${entry.name}/`);
  });
}

test('every workspace page is in the crawl list', ({ isMobile }) => {
  test.skip(isMobile, 'file check; one project is enough');
  const onDisk = pages(path.join(process.cwd(), 'app', '(workspace)')).sort();
  const listed = WORKSPACE_ROUTES.map((route) => route.file).sort();
  expect(listed).toEqual(onDisk);
});
