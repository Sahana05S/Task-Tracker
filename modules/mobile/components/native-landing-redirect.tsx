'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

import { isNativeApp } from '@/modules/mobile/internal/native';

/**
 * The marketing landing page has no place inside the Android app: a signed-out
 * app goes straight to sign-in. Mounted on `/`; a no-op in a browser.
 *
 * The edge proxy already redirects app requests by their User-Agent marker, so
 * this only matters for shells built before the marker was added.
 */
export function NativeLandingRedirect() {
  const router = useRouter();
  useEffect(() => {
    if (isNativeApp()) router.replace('/login');
  }, [router]);
  return null;
}
