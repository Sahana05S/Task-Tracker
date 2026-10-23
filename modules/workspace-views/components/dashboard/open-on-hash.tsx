'use client';

import { useEffect } from 'react';

/**
 * Opens the collapsed `<details>` with this id when the address points at it
 * (`#calculation-details`), on load and when a link changes the hash, so the
 * links that jump there land on an open section.
 */
export function OpenOnHash({ id }: { id: string }) {
  useEffect(() => {
    const open = () => {
      if (window.location.hash !== `#${id}`) return;
      const element = document.getElementById(id);
      if (element instanceof HTMLDetailsElement && !element.open) {
        element.open = true;
        element.scrollIntoView({ block: 'start' });
      }
    };
    open();
    window.addEventListener('hashchange', open);
    return () => window.removeEventListener('hashchange', open);
  }, [id]);
  return null;
}
