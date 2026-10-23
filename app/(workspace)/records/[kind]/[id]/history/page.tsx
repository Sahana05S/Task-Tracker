import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { getRecordHistory, isRecordReference } from '@/modules/records';
import { RecordHistory } from '@/modules/records/components/record-history';
import { requireProfile } from '@/shared/session/profile';
import { MissionPage, MissionPageHeader } from '@/shared/ui/mission-ui';

export const metadata: Metadata = { title: 'Record history' };

/** Every saved revision of one dated record (attendance, fact, idea, …). */
export default async function RecordHistoryPage({ params }: { params: Promise<{ kind: string; id: string }> }) {
  await requireProfile();
  const { kind, id } = await params;
  if (!isRecordReference(kind, id)) notFound();
  const revisions = await getRecordHistory(kind, id);
  return (
    <MissionPage className="max-w-[880px]">
      <MissionPageHeader
        title="Record history"
        description="Every saved version of this record. The date it is about and the time it was saved are kept apart."
      />
      <RecordHistory revisions={revisions} />
    </MissionPage>
  );
}
