'use client';

import { usePathname } from 'next/navigation';

/**
 * Each page arrives section by section (`.page-stagger`, since 28 October
 * 2026): its top-level parts rise in order, 30 ms apart (70 ms until 6 November 2026), instead of the whole
 * page as one block. The wrapper is keyed by the path, so a navigation
 * remounts it and replays the entrance. Query changes (filters, tabs within a
 * page) keep the key and do not animate. Still under reduced motion.
 */
export function PageTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return <div key={pathname} className="page-stagger">{children}</div>;
}
