'use client';

import * as React from 'react';

const SAFETY_MS = 4500;

function dismiss() {
  const root = document.documentElement;
  if (root.getAttribute('data-splash') === 'on') root.setAttribute('data-splash', 'out');
}

/**
 * The splash's only interactive parts: Skip (phones) and Esc (desktop). Either
 * fades the overlay out early; when any fade-out ends the attribute is removed
 * and the overlay is `display: none`. A safety timer does the same in case the
 * page hydrated after the overlay had already faded.
 */
export function SplashControls() {
  React.useEffect(() => {
    const root = document.documentElement;
    if (!root.hasAttribute('data-splash')) return;
    const overlay = document.getElementById('app-splash');
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') dismiss(); };
    const onEnd = (event: AnimationEvent) => { if (event.target === overlay) root.removeAttribute('data-splash'); };
    window.addEventListener('keydown', onKey);
    overlay?.addEventListener('animationend', onEnd);
    const safety = window.setTimeout(() => root.removeAttribute('data-splash'), SAFETY_MS);
    return () => {
      window.removeEventListener('keydown', onKey);
      overlay?.removeEventListener('animationend', onEnd);
      window.clearTimeout(safety);
    };
  }, []);

  return (
    <>
      <button
        type="button"
        onClick={dismiss}
        className="splash-skip press border-border bg-card text-foreground absolute right-4 bottom-[calc(env(safe-area-inset-bottom)+24px)] inline-flex h-11 items-center rounded-full border px-5 text-sm font-medium lg:hidden"
      >
        Skip
      </button>
      <span aria-hidden="true" className="text-muted-foreground absolute bottom-6 hidden text-xs lg:block">
        Press Esc to skip
      </span>
    </>
  );
}
