'use client';

import { useEffect, useState } from 'react';

import { isNativeApp } from '@/modules/mobile/internal/native';

/**
 * Renders its children everywhere except inside the Android app, for things
 * that only make sense in a browser (a link back to the public site).
 * Rendered on the server, then removed after mount when the shell is found.
 */
export function BrowserOnly({ children }: { children: React.ReactNode }) {
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    if (isNativeApp()) setHidden(true);
  }, []);
  return hidden ? null : <>{children}</>;
}
