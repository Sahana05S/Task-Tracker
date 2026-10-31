import type { Metadata } from 'next';

import { OfflineApp } from '@/modules/offline/components/offline-app';

export const metadata: Metadata = { title: 'Offline' };

// Built once per deploy with no cookies or session, so the offline service
// worker can keep it and show it with no connection (M21, Android app only).
export const dynamic = 'force-static';

export default function OfflinePage() {
  return <OfflineApp />;
}
