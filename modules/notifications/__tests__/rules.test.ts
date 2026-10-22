import { describe, expect, it } from 'vitest';

import { badgeText, bellLabel, safeHref, timeAgo } from '@/modules/notifications/internal/rules';

describe('notification bell rules', () => {
  it('puts the unread count in the accessible name and the badge', () => {
    expect(bellLabel(null)).toBe('Notifications');
    expect(bellLabel(0)).toBe('Notifications');
    expect(bellLabel(3)).toBe('Notifications, 3 unread');
    expect(bellLabel(140)).toBe('Notifications, 99+ unread');
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
});
