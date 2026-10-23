import type { Metadata } from 'next';

import { guideStage } from '@/modules/guide';
import { GuidePage } from '@/modules/guide/components/guide-page';

export async function generateMetadata({ searchParams }: { searchParams: Promise<{ stage?: string }> }): Promise<Metadata> {
  const stage = guideStage((await searchParams).stage);
  return { title: `${stage.title} · Guide · TaskPulse` };
}

export default async function GuideRoute({ searchParams }: { searchParams: Promise<{ stage?: string }> }) {
  return <GuidePage stage={guideStage((await searchParams).stage)} />;
}
