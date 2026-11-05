'use client';

import * as React from 'react';

/**
 * A sideways-scrolling box that opens centred (user request, 5 November 2026):
 * a wide org chart starts on its top, not on its left edge. Only the first
 * layout is centred; after that the scroll position is the reader's.
 */
export function CenteredScroll({ className, children }: { className?: string; children: React.ReactNode }) {
  const ref = React.useRef<HTMLDivElement>(null);
  React.useLayoutEffect(() => {
    const box = ref.current;
    if (!box) return;
    const overflow = box.scrollWidth - box.clientWidth;
    if (overflow > 0) box.scrollLeft = overflow / 2;
  }, []);
  return <div ref={ref} className={className}>{children}</div>;
}
