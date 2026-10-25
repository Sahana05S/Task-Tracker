'use client';

import { useEffect } from 'react';

const TYPING_FIELD = 'input:not([type=hidden]):not([type=checkbox]):not([type=radio]):not([type=submit]):not([type=button]):not([type=date]):not([type=time]):not([type=month]):not([readonly]):not([disabled]), textarea:not([readonly]):not([disabled])';

/**
 * When a `<details>` that holds a form is opened ("Add time by hand",
 * "Correct record", "Fill a day"...), puts the cursor in its first field (or
 * the one marked `data-autofocus`), so nobody has to click it after clicking
 * the disclosure. Informational disclosures without a form are left alone.
 * Mounted once by the workspace layout.
 */
export function DisclosureFocus() {
  useEffect(() => {
    const onToggle = (event: Event) => {
      const details = event.target;
      if (!(details instanceof HTMLDetailsElement) || !details.open) return;
      const form = details.querySelector('form');
      if (!form) return;
      const field = form.querySelector<HTMLElement>('[data-autofocus]')
        ?? [...form.querySelectorAll<HTMLElement>(TYPING_FIELD)].find((el) => el.getClientRects().length > 0);
      field?.focus({ preventScroll: true });
    };
    // `toggle` does not bubble; listen in the capture phase.
    document.addEventListener('toggle', onToggle, true);
    return () => document.removeEventListener('toggle', onToggle, true);
  }, []);
  return null;
}
