import type { Metadata } from 'next';

import { MissionPage, MissionPageHeader } from '@/shared/ui/mission-ui';
import { MilestoneBoard } from '@/modules/milestones/components/milestone-board';
import { OrganizationShowcase } from '@/modules/milestones/components/organization-showcase';
import { SchemaNotice } from '@/modules/milestones/components/schema-notice';
import { currentPeriod } from '@/shared/time/period';
import { requireProfile } from '@/shared/session/profile';
import { getMilestonesPageData, summariseMilestones } from '@/modules/milestones';
import { canManageMilestones } from '@/shared/tracker/enums';

export const metadata: Metadata = {
  title: 'Milestones · TaskPulse',
};

/**
 * Organisational vision, mission, values and monthly milestones.
 *
 * All of it is live data from `company_statements` and `company_milestones`, added
 * by `04_milestones_and_vision.sql`. Every authenticated member reads the page;
 * `managing_director` and `project_engineer` additionally get the inline editors,
 * matching the `Leadership can manage …` policies exactly — so what the UI offers
 * and what the database permits cannot drift.
 *
 * `canManage` only decides whether controls render. The Server Actions re-check the
 * role and RLS re-checks it again, because a hidden button is not access control.
 *
 * If the migration has not been applied the route still renders, with a notice
 * naming the file to run. The header stays in place either way, so navigation out
 * of the page keeps working.
 */
export default async function MilestonesPage() {
  const profile = await requireProfile();
  const data = await getMilestonesPageData();

  if (data.status === 'schema-missing') {
    return (
      <MissionPage>
        <MissionPageHeader
          eyebrow="Company"
          title="Vision & milestones"
          description="Setup incomplete"
        />
        <SchemaNotice migration={data.migration} />
      </MissionPage>
    );
  }

  const period = currentPeriod();
  const summary = summariseMilestones(data.milestones);
  const canManage = canManageMilestones(profile.role);

  return (
    <MissionPage>
      <MissionPageHeader
        eyebrow="Company"
        title="Vision & milestones"
        description={`${period.label} · ${summary.achieved} of ${summary.total} milestones achieved`}
      />

      <OrganizationShowcase
        statements={data.statements}
        canManage={canManage}
      />
      <MilestoneBoard
        milestones={data.milestones}
        members={data.members}
        periodLabel={period.label}
        canManage={canManage}
      />
    </MissionPage>
  );
}
