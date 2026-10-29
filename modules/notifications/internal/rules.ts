// PRIVATE (client-safe via client.ts). Pure helpers for the bell.
import type { PushStatusState } from './types';

/**
 * Window event that makes the bell read its count again at once, for example
 * when the Android app receives a phone notification while it is open
 * (modules/mobile). `window.dispatchEvent(new Event(NOTIFICATIONS_CHANGED_EVENT))`.
 */
export const NOTIFICATIONS_CHANGED_EVENT = 'stellar:notifications-changed';

/** "Notifications", "Notifications, 1 unread", "Notifications, 99+ unread", or that the count is unavailable. */
export function bellLabel(unread: number | null, unavailable = false): string {
  if (unavailable) return 'Notifications, count unavailable';
  if (!unread) return 'Notifications';
  return `Notifications, ${unread > 99 ? '99+' : unread} unread`;
}

/** The badge text on the bell: nothing at 0, then the count up to 9, then "9+". */
export function badgeText(unread: number): string | null {
  if (unread <= 0) return null;
  return unread > 9 ? '9+' : String(unread);
}

/** "just now", "5 min ago", "3 h ago", "yesterday", "4 days ago", or the date. */
export function timeAgo(iso: string, now = Date.now()): string {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return '';
  const minutes = Math.max(0, Math.round((now - then) / 60_000));
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days} days ago`;
  return new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short' }).format(new Date(then));
}

/** Only in-app paths are followed from a notification. */
export function safeHref(href: string | null): string | null {
  return href && href.startsWith('/') && !href.startsWith('//') ? href : null;
}

/** The Data checks line for phone notifications: healthy, or what needs attention. */
export function pushHealthLine(state: PushStatusState, now = Date.now()): { attention: boolean; text: string } {
  if (state.status === 'missing') return { attention: true, text: 'Phone notifications need database migration 91.' };
  if (state.status === 'unavailable') return { attention: true, text: 'Phone notification health could not be read. Refresh to try again.' };
  const p = state.push;
  const phones = `${p.devices} ${p.devices === 1 ? 'phone' : 'phones'} registered`;
  if (!p.configured) {
    return {
      attention: true,
      text: `Phone notifications are not switched on yet (${phones}, ${p.waiting} waiting). Add the push secrets and run "Configure phone notifications" in GitHub Actions.`,
    };
  }
  const stuck = p.oldestWaitingAt !== null && now - new Date(p.oldestWaitingAt).getTime() > 15 * 60_000;
  const problems = [
    stuck ? `${p.waiting} waiting (oldest ${timeAgo(p.oldestWaitingAt!, now)})` : null,
    p.failed ? `${p.failed} failed in the last day` : null,
    p.dropped ? `${p.dropped} to phones that no longer accept them (app removed)` : null,
  ].filter(Boolean);
  const sent = `${p.sent} sent in the last day, ${phones}`;
  return problems.length ? { attention: stuck || p.failed > 0, text: `Phone notifications: ${problems.join('; ')}. ${sent}.` } : { attention: false, text: `Phone notifications are working: ${sent}.` };
}
