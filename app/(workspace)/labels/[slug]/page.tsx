import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { LightbulbIcon, ListChecksIcon, MessageSquareIcon, TriangleAlertIcon } from 'lucide-react';

import { getLabelled, LABEL_COLOUR_CLASS, type LabelledItem } from '@/modules/labels';
import { requireProfile } from '@/shared/session/profile';
import { formatDate } from '@/shared/tracker/format';
import { Breadcrumb } from '@/shared/ui/page-nav';
import { EmptyState, MissionPage, MissionPageHeader, MissionPanel } from '@/shared/ui/mission-ui';
import { cn } from '@/shared/utils';

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  return { title: `#${decodeURIComponent((await params).slug)}` };
}

function href(item: LabelledItem): string {
  if (item.kind === 'task' && item.taskTag) return `/tasks/${encodeURIComponent(item.taskTag)}`;
  if (item.kind === 'mission_learning' && item.taskTag) return `/tasks/${encodeURIComponent(item.taskTag)}?tab=details#learning`;
  return `/meeting-points`;
}

function Item({ item }: { item: LabelledItem }) {
  return (
    <li className="py-2.5 first:pt-0 last:pb-0">
      <Link href={href(item)} className="grid gap-0.5 hover:underline">
        <span className="text-foreground line-clamp-2 text-sm font-medium">
          {item.kind === 'task' && item.taskTag ? <span className="text-muted-foreground mr-1.5 font-mono text-xs">{item.taskTag}</span> : null}
          {item.title || 'Untitled'}
        </span>
        <span className="text-muted-foreground text-xs">
          {[item.kind === 'mission_learning' ? (item.learningKind === 'mistake' ? 'Mistake' : 'Learning') : null,
            item.kind === 'mission_learning' && item.taskTag ? `on ${item.taskTag}` : null,
            item.status, item.date ? formatDate(item.date) : null].filter(Boolean).join(' · ')}
        </span>
      </Link>
    </li>
  );
}

const GROUPS = [
  { kind: 'task', title: 'Missions', icon: ListChecksIcon },
  { kind: 'mission_learning', title: 'Mistakes and learning', icon: LightbulbIcon },
  { kind: 'meeting_point', title: 'Meeting points', icon: MessageSquareIcon },
] as const;

/** One label: the missions, learning notes and meeting points that carry it and the caller may read. */
export default async function LabelPage({ params }: { params: Promise<{ slug: string }> }) {
  await requireProfile();
  const slug = decodeURIComponent((await params).slug);
  const data = await getLabelled(slug);
  if (!data) notFound();
  const { label, items } = data;
  return (
    <MissionPage>
      <MissionPageHeader
        breadcrumb={<Breadcrumb back={{ href: '/labels', label: 'Back to labels' }} items={[{ label: 'Labels', href: '/labels' }, { label: `#${label.name}` }]} />}
        title={`#${label.name}`}
        meta={<span className={cn('badge-soft', LABEL_COLOUR_CLASS[label.colour])}>{label.archived ? 'Archived label' : `${items.length} ${items.length === 1 ? 'record' : 'records'}`}</span>}
        description={label.description ?? undefined}
      />
      {items.length ? (
        <div className="grid gap-6 lg:grid-cols-3">
          {GROUPS.map(({ kind, title, icon }) => {
            const group = items.filter((item) => item.kind === kind);
            return group.length ? (
              <MissionPanel key={kind} icon={kind === 'mission_learning' && group.every((i) => i.learningKind === 'mistake') ? TriangleAlertIcon : icon} title={title} subtitle={`${group.length}`}
                action={kind === 'task' ? <Link href={`/tasks?label=${encodeURIComponent(label.slug)}`} className="link text-xs font-semibold">Open in Missions</Link> : null}>
                <ul className="divide-border grid divide-y">{group.map((item) => <Item key={item.id} item={item} />)}</ul>
              </MissionPanel>
            ) : null;
          })}
        </div>
      ) : <EmptyState>Nothing you can see carries this label yet.</EmptyState>}
    </MissionPage>
  );
}
