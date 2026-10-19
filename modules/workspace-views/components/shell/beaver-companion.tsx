'use client';

import { useEffect, useState } from 'react';
import { TaskPulseBeaver, type BeaverState } from '@/shared/ui/taskpulse-beaver';

const PREFERENCE = 'taskpulse:beaver-hidden:v1';

/** Inline companion; it never overlays controls or announces routine state changes. */
export function BeaverCompanion({ state = 'neutral', message = 'One small step moves your mission forward.' }: {
  state?: BeaverState; message?: string;
}) {
  const [hidden, setHidden] = useState(true);
  useEffect(() => {
    try { setHidden(window.localStorage.getItem(PREFERENCE) === '1'); }
    catch { setHidden(false); }
  }, []);
  function setPreference(value: boolean) {
    setHidden(value);
    try { window.localStorage.setItem(PREFERENCE, value ? '1' : '0'); } catch { /* Storage may be unavailable; the current preference still works. */ }
  }
  if (hidden) return <button type="button" className="text-muted-foreground hover:text-foreground focus-visible:outline-primary min-h-9 rounded px-2 py-1 text-xs underline underline-offset-4" onClick={() => setPreference(false)}>Show beaver</button>;
  return <aside aria-label="TaskPulse companion" className="flex max-w-sm items-center gap-2">
    <TaskPulseBeaver state={state} size={64} />
    <div className="min-w-0"><p className="text-muted-foreground text-xs leading-relaxed">{message}</p>
      <button type="button" className="text-muted-foreground hover:text-foreground focus-visible:outline-primary mt-1 min-h-9 rounded px-2 py-1 text-xs underline underline-offset-4" onClick={() => setPreference(true)}>Hide beaver</button>
    </div>
  </aside>;
}
