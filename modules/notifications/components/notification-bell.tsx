'use client';

import { useCallback, useEffect, useState, useTransition } from 'react';
import Link from 'next/link';
import { BellIcon, CheckCheckIcon } from 'lucide-react';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/shared/ui/dropdown-menu';
import { cn } from '@/shared/utils';

import { markNotificationsReadAction, notificationCountAction, notificationInboxAction } from '@/modules/notifications/actions';
import { badgeText, bellLabel, safeHref, timeAgo, type BellState, type InboxState, type NotificationItem } from '@/modules/notifications/client';

const UNAVAILABLE_COPY = {
  missing: 'Notifications need a database update before they can appear here.',
  unavailable: 'Notifications could not be loaded. Open this menu again to retry.',
} as const;

function Item({ item, onOpen }: { item: NotificationItem; onOpen: (item: NotificationItem) => void }) {
  const unread = item.readAt === null;
  const href = safeHref(item.href);
  const body = (
    <>
      <span aria-hidden="true" className={cn('mt-1.5 size-2 shrink-0 rounded-full', unread ? 'bg-primary' : 'bg-transparent')} />
      <span className="grid min-w-0 gap-0.5">
        <span className={cn('text-foreground text-sm', unread ? 'font-semibold' : 'font-medium')}>{item.title}</span>
        {item.body ? <span className="text-muted-foreground text-xs text-pretty">{item.body}</span> : null}
        <span className="text-muted-foreground text-[11px]">{unread ? 'New · ' : ''}{timeAgo(item.createdAt)}</span>
      </span>
    </>
  );
  return (
    <DropdownMenuItem asChild={Boolean(href)} onSelect={() => onOpen(item)} className="items-start gap-2.5 px-3 py-2.5">
      {href ? <Link href={href}>{body}</Link> : <div>{body}</div>}
    </DropdownMenuItem>
  );
}

/**
 * The top bar's notifications: an unread count on the bell (in its accessible
 * name too) and, when opened, the latest 20 with "Mark all read". The count is
 * read on load and whenever the tab becomes visible again; a failed read says
 * so instead of showing zero.
 */
export function NotificationBell({ className }: { className?: string }) {
  const [bell, setBell] = useState<BellState | null>(null);
  const [inbox, setInbox] = useState<InboxState | null>(null);
  const [loading, startLoading] = useTransition();

  const refreshCount = useCallback(() => {
    notificationCountAction().then(setBell, () => setBell({ status: 'unavailable' }));
  }, []);

  useEffect(() => {
    refreshCount();
    const onVisible = () => { if (document.visibilityState === 'visible') refreshCount(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [refreshCount]);

  function loadInbox() {
    startLoading(async () => {
      const next = await notificationInboxAction().catch((): InboxState => ({ status: 'unavailable' }));
      setInbox(next);
      if (next.status === 'ready') setBell({ status: 'ready', unread: next.unread });
    });
  }

  function markRead(ids: string[] | null) {
    // Optimistic: the list and count update at once; a failure re-reads both.
    const now = new Date().toISOString();
    const newlyRead = ids && inbox?.status === 'ready' ? inbox.items.filter((i) => ids.includes(i.id) && !i.readAt).length : null;
    const after = (count: number) => (newlyRead === null ? 0 : Math.max(0, count - newlyRead));
    setInbox((current) => current?.status === 'ready'
      ? { ...current, unread: after(current.unread),
        items: current.items.map((i) => (ids === null || ids.includes(i.id)) && !i.readAt ? { ...i, readAt: now } : i) }
      : current);
    setBell((current) => current?.status === 'ready' ? { status: 'ready', unread: after(current.unread) } : current);
    markNotificationsReadAction(ids).then((result) => { if (!result.success) loadInbox(); }, loadInbox);
  }

  const unread = bell?.status === 'ready' ? bell.unread : null;
  const badge = unread ? badgeText(unread) : null;
  const items = inbox?.status === 'ready' ? inbox.items : [];

  return (
    <DropdownMenu onOpenChange={(open) => { if (open) loadInbox(); }}>
      <DropdownMenuTrigger aria-label={bellLabel(unread)} className={cn('icon-button relative', className)}>
        <BellIcon className="size-4" aria-hidden="true" />
        {badge ? (
          <span aria-hidden="true"
            className="bg-primary text-primary-foreground absolute -top-0.5 -right-0.5 grid h-4 min-w-4 place-items-center rounded-full px-1 text-[10px] leading-none font-bold tabular-nums ring-2 ring-white">
            {badge}
          </span>
        ) : null}
        {bell && bell.status !== 'ready' ? <span aria-hidden="true" className="bg-attention-foreground/60 absolute top-1 right-1 size-1.5 rounded-full" /> : null}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={8} className="w-[min(22rem,calc(100vw-2rem))] p-0">
        <div className="flex items-center justify-between gap-2 px-3 pt-3 pb-2">
          <DropdownMenuLabel className="text-foreground p-0 text-sm font-semibold">Notifications</DropdownMenuLabel>
          {inbox?.status === 'ready' && inbox.unread > 0 ? (
            <button type="button" onClick={() => markRead(null)}
              className="link inline-flex min-h-8 items-center gap-1 text-xs">
              <CheckCheckIcon className="size-3.5" aria-hidden="true" />Mark all read
            </button>
          ) : null}
        </div>
        <DropdownMenuSeparator className="my-0" />
        <div className="max-h-[min(26rem,70dvh)] overflow-y-auto p-1" aria-busy={loading}>
          {inbox === null || (loading && !items.length) ? (
            <p className="text-muted-foreground px-3 py-4 text-sm">Loading…</p>
          ) : inbox.status !== 'ready' ? (
            <p role="alert" className="text-attention-foreground px-3 py-4 text-sm">{UNAVAILABLE_COPY[inbox.status]}</p>
          ) : !items.length ? (
            <p className="text-muted-foreground px-3 py-6 text-center text-sm">You’re all caught up. Commendations and run problems appear here.</p>
          ) : (
            items.map((item) => <Item key={item.id} item={item} onOpen={(i) => { if (!i.readAt) markRead([i.id]); }} />)
          )}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
