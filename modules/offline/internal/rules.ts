// PRIVATE (client-safe via client.ts). Pure rules of the Android app's offline
// mode (M21): what the phone keeps, how fresh it must be and how it is read back.

/** Bumped whenever the stored shape changes; an older snapshot is then ignored. */
export const OFFLINE_SCHEMA_VERSION = 1;

/** The phone refreshes its snapshot at most this often while online. */
export const SNAPSHOT_REFRESH_MS = 15 * 60 * 1000;

/** Bounds of one snapshot, so a member with a huge checklist still gets a usable copy. */
export const SNAPSHOT_LIMITS = { missions: 30, rows: 1500, branchReads: 150, pageSize: 100 } as const;

/** localStorage key of the "Offline mode (beta)" switch; off unless the member turns it on. */
export const OFFLINE_MODE_STORAGE_KEY = 'stellar.offlineMode';
/** Window event the switch dispatches, so OfflineSync applies a change at once. */
export const OFFLINE_MODE_EVENT = 'stellar:offline-mode-changed';

export type OfflineSection = 'setup' | 'activity' | 'closure';
export const OFFLINE_SECTIONS: readonly OfflineSection[] = ['setup', 'activity', 'closure'];

export interface OfflineRow {
  readonly id: string;
  readonly parentNodeId: string | null;
  readonly section: OfflineSection;
  readonly title: string;
  readonly state: 'Yes' | 'No' | 'N/A' | null;
  readonly childCount: number;
  readonly progress: number | null;
  readonly applicable: boolean;
  /** Set on a row linked to another mission (sub-mission); its ticks belong to that mission. */
  readonly linkedTaskTag: string | null;
}

export interface OfflineMission {
  readonly id: string;
  readonly taskTag: string;
  readonly title: string;
  readonly status: string;
  readonly dueDate: string | null;
  readonly progress: number | null;
  /** The mission's lifecycle version when the snapshot was taken (checklist commands compare it). */
  readonly taskVersion: number;
  readonly rows: readonly OfflineRow[];
  /** True when the checklist could not be read or was cut short by the limits. */
  readonly checklistPartial: boolean;
}

export interface OfflineTimer {
  readonly id: string;
  readonly taskId: string;
  readonly taskTag: string;
  readonly taskTitle: string;
  readonly startedAt: string;
  readonly executionVersion: number;
}

export interface OfflineCheckIn {
  readonly capturedAt: string;
  readonly time: string;
}

export interface OfflineSnapshot {
  readonly schemaVersion: number;
  readonly userId: string;
  readonly fullName: string;
  /** Offline grant of migration 97: every entry recorded from this snapshot names it. */
  readonly grantId: string;
  readonly issuedAt: string;
  readonly serverNow: string;
  /** Asia/Kolkata date on the server when the snapshot was taken. */
  readonly kolkataDate: string;
  readonly checkInEnabled: boolean;
  readonly checkIns: { readonly in: OfflineCheckIn | null; readonly out: OfflineCheckIn | null };
  readonly runningTimers: readonly OfflineTimer[];
  readonly missions: readonly OfflineMission[];
  /** True when there were more missions than the snapshot keeps. */
  readonly missionsPartial: boolean;
}

/** What the phone stores: the server's snapshot plus the phone's own clock at receipt. */
export interface StoredSnapshot extends OfflineSnapshot {
  /** Phone clock (ms) when the snapshot arrived. */
  readonly receivedAt: number;
  /** Server clock minus phone clock (ms), measured when the snapshot arrived. */
  readonly clockOffsetMs: number;
}

export function storeSnapshot(snapshot: OfflineSnapshot, receivedAt: number): StoredSnapshot {
  return { ...snapshot, receivedAt, clockOffsetMs: clockOffsetMs(snapshot.serverNow, receivedAt) };
}

/** Server time minus phone time; 0 when the server time cannot be read. */
export function clockOffsetMs(serverNow: string, phoneNow: number): number {
  const server = Date.parse(serverNow);
  return Number.isFinite(server) ? Math.round(server - phoneNow) : 0;
}

/** The phone's clock corrected by the offset measured at the last sync, as an ISO instant. */
export function correctedNow(snapshot: Pick<StoredSnapshot, 'clockOffsetMs'>, phoneNow: number): string {
  return new Date(phoneNow + snapshot.clockOffsetMs).toISOString();
}

