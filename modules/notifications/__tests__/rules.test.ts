import { describe, expect, it } from 'vitest';

import { badgeText, bellLabel, pushHealthLine, safeHref, timeAgo } from '@/modules/notifications/internal/rules';

describe('notification bell rules', () => {
  it('puts the unread count in the accessible name and the badge', () => {
    expect(bellLabel(null)).toBe('Notifications');
    expect(bellLabel(0)).toBe('Notifications');
    expect(bellLabel(3)).toBe('Notifications, 3 unread');
    expect(bellLabel(140)).toBe('Notifications, 99+ unread');
    expect(bellLabel(null, true)).toBe('Notifications, count unavailable');
    expect(badgeText(0)).toBeNull();
    expect(badgeText(7)).toBe('7');
    expect(badgeText(12)).toBe('9+');
  });

  it('says how long ago in plain words', () => {
    const now = Date.parse('2026-10-22T06:00:00Z');
    expect(timeAgo('2026-10-22T05:59:40Z', now)).toBe('just now');
    expect(timeAgo('2026-10-22T05:15:00Z', now)).toBe('45 min ago');
    expect(timeAgo('2026-10-22T01:00:00Z', now)).toBe('5 h ago');
    expect(timeAgo('2026-10-21T05:00:00Z', now)).toBe('yesterday');
    expect(timeAgo('2026-10-18T06:00:00Z', now)).toBe('4 days ago');
    expect(timeAgo('2026-10-01T06:00:00Z', now)).toBe('1 Oct');
    expect(timeAgo('not a date', now)).toBe('');
  });

  it('follows only in-app links', () => {
    expect(safeHref('/policies')).toBe('/policies');
    expect(safeHref('//evil.test/x')).toBeNull();
    expect(safeHref('https://evil.test')).toBeNull();
    expect(safeHref(null)).toBeNull();
  });
  it('says whether phone notifications reach people', () => {
    const now = Date.parse('2026-10-29T06:00:00Z');
    const push = { configured: true, devices: 4, waiting: 0, oldestWaitingAt: null, sent: 12, failed: 0, dropped: 0, lastSentAt: '2026-10-29T05:59:00Z' };
    expect(pushHealthLine({ status: 'ready', push }, now)).toEqual({ attention: false, text: 'Phone notifications are working: 12 sent in the last day, 4 phones registered.' });
    expect(pushHealthLine({ status: 'ready', push: { ...push, configured: false, devices: 1, waiting: 3 } }, now).text)
      .toBe('Phone notifications are not switched on yet (1 phone registered, 3 waiting). Add the push secrets and run "Configure phone notifications" in GitHub Actions.');
    // A fresh queue is normal; one stuck past 15 minutes is not.
    expect(pushHealthLine({ status: 'ready', push: { ...push, waiting: 2, oldestWaitingAt: '2026-10-29T05:58:00Z' } }, now).attention).toBe(false);
    expect(pushHealthLine({ status: 'ready', push: { ...push, waiting: 2, oldestWaitingAt: '2026-10-29T05:00:00Z', failed: 1 } }, now))
      .toEqual({ attention: true, text: 'Phone notifications: 2 waiting (oldest 1 h ago); 1 failed in the last day. 12 sent in the last day, 4 phones registered.' });
    expect(pushHealthLine({ status: 'missing' }).attention).toBe(true);
  });
});
