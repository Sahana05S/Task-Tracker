import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ListChecksIcon, MessageSquareIcon, NotebookPenIcon } from 'lucide-react';

import { getLabelled, LABEL_COLOUR_CLASS, labelledNoteGroups, type LabelledItem } from '@/modules/labels';
import { requireProfile } from '@/shared/session/profile';
import { formatDate } from '@/shared/tracker/format';
import { Breadcrumb } from '@/shared/ui/page-nav';
import { EmptyState, MissionPage, MissionPageHeader, MissionPanel } from '@/shared/ui/mission-ui';
import { cn } from '@/shared/utils';

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  return { title: `#${decodeURIComponent((await params).slug)}` };
}

/** The list holding the Quest's row, with that Quest's notes open (migration 132). */
function noteHref(taskTag: string, quest: { nodeId: string | null; listId: string | null; rootList: boolean }): string {
  const base = `/tasks/${encodeURIComponent(taskTag)}/checklist`;
  const notes = quest.nodeId ? `notes=${encodeURIComponent(quest.nodeId)}` : '';
  if (quest.rootList || !quest.listId) return notes ? `${base}?${notes}` : base;
  return `${base}?checklist=${encodeURIComponent(quest.listId)}&section=activity${notes ? `&${notes}` : ''}`;
}

/** Quest notes grouped by mission › Quest (migration 132); each note opens its Quest's notes. */
function NoteGroups({ items }: { items: readonly LabelledItem[] }) {
  return (
    <div className="grid gap-4">
      {labelledNoteGroups(items).map((mission) => (
        <section key={mission.taskTag} aria-label={mission.taskTag} className="grid gap-2">
          <Link href={`/tasks/${encodeURIComponent(mission.taskTag)}`} className="text-foreground font-mono text-xs font-semibold hover:underline">{mission.taskTag}</Link>
          {mission.quests.map((quest) => (
            <div key={quest.nodeId ?? 'mission'} className="border-border grid gap-1 border-l-2 pl-3">
              <Link href={noteHref(mission.taskTag, quest)} className="text-muted-foreground text-xs font-semibold hover:underline">
                {quest.nodeTitle ?? 'The mission'} · {quest.notes.length} {quest.notes.length === 1 ? 'note' : 'notes'}
              </Link>
              <ul className="grid gap-1.5">
                {quest.notes.map((note) => (
                  <li key={note.id}>
                    <Link href={noteHref(mission.taskTag, quest)} className="text-foreground line-clamp-3 text-sm hover:underline">{note.title || 'Untitled'}</Link>
                    {note.date ? <span className="text-muted-foreground block text-xs">{formatDate(note.date)}</span> : null}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </section>
      ))}
    </div>
  );
}

function href(item: LabelledItem): string {
  if (item.kind === 'task' && item.taskTag) return `/tasks/${encodeURIComponent(item.taskTag)}`;
  if (item.kind === 'mission_learning' && item.taskTag) return noteHref(item.taskTag, item);
  // The point itself: Meeting Points opens the period holding its date and scrolls to its card.
  if (item.kind === 'meeting_point') return `/meeting-points${item.date ? `?date=${encodeURIComponent(item.date)}` : ''}#record-${item.id}`;
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
          {[item.kind === 'mission_learning' && item.taskTag ? `on ${item.taskTag}` : null,
            item.kind === 'mission_learning' && item.nodeTitle ? item.nodeTitle : null,
            item.status, item.date ? formatDate(item.date) : null].filter(Boolean).join(' · ')}
        </span>
      </Link>
    </li>
  );
}

const GROUPS = [
  { kind: 'task', title: 'Missions', icon: ListChecksIcon },
  { kind: 'mission_learning', title: 'Notes', icon: NotebookPenIcon },
  { kind: 'meeting_point', title: 'Meeting points', icon: MessageSquareIcon },
] as const;

/** One label: the missions, notes and meeting points that carry it and the caller may read. */
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
              <MissionPanel key={kind} icon={icon} title={title} subtitle={`${group.length}`}
                action={kind === 'task' ? <Link href={`/tasks?label=${encodeURIComponent(label.slug)}`} className="link text-xs font-semibold">Open in Missions</Link> : null}>
                {kind === 'mission_learning' ? <NoteGroups items={group} />
                  : <ul className="divide-border grid divide-y">{group.map((item) => <Item key={item.id} item={item} />)}</ul>}
              </MissionPanel>
            ) : null;
          })}
        </div>
      ) : <EmptyState>Nothing you can see carries this label yet.</EmptyState>}
    </MissionPage>
  );
}
