'use client';

import { useEffect, useState, type CSSProperties } from 'react';

import { REDUCED_MOTION_QUERY, useReducedMotion } from './use-reduced-motion';

/** Violet (primary), gold (recognition) and mint (success) from DESIGN.md. */
const COLOURS = ['#6355e6', '#f5a623', '#10b981'] as const;
const COUNT = 36;
const DURATION_MS = 3200;

interface Piece { left: number; drift: number; delay: number; colour: string; width: number; height: number }

/** A fixed spread, so the burst looks the same on every mount. */
function pieces(): Piece[] {
  return Array.from({ length: COUNT }, (_, i) => ({
    left: (i * 61) % 100,
    drift: ((i * 37) % 90) - 45,
    delay: (i * 83) % 700,
    colour: COLOURS[i % COLOURS.length],
    width: 6 + (i % 3) * 2,
    height: 10 + (i % 4) * 2,
  }));
}

/**
 * A short confetti fall over the parent card (which must be `relative` and
 * `overflow-hidden`). Decorative only: aria-hidden, no pointer events, and it
 * fires once per `id` per browser tab (sessionStorage), so a reload does not
 * replay it. Renders nothing when the viewer prefers reduced motion.
 */
export function ConfettiBurst({ id }: { id: string }) {
  const reduced = useReducedMotion();
  const [active, setActive] = useState(false);

  useEffect(() => {
    // The hook reports false on first paint; ask the browser directly as well.
    if (reduced || typeof window === 'undefined' || window.matchMedia?.(REDUCED_MOTION_QUERY).matches) return;
    const key = `tp.confetti.${id}`;
    try {
      if (window.sessionStorage.getItem(key)) return;
      window.sessionStorage.setItem(key, '1');
    } catch {
      return;
    }
    setActive(true);
    const timer = window.setTimeout(() => setActive(false), DURATION_MS);
    return () => window.clearTimeout(timer);
  }, [id, reduced]);

  if (!active || reduced) return null;
  return (
    <div aria-hidden="true" data-confetti="" className="pointer-events-none absolute inset-0 overflow-hidden">
      {pieces().map((p, i) => (
        <span
          key={i}
          className="anim-confetti absolute top-0 block rounded-[2px]"
          style={{
            left: `${p.left}%`,
            width: p.width,
            height: p.height,
            backgroundColor: p.colour,
            '--x': '0px',
            '--drift': `${p.drift}px`,
            '--delay': `${p.delay}ms`,
          } as CSSProperties}
        />
      ))}
    </div>
  );
}
