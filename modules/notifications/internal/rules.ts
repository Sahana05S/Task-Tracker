// PRIVATE (client-safe via client.ts). Pure helpers for the bell.

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
