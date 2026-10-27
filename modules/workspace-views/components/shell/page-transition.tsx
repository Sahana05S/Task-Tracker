'use client';

import { usePathname } from 'next/navigation';

/**
 * Each page arrives with a short rise and fade (`.animate-enter`, 250 ms):
 * the wrapper is keyed by the path, so a navigation remounts it and replays
 * the animation. Query changes (filters, tabs within a page) keep the key and
 * do not animate. Still under reduced motion.
 */
export function PageTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return <div key={pathname} className="animate-enter">{children}</div>;
}
