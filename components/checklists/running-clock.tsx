'use client';
import { useEffect, useState } from 'react';

/** Live h:mm:ss since a timer started. Renders the server value first to avoid hydration drift. */
export function RunningClock({ startedAt }: { startedAt: string }) {
  const start = Date.parse(startedAt);
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);
  if (now === null || Number.isNaN(start)) return <span className="tabular-nums">running</span>;
  const total = Math.max(0, Math.floor((now - start) / 1000));
  const h = Math.floor(total / 3600);
  const m = String(Math.floor((total % 3600) / 60)).padStart(2, '0');
  const s = String(total % 60).padStart(2, '0');
  return <span className="tabular-nums">{h}:{m}:{s}</span>;
}
