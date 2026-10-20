import type { Metadata } from 'next';
import Link from 'next/link';

import { getPeopleAdminData } from '@/modules/team';
import { InvitationList, InviteForm, MemberList } from '@/modules/team/components/people-admin';
import { MissionPage, MissionPageHeader } from '@/shared/ui/mission-ui';
import { requireRole } from '@/shared/session/profile';

export const metadata: Metadata = {
  title: 'Manage people · TaskPulse',
};

export default async function ManagePeoplePage() {
  const profile = await requireRole(['managing_director']);
  const data = await getPeopleAdminData();
  const activeCount = data.members.filter((m) => m.isActive).length;

  return (
    <MissionPage>
      <MissionPageHeader
        eyebrow="Team"
        title="Manage people"
        chip={`${activeCount} active`}
        description="Invite people, set their role and remove access. Only invited emails can join."
        actions={
          <Link href="/team" className="text-primary text-sm font-medium hover:underline">
            Back to team
          </Link>
        }
      />
      <InviteForm />
      <InvitationList invitations={data.invitations} />
      <MemberList members={data.members} viewerId={profile.id} />
    </MissionPage>
  );
}
