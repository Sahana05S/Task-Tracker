'use client';

import * as React from 'react';
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

function remember(next: ChecklistView) {
  try { window.localStorage.setItem(STORAGE_KEY, next); } catch { /* private mode: the URL still carries it */ }
}

/** Puts the view in the address without a server round trip (Next keeps its search params in step). */
function writeView(next: ChecklistView) {
  const url = new URL(window.location.href);
  url.searchParams.set('view', next);
  url.searchParams.delete('cursor');
  window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
}

/**
 * Table | Board | Blocks | Outline over content the server has already
 * rendered for each view, so switching is instant (user report, 28 October
 * 2026: changing views took too long when each one was a new page load). The
 * choice lives in the URL (`?view=`), so a link opens the same view, and is
 * remembered on this device; phones start on Blocks. Only the chosen view is
 * mounted. `between` sits under the switch and above the view (issues, rows
 * that need a phase).
 */
export function ChecklistViewPanes({ view: initial, explicit, panes, between }: {
  view: ChecklistView;
  /** The address named a view; otherwise this device's last choice applies. */
  explicit: boolean;
  panes: Partial<Record<ChecklistView, React.ReactNode>>;
  between?: React.ReactNode;
}) {
  const views = VIEWS.filter((entry) => entry.key in panes);
  const [view, setView] = React.useState<ChecklistView>(initial);
  // A server refresh (after a change) renders the view in the address; follow it.
  const [synced, setSynced] = React.useState(initial);
  if (synced !== initial) {
    setSynced(initial);
    setView(initial);
  }

  React.useEffect(() => {
    if (explicit) return;
    const wanted = remembered() ?? (window.matchMedia('(max-width: 767px)').matches ? 'blocks' : null);
    if (wanted && wanted !== initial && wanted in panes) {
      setView(wanted);
      writeView(wanted);
    }
    // Once, on arrival.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const choose = (next: ChecklistView) => {
    setView(next);
    remember(next);
    writeView(next);
  };

  return (
    <>
      <div className="flex justify-end">
        <div role="group" aria-label="Checklist view" className="bg-muted inline-flex shrink-0 items-center gap-0.5 rounded-xl p-1">
          {views.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              type="button"
              aria-pressed={view === key}
              onClick={() => choose(key)}
              className={cn(
                'text-muted-foreground hover:text-foreground focus-visible:ring-ring inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-sm font-semibold transition-colors outline-none focus-visible:ring-2',
                view === key && 'bg-card text-foreground shadow-(--shadow-card)',
              )}
            >
              <Icon className="size-4" aria-hidden="true" />
              <span className="max-sm:sr-only">{label}</span>
            </button>
          ))}
        </div>
      </div>
      {between}
      {panes[view] ?? panes.table}
    </>
  );
}
