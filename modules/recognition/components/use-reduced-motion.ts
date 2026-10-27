'use client';

import { useEffect, useState } from 'react';

export const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

/** True when the OS asks for reduced motion or the viewer switched it off in the app (`data-motion="reduce"` on <html>). */
export function motionReduced(): boolean {
  if (typeof window === 'undefined') return false;
  if (document.documentElement.getAttribute('data-motion') === 'reduce') return true;
  return Boolean(window.matchMedia?.(REDUCED_MOTION_QUERY).matches);
}

/** True when the viewer asked for reduced motion, by the OS setting or the app's own switch. False on the server and first paint. */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const media = window.matchMedia(REDUCED_MOTION_QUERY);
    const update = () => setReduced(motionReduced());
    update();
    media.addEventListener('change', update);
    // The app's switch stamps <html>; watch that attribute too.
    const observer = new MutationObserver(update);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-motion'] });
    return () => { media.removeEventListener('change', update); observer.disconnect(); };
  }, []);
  return reduced;
}
