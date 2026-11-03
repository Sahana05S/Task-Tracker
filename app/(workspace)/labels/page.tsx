import type { Metadata } from 'next';
import Link from 'next/link';
import { HashIcon, InfoIcon } from 'lucide-react';

import { getLabelCatalogue, LABEL_COLOUR_CLASS } from '@/modules/labels';
import { LabelManager } from '@/modules/labels/components/label-manager';
import { requireProfile } from '@/shared/session/profile';
import { EmptyState, MissionNotice, MissionPage, MissionPageHeader, MissionPanel } from '@/shared/ui/mission-ui';
import { cn } from '@/shared/utils';

export const metadata: Metadata = { title: 'Labels' };

/**
 * Labels (migration 112): every label of the company with how many records
 * carry it; each opens /labels/<slug>. The managing director and project
 * engineers also create, rename and archive them here (and in Settings >
 * Company). Labels feed no score.
 */
export default async function LabelsPage() {
  await requireProfile();
  const catalogue = await getLabelCatalogue();
  const open = catalogue?.labels.filter((label) => !label.archived) ?? [];
  return (
    <MissionPage>
      <MissionPageHeader title="Labels" description="Missions, mistakes and learning, and meeting points grouped by label" />
      {catalogue === null ? (
        <MissionNotice icon={InfoIcon}>Labels need the latest database update (migration 112).</MissionNotice>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <MissionPanel icon={HashIcon} title="Browse" subtitle={`${open.length} ${open.length === 1 ? 'label' : 'labels'}`}>
            {open.length ? (
              <ul className="flex flex-wrap gap-2">
                {open.map((label) => (
                  <li key={label.id}>
                    <Link href={`/labels/${encodeURIComponent(label.slug)}`} className={cn('badge-soft py-1 text-xs hover:underline', LABEL_COLOUR_CLASS[label.colour])}>
                      #{label.name}<span className="font-normal opacity-80">{label.uses}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : <EmptyState>No labels yet. Type # on a mission, a learning note or a meeting point to add one.</EmptyState>}
          </MissionPanel>
          {catalogue.canManage ? (
            <MissionPanel icon={HashIcon} title="Manage labels" subtitle="Renaming keeps a label on everything it is on">
              <LabelManager labels={catalogue.labels} />
            </MissionPanel>
          ) : null}
        </div>
      )}
    </MissionPage>
  );
}
