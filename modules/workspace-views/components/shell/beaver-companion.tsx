'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { TaskPulseBeaver, type BeaverState } from '@/shared/ui/taskpulse-beaver';
import { beaverHint } from './beaver-messages';

const PREFERENCE = 'taskpulse:beaver-hidden:v1';
const SEEN = 'taskpulse:beaver-seen:v1';

function readSeen(): string[] {
  try {
    const seen: unknown = JSON.parse(window.localStorage.getItem(SEEN) ?? '[]');
    return Array.isArray(seen) ? seen.filter((key): key is string => typeof key === 'string') : [];
  }
  catch { return []; }
}

/**
 * Inline companion; it never overlays controls or announces routine state
 * changes. On the first visit to a page it gives that page's hint (from
 * `BEAVER_HINTS`), then its everyday line. The hide switch is remembered.
 */
export function BeaverCompanion({ state = 'neutral', message = 'One small step moves your mission forward.' }: {
  state?: BeaverState; message?: string;
}) {
  const pathname = usePathname();
  // Null until the stored preference is read, so neither state flashes on load.
  const [hidden, setHidden] = useState<boolean | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  useEffect(() => {
    try { setHidden(window.localStorage.getItem(PREFERENCE) === '1'); }
    catch { setHidden(false); }
  }, []);
  useEffect(() => {
    const found = beaverHint(pathname);
    const seen = readSeen();
    if (!found || seen.includes(found.key)) { setHint(null); return; }
    setHint(found.hint);
    try { window.localStorage.setItem(SEEN, JSON.stringify([...seen, found.key])); } catch { /* Without storage the hint shows on every visit. */ }
  }, [pathname]);
  function setPreference(value: boolean) {
    setHidden(value);
    try { window.localStorage.setItem(PREFERENCE, value ? '1' : '0'); } catch { /* Storage may be unavailable; the current preference still works. */ }
  }
  if (hidden === null) return null;
  if (hidden) return <button type="button" className="text-muted-foreground hover:text-foreground focus-visible:outline-primary min-h-9 rounded px-2 py-1 text-xs underline underline-offset-4" onClick={() => setPreference(false)}>Show beaver</button>;
  return <aside aria-label="TaskPulse companion" className="flex max-w-sm items-center gap-2">
    <TaskPulseBeaver state={hint ? 'thinking' : state} size={64} />
    <div className="min-w-0"><p className="text-muted-foreground text-xs leading-relaxed">{hint ?? message}</p>
      <button type="button" className="text-muted-foreground hover:text-foreground focus-visible:outline-primary mt-1 min-h-9 rounded px-2 py-1 text-xs underline underline-offset-4" onClick={() => setPreference(true)}>Hide beaver</button>
    </div>
  </aside>;
}
