'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Columns3Icon, LayoutGridIcon, ListTreeIcon, TableIcon } from 'lucide-react';

import { cn } from '@/shared/utils';
import type { ChecklistView } from '../internal/location';

const STORAGE_KEY = 'taskpulse:checklist-view';
const VIEWS: readonly { key: ChecklistView; label: string; icon: typeof TableIcon }[] = [
  { key: 'table', label: 'Table', icon: TableIcon },
  { key: 'board', label: 'Board', icon: Columns3Icon },
  { key: 'blocks', label: 'Blocks', icon: LayoutGridIcon },
  { key: 'outline', label: 'Outline', icon: ListTreeIcon },
];

function remembered(): ChecklistView | null {
  try {
    const value = window.localStorage.getItem(STORAGE_KEY);
    return VIEWS.some((view) => view.key === value) ? value as ChecklistView : null;
  } catch {
    return null;
  }
}

/**
 * Table | Board | Blocks | Outline. The choice lives in the URL (`?view=`), so
 * a link opens the same view, and is remembered on this device; phones start on
 * Blocks. Board needs all three phases, so a page of rows offers the others.
 */
export function ChecklistViewSwitch({ view, views }: { view: ChecklistView; views: readonly ChecklistView[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const explicit = params.get('view');

  const hrefFor = React.useCallback((next: ChecklistView) => {
    const query = new URLSearchParams(params.toString());
    query.set('view', next);
    query.delete('cursor');
    return `${pathname}?${query}`;
  }, [params, pathname]);

  // No view in the address: use this device's last choice, or Blocks on a phone.
  React.useEffect(() => {
    if (explicit) return;
    const wanted = remembered() ?? (window.matchMedia('(max-width: 767px)').matches ? 'blocks' : null);
    if (wanted && wanted !== view && views.includes(wanted)) router.replace(hrefFor(wanted), { scroll: false });
  }, [explicit, view, views, router, hrefFor]);

  const remember = (next: ChecklistView) => {
    try { window.localStorage.setItem(STORAGE_KEY, next); } catch { /* private mode: the URL still carries it */ }
  };

  return (
    <nav aria-label="Checklist view" className="bg-muted inline-flex shrink-0 items-center gap-0.5 rounded-xl p-1">
      {VIEWS.filter((entry) => views.includes(entry.key)).map(({ key, label, icon: Icon }) => (
        <Link
          key={key}
          href={hrefFor(key)}
          scroll={false}
          aria-current={view === key ? 'page' : undefined}
          onClick={() => remember(key)}
          className={cn(
            'text-muted-foreground hover:text-foreground focus-visible:ring-ring inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-sm font-semibold transition-colors outline-none focus-visible:ring-2',
            view === key && 'bg-card text-foreground shadow-(--shadow-card)',
          )}
        >
          <Icon className="size-4" aria-hidden="true" />
          <span className="max-sm:sr-only">{label}</span>
        </Link>
      ))}
    </nav>
  );
}
