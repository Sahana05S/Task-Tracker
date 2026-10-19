'use client';

import { useEffect, useRef, useState } from 'react';

import { useReducedMotion } from './use-reduced-motion';

/**
 * A figure that counts up to its value on mount (ease-out, ~0.9 s). The
 * server renders the final value, so the number is right without JavaScript
 * and for anyone who asked for reduced motion.
 */
export function CountUp({ value, places = 0, duration = 900, className }: {
  value: number; places?: number; duration?: number; className?: string;
}) {
  const reduced = useReducedMotion();
  const [shown, setShown] = useState(value);
  const started = useRef(false);
  useEffect(() => {
    if (reduced || started.current || value === 0) { setShown(value); return; }
    started.current = true;
    const from = 0;
    const start = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setShown(from + (value - from) * eased);
      if (t < 1) frame = requestAnimationFrame(tick);
      else setShown(value);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value, duration, reduced]);
  return <span className={className}>{shown.toFixed(places)}</span>;
}
