import type { Metadata } from 'next';

import { GuideIndex } from '@/modules/guide/components/guide-pages';

export const metadata: Metadata = { title: 'Guide · TaskPulse' };

export default function GuidePage() {
  return <GuideIndex />;
}
