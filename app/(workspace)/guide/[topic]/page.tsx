import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { GUIDE_TOPICS, guideTopic } from '@/modules/guide';
import { GuideTopicPage } from '@/modules/guide/components/guide-pages';

export function generateStaticParams() {
  return GUIDE_TOPICS.map(topic => ({ topic: topic.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ topic: string }> }): Promise<Metadata> {
  const topic = guideTopic((await params).topic);
  return { title: `${topic?.title ?? 'Guide'} · Guide · TaskPulse` };
}

export default async function GuideTopicRoute({ params }: { params: Promise<{ topic: string }> }) {
  const topic = guideTopic((await params).topic);
  if (!topic) notFound();
  return <GuideTopicPage topic={topic} />;
}
