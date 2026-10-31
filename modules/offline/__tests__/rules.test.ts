import { describe, expect, it } from 'vitest';

import {
  asOfLabel,
  childRows,
  clockOffsetMs,
  correctedNow,
  dayLabel,
  OFFLINE_SCHEMA_VERSION,
  offlineStatusLabel,
  readStoredSnapshot,
  SNAPSHOT_REFRESH_MS,
  snapshotIsDue,
  storeSnapshot,
  type OfflineRow,
  type OfflineSnapshot,
} from '@/modules/offline/internal/rules';
import { serviceWorkerSource } from '@/modules/offline/internal/worker-source';

const snapshot: OfflineSnapshot = {
  schemaVersion: OFFLINE_SCHEMA_VERSION,
  userId: 'u1',
  fullName: 'Asha Rao',
  grantId: 'g1',
  issuedAt: '2026-10-31T04:30:00.000Z',
  serverNow: '2026-10-31T04:30:00.000Z',
  kolkataDate: '2026-10-31',
  checkInEnabled: true,
  checkIns: { in: null, out: null },
  runningTimers: [],
  missions: [],
  missionsPartial: false,
};

describe('offline snapshot rules', () => {
  it('measures the phone clock against the server and corrects later times by it', () => {
    const phoneAt = Date.parse('2026-10-31T04:28:00.000Z'); // phone two minutes slow
    const stored = storeSnapshot(snapshot, phoneAt);
    expect(stored.clockOffsetMs).toBe(120_000);
    expect(correctedNow(stored, Date.parse('2026-10-31T05:00:00.000Z'))).toBe('2026-10-31T05:02:00.000Z');
    expect(clockOffsetMs('not a date', phoneAt)).toBe(0);
  });

  it('refreshes after 15 minutes, when missing, or when the phone clock went backwards', () => {
    const stored = storeSnapshot(snapshot, 1_000_000);
    expect(snapshotIsDue(null, 1_000_000)).toBe(true);
    expect(snapshotIsDue(stored, 1_000_000 + SNAPSHOT_REFRESH_MS - 1)).toBe(false);
    expect(snapshotIsDue(stored, 1_000_000 + SNAPSHOT_REFRESH_MS)).toBe(true);
    expect(snapshotIsDue(stored, 999_999)).toBe(true);
  });

  it('reads back only this schema and this member', () => {
    const stored = storeSnapshot(snapshot, 1);
    expect(readStoredSnapshot(stored, 'u1')).toEqual(stored);
    expect(readStoredSnapshot(stored, 'someone else')).toBeNull();
    expect(readStoredSnapshot({ ...stored, schemaVersion: OFFLINE_SCHEMA_VERSION + 1 })).toBeNull();
    expect(readStoredSnapshot('junk')).toBeNull();
  });

  it('lists the rows under one parent in one section', () => {
    const row = (id: string, parentNodeId: string | null, section: OfflineRow['section']): OfflineRow =>
      ({ id, parentNodeId, section, title: id, state: null, childCount: 0, progress: null, applicable: true, linkedTaskTag: null });
    const rows = [row('a', null, 'activity'), row('b', 'a', 'activity'), row('c', null, 'setup')];
    expect(childRows(rows, 'activity', null).map(r => r.id)).toEqual(['a']);
    expect(childRows(rows, 'activity', 'a').map(r => r.id)).toEqual(['b']);
  });

  it('says what the phone is missing for offline use', () => {
    expect(offlineStatusLabel({ worker: 'none', files: 0, savedAt: null })).toBe('Not ready: setting up');
    expect(offlineStatusLabel({ worker: 'active', files: 1, savedAt: null })).toBe('Not ready: the offline page is incomplete');
    expect(offlineStatusLabel({ worker: 'active', files: 17, savedAt: null })).toBe('Not ready: your missions are not saved yet');
    expect(offlineStatusLabel({ worker: 'active', files: 17, savedAt: Date.parse('2026-10-31T04:30:00.000Z') })).toBe('Ready · saved 10:00, 31 Oct · 17 files');
  });

  it('labels the copy in India time', () => {
    expect(asOfLabel(Date.parse('2026-10-31T04:30:00.000Z'))).toBe('As of 10:00, 31 Oct');
    // 19:00 UTC on 31 Oct is already 1 Nov in India.
    expect(dayLabel('2026-11-01', Date.parse('2026-10-31T19:00:00.000Z'))).toBe('today');
    expect(dayLabel('2026-10-31', Date.parse('2026-10-31T19:00:00.000Z'))).toBe('31 Oct');
  });
});

describe('offline service worker source', () => {
  const source = serviceWorkerSource('dpl_abc123');

  it('treats a server error on a page load like no connection', () => {
    expect(source).toContain('if (response.status < 500) return response;');
  });

  it('names its cache after the deploy and never caches data requests', () => {
    expect(source).toContain('"stellar-offline-dpl_abc123"');
    expect(source).toContain("if (request.method !== 'GET') return;");
    expect(source).toContain("if (request.mode !== 'navigate') return;");
  });

  it('parses as JavaScript', () => {
    expect(() => new Function(source)).not.toThrow();
  });

  it('finds the build files the offline page names, in both HTML and flight data', () => {
    const pattern = new Function(`${source.split('\n').find(line => line.startsWith('const STATIC'))}; return STATIC;`)() as RegExp;
    const html = '<script src="/_next/static/chunks/app-1.js"></script> self.__next_f.push("\\"static/chunks/page-2.js\\"") <link href="/_next/static/media/font.woff2">'
      // Production builds (Next 16.4) put files under /_next/static/immutable/.
      + '<script src="/_next/static/immutable/chunks/0l88is54ouli2.js" async></script><link rel="stylesheet" href="/_next/static/immutable/chunks/3wr89ftl9apvm.css">'
      + '<link rel="preload" href="/_next/static/immutable/media/d8aeca813a9ab546-s.p.08ssgmy_tb90r.woff2" as="font">';
    const found = [...html.matchAll(pattern)].map(match => `/_next/${match[0].replace(/^\/?(_next\/)?/, '')}`);
    expect(found).toEqual([
      '/_next/static/chunks/app-1.js', '/_next/static/chunks/page-2.js', '/_next/static/media/font.woff2',
      '/_next/static/immutable/chunks/0l88is54ouli2.js', '/_next/static/immutable/chunks/3wr89ftl9apvm.css',
      '/_next/static/immutable/media/d8aeca813a9ab546-s.p.08ssgmy_tb90r.woff2',
    ]);
  });
});
