import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { PriorityBadge, StatusBadge } from '@/shared/ui/tracker-badges';
import { TASK_PRIORITIES, TASK_STATUSES } from '@/shared/tracker/enums';

const css = readFileSync(join(process.cwd(), 'app/globals.css'), 'utf8');
const definedClasses = new Set([...css.matchAll(/^\s*\.([a-z0-9-]+)\s*\{/gm)].map(match => match[1]));

/** The badge-* classes a rendered badge carries. */
function badgeClasses(html: string): string[] {
  const value = /class="([^"]*)"/.exec(html)?.[1] ?? '';
  return value.split(/\s+/).filter(name => name.startsWith('badge-'));
}

describe('tracker badges', () => {
  it.each(TASK_STATUSES)('styles the %s status with a class that exists', (status) => {
    const classes = badgeClasses(renderToStaticMarkup(createElement(StatusBadge, { status })));
    expect(classes.length).toBeGreaterThan(1);
    for (const name of classes) expect(definedClasses, `.${name} for ${status}`).toContain(name);
  });

  it.each(TASK_PRIORITIES)('styles the %s priority with a class that exists', (priority) => {
    const classes = badgeClasses(renderToStaticMarkup(createElement(PriorityBadge, { priority })));
    for (const name of classes) expect(definedClasses, `.${name} for ${priority}`).toContain(name);
  });
});
