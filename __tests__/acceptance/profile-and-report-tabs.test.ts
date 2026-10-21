import { createElement } from 'react';
import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { carriedQuery, ProfileHeader } from '@/app/(workspace)/team/[employeeId]/profile-header';
import type { User } from '@/types/tracker';

const employee: User = { id: 'u4', employeeId: 'SRB 04', fullName: 'Kaviya R', email: '', role: 'team_member', isActive: true, createdAt: '', updatedAt: '' };
/** href of the tab marked aria-current="page" (attribute order is React's). */
const currentTab = (html: string) => html.slice(html.indexOf('aria-label="Profile sections"')).match(/<a[^>]*aria-current="page"[^>]*>/)?.[0].match(/href="([^"]+)"/)?.[1];
const render = (current: 'overview' | 'charts' | 'missions' | 'reports', query = '') =>
  renderToStaticMarkup(createElement(ProfileHeader, { employee, current, description: 'October 2026', query, missionCount: 5 }));

describe('profile tabs', () => {
  it('shows Overview, Charts, Missions and Reports with the current tab marked', () => {
    const html = render('charts');
    expect(html).toContain('aria-label="Profile sections"');
    expect(currentTab(html)).toBe('/team/SRB%2004?tab=charts');
    expect(html).toContain('href="/team/SRB%2004"');
    expect(html).toContain('href="/team/SRB%2004?tab=missions"');
    expect(html).toContain('href="/team/SRB%2004/reports"');
    expect(html).toMatch(/Missions<span[^>]*>5<\/span>/);
  });

  it('carries the selected month across tabs and links the daily report', () => {
    const html = render('reports', carriedQuery({ period: '2026-09' }));
    expect(html).toContain('href="/team/SRB%2004?period=2026-09&amp;tab=charts"');
    expect(currentTab(html)).toBe('/team/SRB%2004/reports?period=2026-09');
    expect(html).toContain('href="/reports?member=SRB%2004"');
    expect(carriedQuery({})).toBe('');
  });
});

describe('Reports and profile pages read through modules', () => {
  it('never query the database directly', () => {
    for (const page of ['app/(workspace)/reports/page.tsx', 'app/(workspace)/team/[employeeId]/page.tsx', 'app/(workspace)/team/[employeeId]/reports/page.tsx']) {
      expect(readFileSync(page, 'utf-8')).not.toMatch(/\.(from|rpc)\(/);
    }
  });
});