export function snapshotIsDue(snapshot: Pick<StoredSnapshot, 'receivedAt'> | null, now: number): boolean {
  return snapshot === null || now - snapshot.receivedAt >= SNAPSHOT_REFRESH_MS || now < snapshot.receivedAt;
}

/** A stored value read back from the phone: this schema and this member, or nothing. */
export function readStoredSnapshot(value: unknown, userId?: string): StoredSnapshot | null {
  if (typeof value !== 'object' || value === null) return null;
  const snapshot = value as Partial<StoredSnapshot>;
  if (snapshot.schemaVersion !== OFFLINE_SCHEMA_VERSION) return null;
  if (typeof snapshot.userId !== 'string' || (userId !== undefined && snapshot.userId !== userId)) return null;
  if (typeof snapshot.receivedAt !== 'number' || !Array.isArray(snapshot.missions)) return null;
  return snapshot as StoredSnapshot;
}

/** The rows directly under a parent (null = top level) in one section, in snapshot order. */
export function childRows(rows: readonly OfflineRow[], section: OfflineSection, parentNodeId: string | null): OfflineRow[] {
  return rows.filter(row => row.section === section && row.parentNodeId === parentNodeId);
}

/** "As of 10:42, 31 Oct" in India time, for the offline page's header. */
export function asOfLabel(receivedAt: number, clockOffsetMs = 0): string {
  const at = new Date(receivedAt + clockOffsetMs);
  const time = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Kolkata' }).format(at);
  const day = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' }).format(at);
  return `As of ${time}, ${day}`;
}

/** "today" when the copy's Kolkata date is the phone's (clock-corrected) Kolkata date, else "31 Oct". */
export function dayLabel(kolkataDate: string, phoneNow: number, clockOffsetMs = 0): string {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date(phoneNow + clockOffsetMs));
  if (kolkataDate === today) return 'today';
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${kolkataDate}T00:00:00Z`));
}

/** The line under the "Offline mode (beta)" switch: what the phone has, or what is missing. */
export function offlineStatusLabel(status: { worker: 'unsupported' | 'none' | 'installing' | 'active'; files: number; savedAt: number | null }, clockOffsetMs = 0): string {
  if (status.worker === 'unsupported') return 'Not available on this phone';
  if (status.worker === 'none') return 'Not ready: setting up';
  if (status.worker === 'installing') return 'Not ready: saving the offline page';
  if (status.files < 2) return 'Not ready: the offline page is incomplete';
  if (status.savedAt === null) return 'Not ready: your missions are not saved yet';
  return `Ready · ${asOfLabel(status.savedAt, clockOffsetMs).replace(/^As of /, 'saved ')} · ${status.files} files`;
}

export function offlineModeOn(stored: string | null): boolean {
  return stored === 'on';
}

const AUTH_COOKIE = /^(sb-[A-Za-z0-9_-]+-auth-token)(?:\.(\d+))?$/;

function base64UrlText(value: string): string {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(value.length / 4) * 4, '=');
  return new TextDecoder().decode(Uint8Array.from(atob(base64), c => c.charCodeAt(0)));
}

/**
 * The member whose Supabase session this browser holds, read from the auth
 * cookie without the network (the offline page has none); null when signed out.
 * Every sign-out path clears that cookie, so an offline copy is shown only while
 * its own member is still the one signed in on this phone.
 */
export function sessionUserIdFromCookies(cookieHeader: string): string | null {
  const chunks = new Map<string, Map<number, string>>();
  for (const part of cookieHeader.split(';')) {
    const at = part.indexOf('=');
    const match = AUTH_COOKIE.exec(part.slice(0, at).trim());
    if (at < 0 || !match) continue;
    const parts = chunks.get(match[1]) ?? new Map<number, string>();
    parts.set(match[2] === undefined ? -1 : Number(match[2]), part.slice(at + 1).trim());
    chunks.set(match[1], parts);
  }
  if (chunks.size !== 1) return null;
  const parts = [...chunks.values()][0];
  const raw = parts.has(-1) ? parts.get(-1)! : [...parts.keys()].sort((a, b) => a - b).map(i => parts.get(i)).join('');
  try {
    const text = decodeURIComponent(raw);
    const session = JSON.parse(text.startsWith('base64-') ? base64UrlText(text.slice(7)) : text) as { user?: { id?: unknown } };
    return typeof session?.user?.id === 'string' && session.user.id !== '' ? session.user.id : null;
  } catch {
    return null;
  }
}
