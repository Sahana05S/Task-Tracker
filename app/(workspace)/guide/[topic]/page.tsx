import { redirect } from 'next/navigation';

import { LEGACY_TOPIC_STAGE } from '@/modules/guide';

/** The guide used to have one page per topic; old links open the matching stage. */
export default async function LegacyGuideTopicRoute({ params }: { params: Promise<{ topic: string }> }) {
  const stage = LEGACY_TOPIC_STAGE[(await params).topic];
  redirect(stage ? `/guide?stage=${stage}` : '/guide');
}
